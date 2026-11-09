# R4 dead-lane census (wave v26.11.8)

Standing: PARTIAL_ALIVE

## Timing note

At census start (15:34) several lanes were still writing (mtimes 15:33-15:35).
Bounded observable poll (4 consecutive quiet 60s checks) confirmed settlement at
~15:41; all gates were run AFTER settlement, so no receipt attests a moving target.

## Census table (receipts dir had 20 receipts; zero r4-backfill existed at start)

| lane | surface | classification | R4 gate run | standing |
|---|---|---|---|---|
| C4 | kernel state/receipt modules | LANDED-WITHOUT-RECEIPT | cargo test -p repop-kernel: exit 0 | PASS (r4-backfill-c4) |
| C5 | kernel courts | LANDED-WITHOUT-RECEIPT | cargo test -p repop-kernel/-abi: exit 0 | PASS (r4-backfill-c5) |
| C11 | packages/repop provider/hooks | LANDED-WITHOUT-RECEIPT | tsc exit 0; repop vitest green | PASS (r4-backfill-c11) |
| C15 | test infra (verify.sh, gates, configs) | LANDED-WITHOUT-RECEIPT | verify.sh exit 1 (worker-ring reds, not C15's own files) | PARTIAL (r4-backfill-c15) |
| C17 | pack gates (self_check.py) | LANDED-WITHOUT-RECEIPT | exit 0 from pack dir; exit 2 from repo root (cwd-relative path) | PARTIAL (r4-backfill-c17) |
| C18 | pack templates (7 .tmpl) | LANDED-WITHOUT-RECEIPT | no render/determinism gate exists | PARTIAL (r4-backfill-c18) |
| C20 | uplink/ocel/demo | PARTIAL LANDED-WITHOUT-RECEIPT | tsc exit 0; no ocel/uplink artifacts exist | PARTIAL (r4-backfill-c20) |
| C12 | boundary (kernel + repop pkg) | LANDED-WITHOUT-RECEIPT | cargo exit 0; tsc exit 0; repop tests green | PASS (r4-backfill-c12) |

IN-FLIGHT at census start: the wave itself (writes stopped 15:41). NEVER-LANDED: none
of the 8 lanes is fully never-landed, but C20's ocel/uplink scope is missing (see below).

## Findings (recorded, not repaired)

1. verify.sh exit 1: 3 unit failures, all in packages/worker/src/ring/
   (wireRing.test.ts:102 byte-compare with "no visual difference" AssertionError —
   looks like a different-identity-typed-array deep-equal quirk; postMessageTransport
   2 timeouts at ~2s on real MessageChannel). C6b surface — C6b's receipt exists but
   its surface is red on R4's run. MEDIUM.
2. self_check.py is not root-safe: ontology.ttl resolved against process cwd
   (exit 2 PARSE FAIL from repo root). Fail-loud but invocation-sensitive. LOW.
3. No template render/determinism gate exists anywhere — C18 surface unverifiable
   mechanically. MEDIUM (vacuous-coverage risk).
4. C20's ocel/uplink artifacts do not exist on disk. MEDIUM.

## Re-dispatch list (maxStaleRetries 3-vs-2: decision PENDING operator)

1. C20 remainder: ocel + uplink artifacts (demo landed, ocel/uplink never landed) —
   re-dispatch with narrowed scope.
2. C6b-followup: worker ring failures (3 tests, packages/worker/src/ring/) — repair
   lane, not a re-land (surface already landed; it fails R4's gate run).
3. C18 court: build a render-twice-diff template determinism gate (new work, not a
   re-land).
4. C17-hardening: make self_check.py script-relative (ontology.ttl path) — small
   hardening lane.
5. maxStaleRetries 3-vs-2: UNDECIDED — pending operator decision; receipts here
   carry standing from R4's own gate runs, so no retry-count assumption is baked in.
