#!/usr/bin/env python3
"""verify_parity.py — parity gate: Rust layout spec vs TS mirror (fail-closed).

Asserts all three:
  1. Row-for-row match: every `<FRAME>_FIELDS` row in
     kernel/crates/repop-abi/src/layout_spec.rs must appear identically
     (name, offset, width, kind, order) in the projected table in
     packages/abi/src/generated/layout.ts.
  2. Frame-set parity: no frame table on one side missing from the other.
  3. Spec-SHA256 staleness: the stamp in the generated TS equals the current
     sha256 of layout_spec.rs.

Exit 0 only when all hold; exit 1 naming the differing row otherwise.
"""
from __future__ import annotations

import hashlib
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SPEC_PATH = REPO / "kernel" / "crates" / "repop-abi" / "src" / "layout_spec.rs"
TS_PATH = REPO / "packages" / "abi" / "src" / "generated" / "layout.ts"
FIXTURE_PATH = REPO / "scripts" / "parity_fixture.json"
# Staleness pin (C2b): sha256 of scripts/parity_fixture.json as emitted by
# kernel/crates/repop-abi/tests/golden_fixture.rs (REPOP_EMIT_FIXTURE=1).
# Rotates only atomically with a re-emitted fixture; a drift here means the
# fixture was regenerated (or hand-edited) without re-pinning.
FIXTURE_SHA256 = "6b6019929cafa4bf73eef5be3cfc3cdd0ce1c3384cf875a8e4bbd0479044f602"

FRAME_RE = re.compile(
    r"pub\s+const\s+(\w+)_FIELDS:\s*\[FieldSpec;\s*\d+\]\s*=\s*\[(.*?)\];",
    re.DOTALL,
)
ROW_RE = re.compile(
    r"offset:\s*(\d+)\s*,\s*width:\s*(\d+)\s*,\s*name:\s*\"(\w+)\"\s*,"
    r"\s*kind:\s*FieldKind::(\w+)"
)
TS_ROW_RE = re.compile(r'\[\s*"(\w+)"\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*"(\w+)"\s*\]')
SHA_RE = re.compile(r"Spec-SHA256:\s*([0-9a-f]{64})")


def parse_rust(spec_text: str) -> list[tuple[str, list[tuple[str, int, int, str]]]]:
    frames = []
    for m in FRAME_RE.finditer(spec_text):
        rows = [
            (name, int(off), int(w), kind)
            for off, w, name, kind in ROW_RE.findall(m.group(2))
        ]
        if rows:
            frames.append((m.group(1), rows))
    if not frames:
        raise ValueError("zero <FRAME>_FIELDS tables parsed from layout_spec.rs")
    return frames


def parse_ts(ts_text: str) -> dict[str, list[tuple[str, int, int, str]]]:
    frames: dict[str, list[tuple[str, int, int, str]]] = {}
    for m in re.finditer(
        r"export const (\w+)_FIELDS: readonly FieldRow\[\] = \[(.*?)\n\];",
        ts_text,
        re.DOTALL,
    ):
        rows = [
            (n, int(o), int(w), k) for n, o, w, k in TS_ROW_RE.findall(m.group(2))
        ]
        if rows:
            frames[m.group(1)] = rows
    if not frames:
        raise ValueError("zero projected _FIELDS tables parsed from layout.ts")
    return frames


def main() -> int:
    if not SPEC_PATH.exists():
        print(
            "PARITY FAIL (fail-closed): "
            f"{SPEC_PATH} not found — parity cannot be asserted against a "
            "missing source of truth.",
            file=sys.stderr,
        )
        return 1
    spec_text = SPEC_PATH.read_text()
    try:
        ts_text = TS_PATH.read_text()
    except FileNotFoundError:
        print(f"PARITY FAIL: TS mirror missing at {TS_PATH}", file=sys.stderr)
        return 1

    try:
        rust_frames = parse_rust(spec_text)
        ts_frames = parse_ts(ts_text)
    except ValueError as e:
        print(f"PARITY FAIL (unparseable): {e}", file=sys.stderr)
        return 1

    drift = False

    # 1 + 2. row-for-row + frame-set parity
    rust_names = {name for name, _ in rust_frames}
    for rust_name, rust_rows in rust_frames:
        if rust_name not in ts_frames:
            print(
                f"PARITY FAIL: frame table {rust_name} present in Rust spec, "
                "missing from TS mirror",
                file=sys.stderr,
            )
            drift = True
            continue
        ts_rows = ts_frames[rust_name]
        if len(ts_rows) != len(rust_rows):
            print(
                f"PARITY FAIL: frame {rust_name} row count mismatch "
                f"(rust={len(rust_rows)}, ts={len(ts_rows)})",
                file=sys.stderr,
            )
            drift = True
            continue
        for idx, (r_row, t_row) in enumerate(zip(rust_rows, ts_rows)):
            if r_row != t_row:
                print(
                    f"PARITY FAIL: frame {rust_name} row {idx} differs — "
                    f"rust={r_row} ts={t_row}",
                    file=sys.stderr,
                )
                drift = True
    for ts_name in ts_frames:
        if ts_name not in rust_names:
            print(
                f"PARITY FAIL: frame table {ts_name} present in TS mirror, "
                "absent from Rust spec",
                file=sys.stderr,
            )
            drift = True

    # 3. Spec-SHA256 staleness
    spec_sha256 = hashlib.sha256(spec_text.encode()).hexdigest()
    m = SHA_RE.search(ts_text)
    if m is None:
        print(
            "PARITY FAIL: TS mirror carries no Spec-SHA256 stamp — staleness "
            "cannot be asserted",
            file=sys.stderr,
        )
        drift = True
    elif m.group(1) != spec_sha256:
        print(
            f"PARITY FAIL: Spec-SHA256 stale — layout_spec.rs is "
            f"{spec_sha256[:12]}... but the TS mirror stamp is "
            f"{m.group(1)[:12]}... (spec changed after mirror was written)",
            file=sys.stderr,
        )
        drift = True

    if drift:
        return 1

    # 4. Golden-fixture staleness pin (C2b cross-language leg).
    if not FIXTURE_PATH.exists():
        print(
            "PARITY FAIL (fail-closed): "
            f"{FIXTURE_PATH} missing — cross-language golden-byte leg "
            "unassertable; re-emit with "
            "REPOP_EMIT_FIXTURE=1 cargo test -p repop-abi",
            file=sys.stderr,
        )
        return 1
    fixture_sha256 = hashlib.sha256(FIXTURE_PATH.read_bytes()).hexdigest()
    if fixture_sha256 != FIXTURE_SHA256:
        print(
            "PARITY FAIL: fixture sha256 stale — "
            f"parity_fixture.json is {fixture_sha256[:12]}... but the pin is "
            f"{FIXTURE_SHA256[:12]}... (fixture regenerated or hand-edited "
            "without re-pinning)",
            file=sys.stderr,
        )
        drift = True

    if drift:
        return 1
    print(
        f"PARITY OK: {len(rust_frames)} frame tables row-for-row "
        f"({sum(len(r) for _, r in rust_frames)} rows), Spec-SHA256 "
        f"{spec_sha256[:12]}... fresh"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
