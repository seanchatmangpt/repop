# P20 — AoQ Uplink Seam, Local OCEL Ledger, Demo Work-Order Domain (Wave-2 Plan)

Standing: PARTIAL

Plan-only output. All claims cite wave-1 resolutions (`docs/wave-1-resolutions.md`, R8/E9/E12)
or the landed P20 contract. No code written in this lane.

## Charter

Own the AoQ uplink seam of the repop worker: a verified cgap-arrow payload path and a
pluggable in-worker transport, plus the local OCEL ledger that records what the uplink
carried, plus a demo work-order domain that exercises the whole chain end to end.

Three deliverables, one lane:

1. **Uplink transport seam** — vendored cgap-arrow IPC1 framing behind a
   `UplinkTransport` trait with three in-worker implementations; WebTransport/quinn is
   DEFERRED behind the trait (never beside it).
2. **Local OCEL ledger** — three columnar batches per wave-1 R8/E12 zoela law, blake3
   chain at seal boundary only.
3. **Demo work-order domain** — 64B `WO01` config row carrying NTE/GPM/geofence as
   ABI-config data read through the ABI; the kernel never embeds domain constants.

## Resolved decisions

### Vendored cgap-arrow framing (facts, already verified)

- Vendored cgap-arrow IPC1 verified framing: 64B `MetaHeader`, FNV-1a32 seal,
  `emit_verified`/`read_verified` with `BODY_DIGEST_AT=72`, `seq_ok` wrap-safe
  sequence check (wave-1 R2, E2/E19; landed P20 plan contract).
- The `fb` branch is NOT vendored — only mainline IPC1/AOQ1 emit/read.
- AOQ1 tag law is optional-per-transport: a transport MAY require the AOQ1 tag;
  the framing itself does not.
- Alignment is 64 everywhere on the uplink: header, body, ring slots, ledger batches.

### Transport trait — `UplinkTransport`

Trait surface (semantics fixed here; exact Rust in implementation wave):

- `send` takes scatter segments (IO-vector style), never a single flattened copy.
- Partial accept is a first-class result: the transport reports how many logical
  records were accepted and the caller resumes from there.
- Zero accept is a typed refusal (`ZeroProgress`), never a silent retry or a sleep
  (no-sleep law: bounded observable progress, not wait-and-hope).
- Ordering is a logical ordinal; no wall clock anywhere on the uplink.
- No JSON, no heap-flattened copies on the hot path (zero-JSON boundary law).

Three required in-worker implementations:

| Impl | Role |
|---|---|
| `SabRingTransport` | Primary: WIR0-style SAB ring (P6 port), 64B-aligned slots |
| `PostMessageTransport` | Required fallback for non-COI environments (R5 law) |
| `NullTransport` | Typed-refusal sink: every send returns `ZeroProgress` |

### WebTransport/quinn — DEFERRED (E9)

E9 greenfield verdict: quinn/WebTransport has zero fleet presence; building it now is
unbounded greenfield. Deferred behind `UplinkTransport` — a future server-side impl
lands as a fourth trait implementation, never as a parallel path beside the trait.

### CRC vs tamper tiers — never conflated

- CRC-32 is the transport tier: wire-integrity check inside transport framing.
- blake3 is the tamper tier: `emit_verified`/`read_verified` body digests and the
  ledger chain digest.
- No transport impl may substitute CRC for a body digest or vice versa. The seam keeps
  the tiers in different modules so conflation is a compile-visible shape error.

### OCEL ledger shape (R8 + E12 zoela law)

Three columnar batches, std-only (reuse cgap-ocel2 schema precedent, not the crate):

- **events** — wide, typed columns; closed activity vocabulary; dictionary-encoded
  enums where the vocabulary is small.
- **objects** — dictionary-encoded object table.
- **e2o** — separate batch of `(event_id, object_id, qualifier)` rows. NEVER embed
  object lists in event rows.
- Rolling blake3 chain digest computed ONLY at seal boundary (durability event), not
  on the hot path.

### Demo work-order config row (WO01)

- 64B `WO01` magic-tagged config row; ABI-config data read through the ABI.
- Fields: `NTE 800.0` / `GPM 0.22` / `geofence 200.0` (f64, per R4 boundary-check law).
- The kernel NEVER embeds domain constants: out-of-vocab activity is a closed-enum
  typed refusal sourced from the config vocabulary, not a kernel-side constant table.
- Precedent for the layout pattern: cgap-aoq header + generated layout pin table
  (R10 step 1 precedent).

## Owned files

- `kernel/uplink/*` — framing re-exports, transport trait, transport impls, ledger.
  Concretely: `kernel/uplink/mod.rs`, `kernel/uplink/framing.rs`,
  `kernel/uplink/transport.rs`, `kernel/uplink/sab_ring.rs`,
  `kernel/uplink/post_message.rs`, `kernel/uplink/null.rs`,
  `kernel/uplink/ocel.rs`, `kernel/uplink/wo01.rs`.
- `packages/worker/src/uplink/*` — worker-side seam glue (trait consumer, segment
  scatter, ordinal bookkeeping).
- `packages/worker/src/ocel/*` — ledger batch construction + seal/verify driver.
- `packages/worker/src/demo/*` — WO01 config row authoring, NTE/GPM/geofence feed,
  closed-enum activity vocabulary table.

## Gates

| Gate | Non-vacuity leg |
|---|---|
| `emit_verified` roundtrip golden vectors | fixed vectors; corruption of any byte at
`BODY_DIGEST_AT` region must fail `read_verified` |
| partial-accept court | transport accepting k-of-n then stopping must resume at k,
not 0; zero-accept must surface `ZeroProgress`, not retry |
| ledger arity + seal/verify courts | appending a row between seal points must flip
the chain digest; arity mismatch (e2o row with dangling event_id) must refuse |
| work_order decode courts with mutation legs | flipping each WO01 field and the
magic must decode-refuse; out-of-vocab activity must return the closed-enum refusal |
| zero-string gate | no string/JSON on the uplink or ledger hot path (source scan,
whitelisted test names only) |

Chicago law: real collaborators (real SAB ring, real postMessage channel in
`.browser.test.tsx` per R6); every court carries a mutation leg; no mocks of owned
collaborators.

## Dependencies

- **P1** — 64B pinned layout law the WO01 row and framing share.
- **P6** — SAB ring + transport trait split that `SabRingTransport` consumes.
- **P9** — worker message protocol / binary frame router the uplink dispatches through.
- **P16** — pack ontology vocabulary the demo closed-enum activity vocabulary aligns to.

## UNVERIFIED-pending

- WebTransport/quinn greenfield (E9): unestimated, unscheduled; lands only as a fourth
  `UplinkTransport` impl. Standing UNVERIFIED until a court exists.
- Wire-parity vs cgap cross-check: vendored framing byte-parity against upstream cgap
  `emit_verified` output is UNVERIFIED until a differential court runs on identical
  inputs in both trees.
