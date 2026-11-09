# R4 Backfill: C15 test infra

Standing: PARTIAL

## Census

LANDED-WITHOUT-RECEIPT (settled ~15:41; gates run post-settlement).

## Files owned (on disk, no receipt existed)

- scripts/verify.sh (gate chain with exit law 0/1/2/3, no `|| true`)
- scripts/test_file_convention_gate.py
- scripts/verify_parity.py, scripts/gen_ts_mirror.py, scripts/parity_fixture.json
- playwright/, playwright.smoke.config.ts, vitest.config.ts,
  vitest.browser.config.ts
- packages/*/src/test-support*

## Gate (run by R4)

- `bash scripts/verify.sh` — exit 1. Classification per its own exit law:
  GATE test_file_convention PASS (89 files), convention PASS, coi-smoke PASS,
  boot-smoke [SKIP] (no app root — loud skip, by design),
  GATE unit FAIL — 3 failures, all in packages/worker/src/ring/
  (wireRing.test.ts 1, postMessageTransport.test.ts 2; 141/144 pass workspace-wide).

## Findings (real, not repaired)

1. verify.sh exit 1: the unit gate red is attributable to the worker-ring surface
   (C6b, already receipted), not to any C15-authored file. Recorded, not fixed.
2. boot-smoke is a by-design loud skip until the app composition root lands.

## Notes

Attests current disk state. Re-dispatch list + maxStaleRetries decision: r4-census.md.
