# P9: Worker Message Protocol (Wave-2 Plan)

Standing: PARTIAL

## Charter

Build the binary frame router for the repop worker: fixed-width frames in,
typed dispatch out, zero JSON on the wire. P9 owns the 32B router header,
per-kind payload envelopes, the typed `RouterError` taxonomy, the
correlation promise map over SAB ring ordinals, and the zero-JSON
enforcement gate. P9 does NOT own payload-internal layouts — those belong
to `@repop/abi` (P1); P9 treats every payload as opaque bytes.

Scope in one sentence: bytes in from the ring or postMessage fallback,
validated frames out to the kernel/client, and every corruption class
surfaced as a typed refusal rather than a silent pass.

## Resolved decisions

Frozen facts (explore receipts: wave-1 R10/R11 zero-JSON law, landed plan
facts, g1-abi-reconcile receipt):

### Router header (32B, fixed)

| offset | field | type | law |
|---|---|---|---|
| 0x00 | magic `RP9F` | u32 LE (`0x46395052`) | gate 1: mismatch = refused |
| 0x04 | version | u16 LE | gate 2: unknown version = refused |
| 0x06 | kind | u8 | gate 6: unknown kind = refused |
| 0x07 | flags | u8 | must be 0 (gate 3) |
| 0x08 | seq | u32 LE | writer-owned; wrap-safe compare (`seqOk`) |
| 0x0C | corrId | u32 LE | correlation key, gate 9 |
| 0x10 | payloadLen | u32 LE | gate 7: per-kind exact length |
| 0x14 | reserved0 | u32 | must be 0 (gate 4) |
| 0x18 | reserved1 | u32 | must be 0 (gate 4) |
| 0x1C | headerDigest | u32 | FNV-1a32 over bytes [0x00,0x1C) |

Header digest: FNV-1a32, offset basis 2166136261, prime 16777619, over
header bytes [0x00,0x1C) with digest field zeroed during computation.

### FrameKind enum (closed, u8)

| value | kind | payload width |
|---|---|---|
| 0 | SUBMIT_INTENT | exactly 64B (P1 IntentFrame) |
| 1 | INTENT_RESOLVED | exactly receipt width (P1/P3 receipt layout) |
| 2 | KERNEL_READY | exactly 0B |
| 3 | REGISTER_OBJECT | exactly 64B (P1 HyperplaneRegister) |
| 4 | REFUSE | exactly 16B |
| other | — | refused: `RouterError.UnknownKind` |

### REFUSE payload (16B, fixed)

| offset | field | type | law |
|---|---|---|---|
| 0x00 | statusCode | u16 LE | typed refusal code |
| 0x02 | reserved0 | u32 | must-0 |
| 0x06 | reserved1 | u32 | must-0 |
| 0x0A | reasonBits | u64 | machine-readable reason |
| 0x12 | corrId echo | u32 | echo of refused frame |
| — | total | 16B | exact-width law applies |

Field set + total width frozen; exact offsets UNVERIFIED-pending P1
reconciliation (statusCode u16 packs with padding — see
UNVERIFIED-pending below).

### Gate order (fail-closed, first-fail-wins)

1. magic
2. version
3. flags must-0
4. reserved0/1 must-0
5. headerDigest verify
6. kind in closed enum
7. payloadLen == per-kind exact width
8. seq wrap-safe monotonic check (`seqOk`)
9. corrId resolvable (or KERNEL_READY broadcast)

### RouterError (typed, one variant per corruption class)

- `BadMagic` — magic != RP9F
- `BadVersion` — version unknown
- `BadFlags` — flags/reserved nonzero
- `BadDigest` — FNV digest mismatch
- `UnknownKind` — kind outside closed enum
- `BadLength` — payloadLen != per-kind width
- `StaleSeq` — seq fails wrap-safe check
- `UnknownCorrId` — corrId not in promise map (non-broadcast)

One variant per corruption class; no stringly-typed errors; every refusal
carries the corrId echo where one exists.

### Opaque-payload layering

P9 never parses payload internals. `@repop/abi` (P1) owns all field
layouts; P9 owns only the header, kind enum, per-kind widths, and
REFUSE's 16B envelope (statusCode/reserved/reasonBits/corrId echo — an
envelope, not a layout). Consumers decode payloads via `@repop/abi`.

### Correlation promise map over ring ordinals

