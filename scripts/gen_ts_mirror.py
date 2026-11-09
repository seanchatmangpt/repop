#!/usr/bin/env python3
"""gen_ts_mirror.py — generate the TS layout mirror from the Rust layout spec.

Spec grammar (kernel/crates/repop-abi/src/layout_spec.rs, lane C1): frame row
tables are Rust consts named `<FRAME>_FIELDS: [FieldSpec; N]` whose entries
are `FieldSpec { offset: N, width: N, name: "...", kind: FieldKind::X }`.
Pinned constants are parsed from `pub const NAME: u16/u32/usize = <val>;`.

Emits packages/abi/src/generated/layout.ts with a Spec-SHA256 determinism
stamp (NO wall-clock — determinism law R11). Regeneration is byte-identical
for an unchanged spec.

Exit codes (fail-closed):
  0  generated (or --check: byte-identical)
  1  spec missing / unparseable / check drift (names the differing row)
"""
from __future__ import annotations

import hashlib
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SPEC_PATH = REPO / "kernel" / "crates" / "repop-abi" / "src" / "layout_spec.rs"
LIB_PATH = REPO / "kernel" / "crates" / "repop-abi" / "src" / "lib.rs"
OUT_PATH = REPO / "packages" / "abi" / "src" / "generated" / "layout.ts"

FRAME_RE = re.compile(
    r"pub\s+const\s+(\w+)_FIELDS:\s*\[FieldSpec;\s*\d+\]\s*=\s*\[(.*?)\];",
    re.DOTALL,
)
ROW_RE = re.compile(
    r"offset:\s*(\d+)\s*,\s*width:\s*(\d+)\s*,\s*name:\s*\"(\w+)\"\s*,"
    r"\s*kind:\s*FieldKind::(\w+)"
)
CONST_RE = re.compile(r"pub\s+const\s+(\w+):\s*(?:u16|u32|usize)\s*=\s*([^;]+);")

HEADER = """/* DO NOT EDIT — generated from the Rust layout spec.
 *
 * Generator: scripts/gen_ts_mirror.py
 * Source of truth: kernel/crates/repop-abi/src/layout_spec.rs
 * Spec-SHA256: {spec_sha256}
 *
 * All offsets in bytes. All multi-byte scalars are LITTLE-ENDIAN.
 * Every frame is exactly 64 bytes; the FNV-1a32 digest lives at
 * DIGEST_OFFSET over DIGEST_SPAN ([0x00, 0x3C)).
 */
"""


def parse_spec(spec_text: str) -> tuple[list, dict[str, str]]:
    frames: list[tuple[str, list[tuple[str, int, int, str]]]] = []
    for m in FRAME_RE.finditer(spec_text):
        rows = [
            (name, int(off), int(w), kind)
            for off, w, name, kind in ROW_RE.findall(m.group(2))
        ]
        if not rows:
            raise ValueError(f"frame table {m.group(1)}_FIELDS has zero rows")
        frames.append((m.group(1), rows))
    if not frames:
        raise ValueError(
            "layout_spec.rs parsed but zero <FRAME>_FIELDS tables found — "
            "refusing to generate from an empty spec (fail-closed)"
        )
    consts: dict[str, str] = {}
    for name, value in CONST_RE.findall(spec_text):
        value = value.strip()
        consts[name] = value
    return frames, consts


def render(frames, consts: dict[str, str]) -> str:
    parts: list[str] = []
    sha = consts["__SHA256__"]
    parts.append(HEADER.format(spec_sha256=sha))
    parts.append(f'export const SPEC_SHA256 = "{sha}";\n')
    for name in ("FRAME_SIZE", "DIGEST_OFFSET", "DIGEST_SPAN"):
        parts.append(f"export const {name} = {consts[name]};\n")
    for name in ("FNV1A32_OFFSET_BASIS", "FNV1A32_PRIME", "LAYOUT_VERSION",
                 "INTENT_MAGIC", "HYPERPLANE_MAGIC", "RECEIPT_MAGIC",
                 "ALG_ID_KEYED_BLAKE3", "ALG_ID_ML_DSA_65"):
        parts.append(f"export const {name} = {consts[name]};\n")
    # aliases consumed by the codec layer
    parts.append("export const FNV_OFFSET_BASIS = FNV1A32_OFFSET_BASIS;\n")
    parts.append("export const FNV_PRIME = FNV1A32_PRIME;\n")
    parts.append(
        "\n/** Row tuple: [name, offsetBytes, widthBytes, kind]. */\n"
        "export type FieldRow = readonly [\n"
        "  name: string,\n  offset: number,\n  width: number,\n  kind: string,\n];\n"
    )
    for frame, rows in frames:
        parts.append(f"\n/** Projected verbatim from `{frame}_FIELDS` in layout_spec.rs. */\n")
        parts.append(f"export const {frame}_FIELDS: readonly FieldRow[] = [\n")
        for name, off, w, kind in rows:
            parts.append(f'  ["{name}", {off}, {w}, "{kind}"],\n')
        parts.append("];\n")
    return "".join(parts)


def main() -> int:
    if not SPEC_PATH.exists():
        print(
            f"BLOCKED: {SPEC_PATH} not found — Rust layout spec has not "
            "landed. Generation is fail-closed until it exists.",
            file=sys.stderr,
        )
        return 1
    spec_text = SPEC_PATH.read_text()
    lib_text = LIB_PATH.read_text() if LIB_PATH.exists() else ""
    spec_sha256 = hashlib.sha256(spec_text.encode()).hexdigest()
    try:
        frames, consts = parse_spec(spec_text)
        # FNV/size constants live in lib.rs; merge them into the const table.
        for name, value in CONST_RE.findall(lib_text):
            consts.setdefault(name, value.strip())
    except ValueError as e:
        print(f"BLOCKED: {e}", file=sys.stderr)
        return 1
    consts["__SHA256__"] = spec_sha256
    out = render(frames, consts)
    if "--check" in sys.argv:
        current = OUT_PATH.read_text()
        if current != out:
            cur_lines = current.splitlines()
            gen_lines = out.splitlines()
            for line_no, (cur, gen) in enumerate(zip(cur_lines, gen_lines), 1):
                if cur != gen:
                    print(
                        f"DRIFT: {OUT_PATH}:{line_no}: committed={cur!r} "
                        f"regenerated={gen!r}",
                        file=sys.stderr,
                    )
                    return 1
            print(
                f"DRIFT: {OUT_PATH} differs in length (committed "
                f"{len(cur_lines)} lines, regenerated {len(gen_lines)} lines)",
                file=sys.stderr,
            )
            return 1
        print(f"OK: {OUT_PATH} byte-identical to regenerated mirror")
        return 0
    OUT_PATH.write_text(out)
    print(f"OK: wrote {OUT_PATH} (spec sha256 {spec_sha256[:12]}...)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
