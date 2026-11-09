# C20-r: ocel/ + uplink/ backfill (narrowed remainder)

Standing: PASS

## Scope

Landed ONLY the two modules missing from C20's original scope (per the R4
backfill receipt `r4-backfill-c20-uplink-ocel-demo.md` and the landed P20 plan
`docs/jira/v26.11.8/plans/20-aoq-uplink-demo.md`). The demo surface already
landed under C20; not touched.

## Owned files (all new)

- `packages/worker/src/ocel/errors.ts` — OcelErrorCode/OcelError/OcelResult
  closed result type (fail-closed typed refusals, ring errors.ts shape).
- `packages/worker/src/ocel/vocab.ts` — closed activity vocabulary
  (5 activities, frozen; OUT_OF_VOCAB typed refusal).
- `packages/worker/src/ocel/batch.ts` — three columnar batches
  (EventsBatch/ObjectsBatch/E2OBatch): typed-array columns, dictionary-encoded
  enums (u16 indices), append-only, strictly-increasing event-id order law,
  e2o arity law (dangling event/object refs are ARITY_MISMATCH at append
  time), e2o never embedded in event rows (append API carries no object
  field), rolling FNV-1a32 chain digest computed ONLY in seal()
  (fnvChain/fnvInit reuse @repop/abi FNV constants + fnv1a32).
- `packages/worker/src/ocel/index.ts`, `packages/worker/src/uplink/index.ts`.
- `packages/worker/src/uplink/metaHeader.ts` — IPC1-style 64B MetaHeader:
  magic 0x49504331 at 0x00, body length at 0x04, seq at 0x08, reserved
  [0x0C,0x3C), FNV-1a32 seal over [0x00,0x3C) stored at 0x3C; wrap-safe
  seqOk law (seq === expect % 2^32 — 0xFFFFFFFF → 0 lawful, replay/skip
  refused); encodeEnvelope/decodeMetaHeader with typed refusals
  (BAD_MAGIC/BAD_SEAL/BAD_SEQ/BAD_BODY_LENGTH/BUFFER_TOO_SHORT/NONZERO_RESERVED).
  Uses @repop/abi FRAME_SIZE + fnv1a32 (widths match; mtime confirmed abi
  landed).
- `packages/worker/src/uplink/transport.ts` — UplinkTransport trait
  (scatter-segment send, partial accept as first-class result, ZERO_PROGRESS
  typed refusal), NullTransport (typed-refusal sink), PostMessageUplink
  (zero-JSON transferable frame), RingUplink (emits into the landed C6b ring
  through its RingTransport API; envelope rides one WIR0 slot; CRC stays in
  the slot header = transport tier, FNV seal in the envelope = tamper tier,
  never conflated).
- Tests: `src/ocel/batch.test.ts` (17), `src/uplink/metaHeader.test.ts` (12),
  `src/uplink/transport.test.ts` (8).

## Gates (run this session)

- `pnpm/npx tsc --noEmit` on packages/worker — exit 0.
- `npx vitest run` on packages/worker — 15 files / 99 tests / 99 passed,
  0 failed (full suite; C6b-r ring tests included and green).
- Scoped: `npx vitest run src/ocel src/uplink` — 37/37 passed.
- Mutation legs (non-vacuity): ocel tampered events byte post-seal →
  CHAIN_MISMATCH refusal; metaHeader seal-region byte flip → BAD_MAGIC/BAD_SEAL
  refusal; reserved-byte flip → BAD_SEAL refusal; truncated body →
  BAD_BODY_LENGTH; seq replay 3→2, skip 3→4 refused; wrap 2^32→0 accepted.

## Not landed (out of narrowed scope)

- SabRingTransport as a named uplink impl — RingUplink composes the landed
  C6b ring transports (Sab/PostMessage) instead; the plan's SabRingTransport
  role is covered by RingUplink over SabTransport.
- Demo WO01 config row (already landed under C20).
- kernel/uplink/* (Rust side of the P20 plan) — not in this lane's scope.

## UNVERIFIED

- WebTransport/quinn: deferred behind UplinkTransport (E9), no impl, no court.
- Wire-parity vs upstream cgap emit_verified output: pending a differential
  court on identical inputs in both trees.
- `packages/worker/src/index.ts` (package "." export target) does not exist on
  disk — pre-existing gap, outside this lane's owned files; flagged for the
  coordinator.