- Outbound SUBMIT_INTENT/REGISTER_OBJECT frames carry a writer-assigned
  corrId.
- Inbound frames dispatch by corrId into the promise map: `Map<corrId,
  { resolve, reject, kind, deadline, ringOrdinal }>`.
- Ring ordinal (P6) is carried alongside corrId so back-pressure can
  reject before ring write when the map is saturated.
- Deadline sweep rejects with `RouterError.UnknownCorrId`-adjacent typed
  timeout; the map is bounded (max in-flight) and fail-closed on
  overflow (typed refusal, no silent drop).
- KERNEL_READY has no corrId consumer; it is a broadcast event, not a
  correlation target.

### Zero-JSON law

Binary fixed-width only across the worker boundary and kernel ABI. No
`JSON.stringify`/`parse`, no structured-clone of plain objects, no string
protocols, in P9 code. The postMessage fallback (P7) carries the same
binary frames as transferable ArrayBuffers, not serialized objects.

## Owned files

- `/Users/sac/repop/packages/worker/src/protocol/` (directory, all files)
  - `header.ts` — 32B header codec (encode/decode, FNV-1a32 digest)
  - `frameKind.ts` — closed FrameKind enum + per-kind width table
  - `refuse.ts` — 16B REFUSE envelope codec
  - `router.ts` — gate chain + dispatch + typed RouterError
  - `correlation.ts` — promise map, deadline sweep, bounded map
  - `fnv.ts` — FNV-1a32 implementation + vector tests
  - `index.ts` — public surface re-export

## Gates

| gate | command | pass condition | exit |
|---|---|---|---|
| G1 typecheck | `pnpm -C packages/worker typecheck` | 0 errors | UNVERIFIED |
| G2 unit | `pnpm -C packages/worker test src/protocol` | all pass, 0 skipped | UNVERIFIED |
| G3 zero-JSON grep | `grep -rn 'JSON\.' packages/worker/src/protocol` | 0 matches | UNVERIFIED |
| G4 anti-vacuity | inject JSON token, G3 must exit 1 | flip | UNVERIFIED |
| G5 browser | corrupt header fields, real frame | typed refuse | UNVERIFIED |
| G6 seq wrap | seq wraps at 2^32 | wrap-safe | UNVERIFIED |
| G7 digest | bit flip -> BadDigest | non-vacuous | UNVERIFIED |
| G8 dependents | P6/P10 compile vs P9 exports | 0 errors | UNVERIFIED |

G3/G4 anti-vacuity: a grep gate that can only pass (no injected-token
kill) carries no bits; G4 exists so G3 cannot silently fake-pass.

## Dependencies

- **P1 (`@repop/abi`)** — payload layout authority. P9's per-kind widths
  (64B / receipt width / 0B / 16B) are pinned to P1's frozen layouts.
  P9 pins widths, never offsets inside payloads.
- **P4 (kernel wasm build)** — raw C-ABI exports own the kernel-side
  frame production; P9's header is the JS-side mirror of P4's emission
  format.
- **P6 (SAB ring)** — transport under P9. Ring ordinals feed the
  correlation map; P9 is the Transport consumer in P6's trait split.
- **P10 (`@repop/client`)** — correlation consumer. P10's promise map
  settles on P9's dispatched frames; P9's RouterError taxonomy is the
  rejection vocabulary P10 maps onto.
- **P7** — postMessage fallback transports P9 frames verbatim
  (ArrayBuffer, transferable), no re-encoding.

## UNVERIFIED-pending

- Exact receipt width for INTENT_RESOLVED — pinned to "receipt width"
  pending P1/P3 freeze of the receipt layout; pinned as a constant the
  day P1 lands.
- REFUSE payload's exact offset table — statusCode u16 + reserved x2 +
  reasonBits u64 + corrId echo is the agreed envelope shape; exact byte
  offsets UNVERIFIED pending P1 reconciliation (same discipline as
  g1-abi-reconcile).
- Seq wrap-safety semantics — wrap-safe compare design (serde-style
  seqOk) assumed; needs a P4/P6 joint pass to confirm writer-side seq
  production is monotonic per connection.
- G1-G8 all UNVERIFIED until implementation lands; this plan is
  Standing: PARTIAL by construction — plan-only lane, no code written.
- Correlation map saturation bound (max in-flight) — numeric bound
  UNVERIFIED pending P6 ring capacity contract.
