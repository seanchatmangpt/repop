#!/usr/bin/env python3
"""repop kernel wasm footprint gate (P4, lane C6).

Four legs, each a real exit, fail-closed:
  1. BUILD    cargo build --release --target wasm32-unknown-unknown
  2. EXPORTS  exact export allowlist over the release .wasm
              (wasm-objdump preferred; pure-python section parser fallback;
              loud skip = exit 3 when neither is available)
  3. SIZE     artifact bytes <= budget (128 KiB)
  4. MUTATION rebuild with --cfg repop_drop_version_export into a separate
              target dir; the exports leg MUST then fail, else the gate is
              vacuous (exit 1, VACUOUS GATE)

Usage: python3 scripts/footprint_gate.py [--kernel-dir DIR]
Exits: 0 all legs pass; 1 leg failed; 3 loud skip (exports leg unavailable).
"""
import argparse
import os
import re
import shutil
import subprocess
import sys

REPOP_FUNCS = [
    "repop_abi_version",
    "repop_version",
    "repop_scratch_alloc",
    "repop_scratch_reset",
    "repop_scratch_remaining",
    "repop_solve",
    "repop_receipt_emit",
    "repop_cas_commit",
    "repop_cas_read",
]
STRUCTURAL_EXPORTS = {"memory", "__rust_eh_personality"}
SIZE_BUDGET = 128 * 1024
ARTIFACT = "target/wasm32-unknown-unknown/release/repop_kernel_wasm.wasm"
MUT_TARGET_DIR = "target/footprint-mutation"
ARTIFACT_MUT = "target/footprint-mutation/wasm32-unknown-unknown/release/repop_kernel_wasm.wasm"


def fail(msg):
    print("[FAIL] " + str(msg))
    sys.exit(1)


def run(cmd, env=None):
    p = subprocess.run(cmd, capture_output=True, text=True, env=env)
    return p.returncode, p.stdout + p.stderr


# --- export extraction ------------------------------------------------------

def read_leb(data, pos):
    result = 0
    shift = 0
    while True:
        b = data[pos]
        result |= (b & 0x7F) << shift
        shift += 7
        pos += 1
        if not (b & 0x80):
            return result, pos
        if shift >= 35:
            raise ValueError("bad LEB128")


def exports_via_python(path):
    """Parse the WASM export section (id 7) names directly. None on failure."""
    try:
        with open(path, "rb") as fh:
            data = fh.read()
        if data[:4] != b"\0asm":
            return None
        pos = 8
        while pos < len(data):
            sec_id = data[pos]
            pos += 1
            size, pos = read_leb(data, pos)
            if sec_id == 7:
                count, pos = read_leb(data, pos)
                names = []
                for _ in range(count):
                    ln, pos = read_leb(data, pos)
                    name = data[pos:pos + ln].decode("utf-8", "replace")
                    pos += ln
                    kind = data[pos]
                    pos += 1
                    _, pos = read_leb(data, pos)
                    names.append(name)
                return names
            pos += size
        return []
    except (OSError, IndexError, ValueError):
        return None


def exports_via_objdump(path):
    objdump = shutil.which("wasm-objdump")
    if not objdump:
        return None
    code, out = run([objdump, "-x", path])
    if code != 0:
        return None
    names = []
    in_exports = False
    for line in out.splitlines():
        if line.startswith("Export["):
            in_exports = True
            continue
        if in_exports:
            m = re.search(r'-> "([^"]+)"', line)
            if m:
                names.append(m.group(1))
            elif line and not line[0].isspace():
                in_exports = False
    return names


def get_exports(path):
    names = exports_via_objdump(path)
    if names is not None:
        return names, "wasm-objdump"
    names = exports_via_python(path)
    if names is not None:
        return names, "python-fallback"
    return None, None


def exports_leg(path, expect_ok=True):
    """Check the export allowlist. Returns (ok, detail)."""
    names, how = get_exports(path)
    if names is None:
        return None, "no wasm-objdump and python parse failed"
    missing = [f for f in REPOP_FUNCS if f not in names]
    extras = [n for n in names
              if n not in REPOP_FUNCS and n not in STRUCTURAL_EXPORTS]
    if expect_ok:
        if missing:
            return False, "missing pinned exports: %s" % missing
        if extras:
            return False, "unauthorized extra exports: %s" % extras
        print("[ok] exports: all %d pinned exports present via %s, no extras"
              % (len(REPOP_FUNCS), how))
        return True, how
    else:
        if missing or extras:
            print("[ok] mutation: mutated module fails exports leg (%s) "
                  "-> gate refuses, non-vacuous"
                  % ("missing=%s extras=%s" % (missing, extras)))
            return False, "flipped"
        return True, "mutated module still passes exports check - VACUOUS GATE"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--kernel-dir", default=os.path.dirname(
        os.path.dirname(os.path.abspath(__file__))))
    args = ap.parse_args()
    os.chdir(args.kernel_dir)
    print("[gate] cwd=" + os.getcwd())

    # Leg 1: build
    code, out = run(["cargo", "build", "--release", "--target",
                     "wasm32-unknown-unknown", "-p", "repop-kernel-wasm"])
    if code != 0 or not os.path.exists(ARTIFACT):
        fail("build leg: cargo exit %d, artifact exists=%s\n%s"
             % (code, os.path.exists(ARTIFACT), out[-2000:]))
    size = os.path.getsize(ARTIFACT)
    print("[ok] build: exit 0, artifact %d bytes" % size)

    # Leg 2: exports exact
    ok, detail = exports_leg(ARTIFACT, expect_ok=True)
    if ok is None:
        print("[SKIP] exports leg loud skip (exit 3): " + detail)
        sys.exit(3)
    if not ok:
        fail("exports leg: " + detail)

    # Leg 3: size
    if size > SIZE_BUDGET:
        fail("size leg: %d > budget %d" % (size, SIZE_BUDGET))
    print("[ok] size: %d <= %d" % (size, SIZE_BUDGET))

    # Leg 4: mutation - must flip the exports leg
    env = dict(os.environ)
    env["RUSTFLAGS"] = (env.get("RUSTFLAGS", "") +
                        " --cfg repop_drop_version_export").strip()
    env["CARGO_TARGET_DIR"] = MUT_TARGET_DIR
    code, out = run(["cargo", "build", "--release", "--target",
                     "wasm32-unknown-unknown", "-p", "repop-kernel-wasm"],
                    env=env)
    if code != 0:
        fail("mutation leg: mutated build failed outright (exit %d)\n%s"
             % (code, out[-2000:]))
    ok, detail = exports_leg(ARTIFACT_MUT, expect_ok=False)
    if ok:
        fail("mutation leg: " + detail)
    # cleanup: mutation build root is a lease, delete it
    shutil.rmtree(MUT_TARGET_DIR, ignore_errors=True)

    print("footprint gate: PASS")
    sys.exit(0)


if __name__ == "__main__":
    main()
