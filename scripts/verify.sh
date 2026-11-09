#!/usr/bin/env bash
# C15 lane (wave v26.11.8) — verify gate chain (P15 D5 / G6 exit law).
#
#   exit 0  all gates green
#   exit 1  any gate red
#   exit 2  infrastructure error (tool missing, server unreachable)
#   exit 3  loud skip (no FAIL; at least one gate skipped with reason)
#
# No `|| true` anywhere (rg fail-loud law): a missing tool is exit 2,
# never a silent pass. Skips are printed as [SKIP] with a reason.
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

OVERALL=0   # worst classification: 0 green, 3 skip, 2 infra, 1 red
FAILS=0
SKIPS=0

gate_pass() { echo "GATE $1: PASS"; }
gate_fail() { echo "GATE $1: FAIL"; FAILS=$((FAILS+1)); }
gate_skip() { echo "GATE $1: [SKIP] $2"; SKIPS=$((SKIPS+1)); }
gate_infra() { echo "GATE $1: INFRA $2"; INFRA=1; }
INFRA=0

require() {  # tool check — fail-loud, exit 2
    command -v "$1" >/dev/null 2>&1 || {
        echo "GATE $2: INFRA '$1' not on PATH — refusing to fake-pass"
        exit 2
    }
}

require python3 "convention"
require node   "unit"
require bash   "self"

echo "== repop verify chain =="

# --- GATE convention: test file-naming law ---------------------------------
if python3 scripts/test_file_convention_gate.py; then
    gate_pass convention
else
    rc=$?
    if [ "$rc" -eq 2 ]; then gate_infra convention "gate internal error"; else gate_fail convention; fi
fi

# --- GATE unit: vitest unit project (jsdom) --------------------------------
if npx vitest run --project unit --passWithNoTests >/tmp/repop-unit.log 2>&1; then
    gate_pass unit
    tail -3 /tmp/repop-unit.log
else
    rc=$?
    if [ "$rc" -eq 2 ]; then
        gate_infra unit "vitest infra exit"
    else
        gate_fail unit
        tail -20 /tmp/repop-unit.log
    fi
fi

# --- GATE coi-smoke: playwright COI smoke (real header court) --------------
RUN_SMOKE=1
if [ "${REPOP_SKIP_SMOKE:-}" = "1" ]; then
    gate_skip coi-smoke "REPOP_SKIP_SMOKE=1 (operator opt-out)"
    RUN_SMOKE=0
elif ! command -v pnpm >/dev/null 2>&1; then
    gate_infra coi-smoke "pnpm missing"
    RUN_SMOKE=0
fi

if [ "$RUN_SMOKE" -eq 1 ]; then
    if npx playwright install chromium >/tmp/repop-pw-install.log 2>&1; then
        echo "== playwright chromium: install/reuse ok"
    else
        echo "== playwright chromium install failed (see /tmp/repop-pw-install.log)"
    fi
    if pnpm exec playwright test --config playwright.smoke.config.ts playwright/smoke/crossOriginIsolated.smoke.spec.ts >/tmp/repop-smoke.log 2>&1; then
        gate_pass coi-smoke
        tail -3 /tmp/repop-smoke.log
    else
        rc=$?
        if [ "$rc" -eq 2 ]; then
            gate_infra coi-smoke "playwright infra exit"
        else
            gate_fail coi-smoke
            tail -20 /tmp/repop-smoke.log
        fi
    fi
fi

# --- GATE boot-smoke: worker-ready beacon (needs an app surface) -----------
if [ ! -f "$ROOT/index.html" ]; then
    gate_skip boot-smoke "no app surface (root index.html absent) — red-by-design if run; lands with the app composition root"
else
    if pnpm exec playwright test --config playwright.smoke.config.ts playwright/smoke/boot.smoke.spec.ts >/tmp/repop-boot.log 2>&1; then
        gate_pass boot-smoke
    else
        gate_fail boot-smoke
        tail -20 /tmp/repop-boot.log
    fi
fi

# --- classification ---------------------------------------------------------
if [ "$FAILS" -gt 0 ]; then
    OVERALL=1
elif [ "$INFRA" -gt 0 ]; then
    OVERALL=2
elif [ "$SKIPS" -gt 0 ]; then
    OVERALL=3
else
    OVERALL=0
fi

echo "== verify chain: fails=$FAILS skips=$SKIPS infra=$INFRA -> exit $OVERALL"
exit "$OVERALL"
