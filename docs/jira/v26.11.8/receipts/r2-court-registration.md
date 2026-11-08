# R2 Court Registration Bundle Receipt

Standing: PARTIAL_ALIVE

Date: 2026-11-08. Lane R2 (court-registration prep). Write scope: `/Users/sac/repop`
only; `/Users/sac/ggen-marketplace` untouched (read-only lane). Pack name verified
byte-exact against `/Users/sac/repop/packs/cgap-popcorn-aoq` (pack.toml:
`cgap-popcorn-aoq` v0.1.0); refusal codes verified against
`ggen-marketplace:scripts/marketplace.py:42` (`GATE_SOURCE_SUFFIXES = {.rq,.py,.sh}`)
and `:378` (`GATE_SOURCE_EXTENSION`); witness-checker filename verified byte-exact
against `/Users/sac/ggen-marketplace/scripts/check_gate_witness_courts.py`.

## Files authored (landing bundle)

- `/Users/sac/repop/dist/marketplace-court/cgap-popcorn-aoq-court.sh` — court body:
  `bash -euo pipefail`, runs from marketplace repo root, no network/install/mutation,
  scratch under `${RUNNER_TEMP:-/tmp}`; typed refusals PACK-MISSING / COURT-BROKEN /
  GATE_SOURCE_EXTENSION (pack-local extension sweep of `gates/`) /
  QUALIFICATION-FAILED (`qualification/verify.py`) / WITNESS-FLIP-FAILED /
  WITNESS-FLIP-PACK-NOT-COVERED (`check_gate_witness_courts.py` + coverage assert).
- `/Users/sac/repop/dist/marketplace-court/courts.json.snippet` — exact
  `ci/courts.json` entry: `{name, paths: ["packs/cgap-popcorn-aoq/**"],
  timeout_minutes: 10}`.
- `/Users/sac/repop/dist/marketplace-court/landing-runbook.md` — branch-before-edit
  sequence (branch → copy pack → register court + snippet → ci_plan.py --all →
  direct court run → E14/R9 admission sequence → explicit-path commit), plus the G6
  pre-existing `GATE_SOURCE_EXTENSION` refusal on
  `packs/xstate-v5-machine-pack/gates/{baselines,shapes}.toml` recorded as a
  KNOWN-BLOCKED item (NOT this wave's defect; coordinator escalation).

## Gates (real exits)

| Gate | Exit | Note |
|---|---|---|
| `bash -n cgap-popcorn-aoq-court.sh` | 0 | syntax |
| `json.loads('['+snippet+']')` → keys `{name,paths,timeout_minutes}` | 0 | parse + schema |
| Name-drift audit (python char-code diff of every pack-name token vs disk truth) | 0 drifts | caught + fixed one garbled line in the runbook |

## UNVERIFIED (unapplied by design)

- The bundle has NOT been applied to the marketplace repo; `bash ci/courts/...` direct
  run, `ci_plan.py run --all`, and the full admission sequence are UNVERIFIED here by
  design (marketplace is read-only for this lane and P17/P18 pack prerequisites
  — gates/witnesses/qualification/verify.py — land from other lanes).
- xstate-v5 `GATE_SOURCE_EXTENSION` repo-wide refusal persists (G6, commit `693291330`):
  `marketplace.py validate/catalog/fingerprint` exit 2 until the marketplace lane
  fixes it. Escalated to coordinator; explicitly not repaired in this lane.

## Handoff

Marketplace lane follows `dist/marketplace-court/landing-runbook.md` exactly; every
step's exit is receipted there. Standing upgrades to ALIVE only after the admission
sequence exits 0 (minus the escalated xstate-v5 refusal).
