# 03 - CAS Version Registry + Receipt Emission (P3, Wave 2)

Standing: PARTIAL

## Charter

Design and plan P3 for repop-kernel: a per-entity CAS version registry and a
229-byte `UnsealedReceipt` emission path, both in `no_std` Rust for
`wasm32-unknown-unknown`. This file is the Wave-2 plan; code lands in
`crates/repop-kernel/src/{state.rs,receipt.rs}` per the R10 build order
(docs/wave-1-resolutions.md, item 2). Wave-1 basis: R3 (receipt tiering / PQC
seam) is mandatory input.

## Resolved decisions

- **Per-entity CAS**: one `AtomicU64` version counter per entity, not a global
  lock. Contention is per-entity; entities are independent so no lane stalls.
  `compare_exchange` on the counter is the only mutation primitive; a failed
  exchange returns a typed refusal (see taxonomy below), never a retry loop in
  the kernel. Retry policy belongs to the caller.
- **229B `UnsealedReceipt`**: pinned wire size 229 bytes, keyed BLAKE3
  authenticator with `algorithm_id = 0x0000`. The `algorithm_id` field is the
  designed PQC upgrade seam (R3): `0x0001` = ML-DSA-65 (3309B seal), applied at
  a server trust boundary, never in the client kernel. The kernel therefore
  carries no ML-DSA code and no alloc pressure from sealing.
- **Admissions Merkle root**: emitted receipts accumulate into a Merkle root
  (keyed-BLAKE3 leaves, standard binary tree) so a batch of admissions can be
  attested with one 32B digest. Root advances monotonically with the receipt
  sequence; the accumulator lives in `state.rs`, leaf hashing in `receipt.rs`.
- **Phi-lease Fresh/Spent typestate**: lease handles are typed as
  `Lease<Fresh>` / `Lease<Spent>`; consuming a lease is a type-level
  transition, so double-spend is a compile error, not a runtime check. The
  typestate marker is a zero-sized type; the CAS version lives beside it.
- **Typed refusal taxonomy**: refusals are a closed enum, never `Result<_, ()>`
  or strings: `VersionConflict { entity, expected, actual }`,
  `LeaseAlreadySpent`, `ReceiptSequenceGap { expected, got }`,
  `RegistryExhausted`. Every refusal is replayable from the receipt log.
- **ML-DSA seal deferred**: `0x0001` sealing is out of kernel scope entirely
  (R3 server boundary). Kernel exposes only `algorithm_id` on the wire.

## Owned files

- `crates/repop-kernel/src/state.rs` - CAS registry + Merkle accumulator +
  Phi-lease typestate plumbing (no receipt wire format).
- `crates/repop-kernel/src/receipt.rs` - 229B `UnsealedReceipt` layout,
  keyed-BLAKE3 tag, algorithm_id field, Merkle leaf hashing.
- No other files. Lane J03 is single-file by contract but both kernel modules
  are one seam; if the coordinator enforces strict one-file, keep `state.rs`
  and register `receipt.rs` as a collision disclosure.

## Gates

- **CAS contention court**: spawn N concurrent writers on one entity, assert
  exactly one wins per round and every loser gets `VersionConflict` with the
  winning version in `actual`. Non-vacuity: corrupt the expected version in a
  mutation probe and the court must fail (`VACUOUS GATE` otherwise).
- **Alloc-free hot path**: Divan bench of the emit path over the 229B receipt
  must show zero allocations (Divan alloc column). Baseline: min-of-7 runs;
  `CountingAlloc` non-vacuity probe proves the counter would catch an alloc.
- **Receipt differential**: scalar-oracle differential court (SplitMix64 seed
  `0xA20C_0FFE_E5A7_E000`, per R4 bench idiom) compares kernel receipt bytes
  against an independent oracle implementation across >= 1000 random cases;
  any byte divergence fails. Merkle root also differentialed against a naive
  re-implementation.

## Dependencies

- `cgap-blake3` (vendored copy per R10 / P28-SIL decision), for keyed BLAKE3.
- `@repop/abi` (R10 item 1) must land first: the 229B receipt layout is a
  projection of the pinned 64B header layout.
- Upstream: lane J01/J02 outputs for the kernel crate skeleton and vendored
  deps; this lane does not create the crate root.

## UNVERIFIED-pending

- The exact 229B byte layout (field offsets, tag position) is UNVERIFIED until
  `@repop/abi` lands and `receipt.rs` is written against it.
- Merkle accumulator capacity/overflow behavior under registry exhaustion is
  UNVERIFIED pending the CAS contention court run.
- Phi-lease typestate interplay with CAS version on lease consumption is
  UNVERIFIED until `state.rs` compiles and the contention court passes.
- Vendored `cgap-blake3` no_std compatibility on `wasm32-unknown-unknown` is
  UNVERIFIED (no build run in this lane).
