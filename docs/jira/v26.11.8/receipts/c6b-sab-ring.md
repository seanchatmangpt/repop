# C6b Receipt: SAB Ring (WIR0 port, SPSC, transport seam)

Standing: PARTIAL_ALIVE

Lane: C6b (Wave-3 CONSTRUCT). Resolved contract: docs/wave-1-resolutions.md R5;
plan: docs/jira/v26.11.8/plans/06-sab-ring.md (P6).

## Gates (real exits, 2026-11-08)

| Gate | Command | Exit | Result |
|---|---|---|---|
| Typecheck (owned surface) | `packages/worker: ./node_modules/.bin/tsc --noEmit` | 0 | src/ring/**: zero errors |
| Vitest (owned tests) | `packages/worker: ./node_modules/.bin/vitest run src/ring` | 0 | 18/18 pass (crc32 4, wireRing 10, postMessageTransport 4) |
| Typecheck (package-wide) | same tsc | 1 | 4 errors in ../abi/src (P1 lane in-flight; leaks into worker tsc via transitive import from src/protocol). NOT owned by C6b; disclosed, not fixed. |

## Owned files (all landed)

- packages/worker/src/ring/constants.ts — WIRE_MAGIC 0x57495230, SLOT_SIZE 4096, HEADER_SIZE 16, MAX_PAYLOAD 4080, CTRL_* Int32 word layout (WRITE/READ/WRAPPED/DROPPED/CAPACITY/READY, WORD_COUNT 6)
- packages/worker/src/ring/errors.ts — WireErrorCode closed union, WireError, RingResult, ok/err helpers
- packages/worker/src/ring/crc32.ts — table-driven CRC-32/ISO-HDLC; gate vectors 123456789→0xCBF43926, empty→0
- packages/worker/src/ring/wireRing.ts — pure codec: stampHeader / validateHeader / readFrameInto (refuses on BAD_MAGIC/BAD_CRC/BAD_ORDINAL/OVERSIZE/BAD_STATE, dest never written on refusal)
- packages/worker/src/ring/transport.ts — RingTransport trait {send(frame, ordinal), receive(dest), canWait, close} + feature probe + selectTransportKind (sab | postMessage)
- packages/worker/src/ring/sabRing.ts — SPSC ring: allocSab, claimPayload/commit split, publish, read (Acquire/Release cursor movement via Atomics), peek, dropped/wrapped counters
- packages/worker/src/ring/sabTransport.ts — SabTransport trait adapter (canWait true)
- packages/worker/src/ring/postMessageTransport.ts — MessageChannel fallback, same slot bytes, transferables zero-JSON (canWait false)
- packages/worker/src/ring/poll.ts — bounded-poll consumer: pollUntil (deadline-checked, MessageChannel macrotask yield), pollTransport
- packages/worker/src/ring/index.ts — barrel
- packages/worker/package.json, tsconfig.json, vitest.config.ts — package shell (note: tsconfig/package.json since amended by a concurrent lane; current disk state is authoritative)
- packages/worker/src/ring/crc32.test.ts, wireRing.test.ts (refusal paths + mutation legs: flipped MAGIC, dropped/wrong CRC, off-by-one ordinal), postMessageTransport.test.ts (real MessageChannel, deadline-checked empty-poll court)

## Verification notes

- crc32 gate vectors asserted exactly; wireRing courts flip MAGIC/CRC/ordinal and each refusal is a typed WireError; postMessage court runs a real MessageChannel with a bounded deadline (≥110ms real elapsed on the empty-poll leg — no sleeps).
- Trait signatures reconciled mid-flight with the concurrent P9-adjacent edits already on disk (send(frame, ordinal) / receive(dest)); final state type-checks.

## UNVERIFIED

- SAB browser courts (round-trip under load, wrap-around, Acquire/Release ordering, Release-drop mutation leg) deferred to the C15 browser-test infra — plan's `.browser.test.tsx` courts need real chromium + COOP/COEP, not yet present.
- SabRing claimPayload/commit/publish/read are unit-court-tested only through stamp/validate/refusal paths and trait wiring here; live two-thread SAB concurrency UNVERIFIED until C15.
- CRC-32/ISO-HDLC (vs Castagnoli) per plan UNVERIFIED-pending P4 footprint budget.
- Package-wide tsc exit 1 on P1 abi drift is pre-existing/not-owned (session-concurrent lane), not introduced by C6b.
