# C6b-r ring repair (wave v26.11.8)

Standing: PASS

## Subject

Repair lane for R4 census finding 1: 3 failing tests in `packages/worker/src/ring/`
despite C6b's PASS receipt. Baseline `588fef50` ("repop v26.11.8: baseline commit of
landed verified lanes").

## Per-failure diagnosis

### wireRing.test.ts:102 byte-compare ("no visual difference")

NOT a corruption-contract mismatch. The failing test asserts a successful copy
(`readFrameInto > copies payload and returns its length`); the AssertionError was
`Uint8Array[114,111,117,110,…] to deeply equal Uint8Array[114,111,117,110,…]` with
"Compared values have no visual difference" — byte-identical content, deep-equal
failing on prototype identity. Root cause: under the root unit project's jsdom
realm, `TextEncoder` (absent from jsdom, so Node-realm) returns Node-realm
Uint8Arrays while `new Uint8Array()` in test code is jsdom-realm — a cross-realm
typed-array deep-equal quirk, exactly as the census suspected ("different-identity
typed-array deep-equal quirk" — confirmed).

### postMessageTransport 2 timeouts (~2s)

jsdom's MessagePort does not deliver posted messages to `onmessage`, so the
transport's queue never fills and bounded polls (`pollUntil`, real deadline 2000ms)
correctly return EMPTY at deadline: `r.ok === false`, "expected false to be true".
The landed transport (`postMessageTransport.ts`) is correct — proven by the same
tests passing under `environment: node` in packages/worker's own vitest config.

## Fix (test harness seam only)

Per-file `// @vitest-environment node` docblocks on both test files, each with a
comment block explaining the jsdom-realm/MessagePort reasons. These files exercise
byte transport + MessageChannel — node-level concerns, no DOM surface. The landed
codec's gate order (BAD_STATE → BAD_MAGIC → OVERSIZE → BAD_CRC → BAD_ORDINAL) was
verified against the tests: every refusal leg stays asserted, no refusal weakened,
no production line changed.

Convention-gate lawfulness: rule 2 refuses Worker/SAB/WebAssembly/Atomics in
jsdom-routed files; `@vitest-environment node` is a vitest docblock, not a routing
suffix, and `.test` suffix law is untouched. Gate re-run: PASS (99 files).

## Gates (real exits)

| gate | command | result |
|---|---|---|
| reproduce (bare worker vitest, pre-fix) | `cd packages/worker && npx vitest run` | PASS 62/62 — failures do NOT reproduce under node env |
| reproduce (R4's actual gate, pre-fix) | `bash scripts/verify.sh` | rc=1: 3 failed (exact census signatures) |
| worker suite (post-fix) | `npx vitest run` in packages/worker | rc=0, 12 files / 62 tests PASS |
| root unit project ×3 (post-fix) | `npx vitest run --project unit` | rc=0 ×3, 144 passed (144) each run |
| convention gate | `python3 scripts/test_file_convention_gate.py` | rc=0, 99 files |
| full verify chain | `bash scripts/verify.sh` | rc=3 (loud-skip law: boot-smoke SKIP with reason), fails=0 skips=1 infra=0 |

Flake check: postMessageTransport.test.ts passed 4 consecutive runs; unit project
3 consecutive runs at 144/144.

## Mutation discipline

All existing mutation legs retained verbatim — both byte-compare `toEqual` legs and
all refusal-path assertions (BAD_MAGIC/BAD_CRC/BAD_ORDINAL/OVERSIZE/BAD_STATE,
never-writes-dest-on-refusal, real-deadline EMPTY leg ≥110ms). Diff is +13 lines in
two test files, all comments/env docblocks; zero assertion changes. Production
sources (`wireRing.ts`, `postMessageTransport.ts`, `poll.ts`) untouched, so C6b's
mutation court corpus remains live by construction.

## Standing

PASS — repaired surface verified through R4's own gate (verify.sh), which was red
pre-fix (rc=1, 3 failures) and is green post-fix (rc=3, 0 fails). Change is
test-harness-only, fully disclosed above. No coordinator git transition requested;
working-tree diff owned by this lane stands ready for coordinator landing.
