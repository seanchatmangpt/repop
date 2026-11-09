# R8 uplink ring repair (wave v26.11.8)

Standing: PASS

## Subject

FINAL REPAIR lane R8. Exactly 2 failures in
`packages/worker/src/uplink/transport.test.ts` RingUplink tests, both
`AssertionError: expected false to be true` at `pollReceive`'s
`expect(got.ok).toBe(true)`. Working-tree diff is +8 lines in one test file,
zero assertion changes, zero production changes.

## Mtime disclosure

`transport.test.ts` mtime was 7 min old at lane start (<10 min). Skipped-loudly
check performed anyway by reproducing first: the 2 failures reproduced exactly
under `npx vitest run --project unit` (179 passed / 2 failed), so the mtime was
C20r's own landing of the file, not a competing in-flight lane. Proceeded.

## Diagnosis (C6br class, confirmed by run)

The 2 failing tests are the only RingUplink legs that drive `postMessagePair()`
through `pollReceive` — the consumer side delivers via MessagePort
`onmessage` (`packages/worker/src/ring/postMessageTransport.ts:19`,
`poll.ts:18`). jsdom's MessagePort does not deliver posted messages to
`onmessage`, so the ring never fills the slot and the bounded `pollReceive`
(500ms deadline) correctly returns `ok:false`. `expected false to be true` is
the exact C6br signature (postMessageTransport 2 timeouts, same file class).
Confirmed by run:

- jsdom (root unit project): same 2 tests fail, each ~500ms (deadline hit).
- node (worker package's own config): `npx vitest run
  src/uplink/transport.test.ts` → 8/8 PASS.

The 2 passing-refusal RingUplink legs (oversize, post-close) are synchronous
`send()` and pass under jsdom — no seam mismatch. Checked against the landed
SabRing surface: tests drive `postMessagePair`/`SLOT_SIZE` from
`../ring/index.ts`, not sabRing.ts directly; `RingUplink.send` refusals and
synchronous legs pass, so uplink's expectations match the landed ring API.
No production line changed; no refusal weakened.

## Fix (test harness seam only)

`// @vitest-environment node` docblock + reason comment on
`packages/worker/src/uplink/transport.test.ts` — the exact C6br pattern
(`c6br-ring-repair.md`: per-file docblock, comment block naming the
jsdom MessagePort reason). The file exercises byte transport + MessagePort
delivery; no DOM surface. As with C6br, `@vitest-environment node` is a vitest
docblock, not a routing suffix; suffix law untouched.

## Gates (real exits)

| gate | command | result |
|---|---|---|
| reproduce pre-fix | `npx vitest run --project unit` | 2 failed / 179 passed (exact coordinator signatures) |
| node-env hypothesis | `cd packages/worker && npx vitest run src/uplink/transport.test.ts` | 8/8 PASS |
| full unit post-fix | `npx vitest run --project unit` | rc=0, 181/181 PASS |
| flake check | second full unit run | 181/181 PASS (2 consecutive) |
| full verify chain | `bash scripts/verify.sh` | rc=3 (loud-skip law), fails=0 skips=1 infra=0; convention PASS (107 files), unit PASS, coi-smoke PASS, boot-smoke SKIP (root index.html absent — red-by-design) |

## Mutation discipline

All assertion lines unchanged; diff is the docblock + 7 comment lines only.
Production sources untouched, so C20r's court corpus (metaHeader refusals
BAD_MAGIC/BAD_SEAL/BAD_SEQ/BAD_BODY_LENGTH/NONZERO_RESERVED, RingUplink
ZERO_PROGRESS legs) remains live by construction.

## Standing

PASS — repaired surface verified through the coordinator's own gate: verify.sh
was red pre-fix (2 failures) and green post-fix (fails=0, exit 3 per skip
law). No coordinator git transition requested; working-tree diff owned by this
lane stands ready for coordinator landing.
