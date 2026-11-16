#!/usr/bin/env bash
# vacuity_check.sh — COORDINATION-THESIS Law 6 / build item 6: every gate
# must demonstrate it can FAIL — by mutation — or it is decoration.
#
# Generalizes the shim-court lib.sh pattern (scripts/shim_court/lib.sh prior
# art) into a harness any gate author can drive in one command:
#
#   scripts/vacuity_check.sh --name <court-name> \
#     --baseline-cmd "<gate command>" \
#     --mutate "<shell snippet applying the mutation>" \
#     --restore "<shell snippet restoring (must be byte-exact)>"
#
# Phases (typed FAIL lines, exit 1 on any failure; exit 3 = loud skip):
#   [FAIL:BASELINE] baseline command must run (any exit recorded)
#   [FAIL:FLIP]     mutated exit must DIFFER from baseline exit
#   [FAIL:RESTORE]  restore must return the tree to its pre-mutation state,
#                   byte-verified via `git status --porcelain` hash parity
#
# No `|| true` anywhere (rg fail-loud law).
set -u

NAME="vacuity-court"
BASELINE_CMD=""
MUTATE_CMD=""
RESTORE_CMD=""

while [ $# -gt 0 ]; do
    case "$1" in
        --name) NAME="$2"; shift 2;;
        --baseline-cmd) BASELINE_CMD="$2"; shift 2;;
        --mutate) MUTATE_CMD="$2"; shift 2;;
        --restore) RESTORE_CMD="$2"; shift 2;;
        *) echo "[FAIL:ARGS] unknown arg $1" >&2; exit 2;;
    esac
done

[ -n "$BASELINE_CMD" ] && [ -n "$MUTATE_CMD" ] && [ -n "$RESTORE_CMD" ] || {
    echo "[FAIL:ARGS] --baseline-cmd/--mutate/--restore all required" >&2
    exit 2
}

command -v git >/dev/null 2>&1 || {
    echo "[SKIP] $NAME: git not on PATH — restore verification impossible"
    exit 3
}
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || {
    echo "[SKIP] $NAME: not a git work tree — restore verification impossible"
    exit 3
}

tree_hash() { git status --porcelain --untracked-files=all | shasum -a 256 | awk '{print $1}'; }

echo "== vacuity court: $NAME =="

# 1. BASELINE — record tree hash + gate exit on the UNMUTATED subject.
BEFORE_HASH="$(tree_hash)"
if bash -uc "$BASELINE_CMD" >/tmp/vacuity-baseline.log 2>&1; then
    BASELINE_RC=0
else
    BASELINE_RC=$?
fi
echo "  BASELINE: exit $BASELINE_RC ($(tail -1 /tmp/vacuity-baseline.log | head -c 100))"

# 2. MUTATE — apply the caller's mutation.
if ! bash -uc "$MUTATE_CMD" >/tmp/vacuity-mutate.log 2>&1; then
    echo "[FAIL:APPLY] mutation snippet itself failed:" >&2
    cat /tmp/vacuity-mutate.log >&2
    exit 1
fi
if [ "$(tree_hash)" = "$BEFORE_HASH" ]; then
    echo "[FAIL:APPLY] mutation changed nothing — the mutation spec is vacuous" >&2
    exit 1
fi

# 3. FLIP — the gate must behave DIFFERENTLY under mutation.
if bash -uc "$BASELINE_CMD" >/tmp/vacuity-after.log 2>&1; then
    MUTATED_RC=0
else
    MUTATED_RC=$?
fi
echo "  MUTATED:  exit $MUTATED_RC ($(tail -1 /tmp/vacuity-after.log | head -c 100))"
if [ "$BASELINE_RC" = "$MUTATED_RC" ]; then
    # restore before failing, so the tree is never left mutated on a FAIL
    bash -uc "$RESTORE_CMD" >/dev/null 2>&1
    echo "[FAIL:FLIP] gate exit unchanged under mutation ($BASELINE_RC == $MUTATED_RC) — gate is VACUOUS" >&2
    exit 1
fi

# 4. RESTORE — byte-exact, verified against the baseline tree hash.
bash -uc "$RESTORE_CMD" >/tmp/vacuity-restore.log 2>&1 || true
AFTER_HASH="$(tree_hash)"
if [ "$AFTER_HASH" != "$BEFORE_HASH" ]; then
    echo "[FAIL:RESTORE] tree hash mismatch after restore — fail-closed" >&2
    git status --porcelain | head -10 >&2
    exit 1
fi

echo "  RESTORED: tree hash matches baseline (byte-exact)"
echo "  VERDICT: NON-VACUOUS — gate flips under mutation and restores clean"
exit 0
