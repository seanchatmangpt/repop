#!/usr/bin/env bash
# shim_court/sleep_gate_court.sh — sleep-gate non-vacuity court (repop Y4).
#
# Proves scripts/sleep_gate.py is NON-VACUOUS with a real mutation in a
# /tmp sandbox (canonical checkout never touched):
#
#   BASELINE  sha256 a clean synthetic subject in the sandbox.
#   BEFORE    gate passes on the clean subject (exit 0).
#   SHIM      inject an UNCLASSIFIED setTimeout (marked SHIM-COURT).
#   AFTER     gate REFUSES (exit 1) — this flip IS the non-vacuity proof.
#   RESTORE   sha256 equals baseline byte-exact; fail-closed otherwise.
#
# A court that cannot flip is FAIL; a skip is loud ([SKIP] <reason>).
set -euo pipefail
ROOT="$(git -C "$(dirname "$0")/../.." rev-parse --show-toplevel 2>/dev/null || dirname "$(cd "$(dirname "$0")/../.." && pwd)")"
cd "$ROOT"

GATE="scripts/sleep_gate.py"
SANDBOX="$(mktemp -d /tmp/repop-sleep-gate-court.XXXXXX)"
trap 'rm -rf "$SANDBOX"' EXIT

command -v python3 >/dev/null 2>&1 || { echo "[SKIP] python3 not on PATH"; exit 3; }
[ -f "$GATE" ] || { echo "[SKIP] gate missing: $GATE"; exit 3; }

# Sandbox layout: gate at scripts/sleep_gate.py; classes file at the repo
# root (the sandbox gate's REPO = sandbox, CLASSES_PATH = join(REPO, ...)).
mkdir -p "$SANDBOX/scripts/packages/probe"
cp "$GATE" "$SANDBOX/scripts/sleep_gate.py"
python3 - "$SANDBOX/scripts/sleep_gate.py" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read().replace('os.path.join(REPO, "scripts", "sleep_gate_classes.json")',
                           'os.path.join(REPO, "sleep_gate_classes.json")')
open(p, "w").write(s)
PY
printf '{"files": [], "functions": []}\n' > "$SANDBOX/sleep_gate_classes.json"

SUBJECT="$SANDBOX/scripts/packages/probe/probe.ts"
cat > "$SUBJECT" <<'TS'
export function probe(x: number): number {
  return x + 1;
}
TS
sha() { shasum -a 256 "$1" | awk '{print $1}'; }
BASE=$(sha "$SUBJECT")
echo "[court] BASELINE sha256(probe.ts) = $BASE"

# BEFORE: clean file passes.
if ! python3 "$SANDBOX/scripts/sleep_gate.py" "$SANDBOX/scripts/packages" >/dev/null; then
    echo "[SKIP] gate failed on a CLEAN sandbox subject — gate mis-scoped; court cannot run"
    exit 3
fi
echo "[court] BEFORE: gate PASS on clean subject"

# SHIM: unclassified sleep, marked SHIM-COURT.
printf 'setTimeout(() => {}, 50); // SHIM-COURT unclassified sleep injection\n' >> "$SUBJECT"
grep -q 'SHIM-COURT' "$SUBJECT" || { echo "[FAIL:SHIM] injection absent"; exit 1; }
echo "[court] SHIM applied (unclassified setTimeout appended)"

# AFTER: gate must REFUSE (exit 1). The flip is the proof.
rc=0
python3 "$SANDBOX/scripts/sleep_gate.py" "$SANDBOX/scripts/packages" >/dev/null 2>&1 || rc=$?
if [ "$rc" -ne 1 ]; then
    echo "[FAIL:AFTER] gate did not flip under shim (rc=$rc, want 1) — VACUOUS GATE"
    exit 1
fi
echo "[court] AFTER: gate REFUSED (exit 1) — non-vacuous"

# RESTORE: byte-exact vs baseline.
grep -v 'SHIM-COURT' "$SUBJECT" > "$SUBJECT.restored"
mv "$SUBJECT.restored" "$SUBJECT"
ACTUAL=$(sha "$SUBJECT")
if [ "$ACTUAL" != "$BASE" ]; then
    echo "[FAIL:RESTORE] sha256 mismatch: got $ACTUAL, baseline $BASE — CORRUPTED"
    exit 1
fi
echo "[court] RESTORE verified byte-exact (sandbox; canonical checkout untouched)"
echo "[PASS] sleep-gate-court: non-vacuous (BEFORE pass, AFTER flip, restore verified)"
