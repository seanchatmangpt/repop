# C4 — CAS Version Registry + 229B Receipt Emission (Wave-3 CONSTRUCT lane)

Standing: PARTIAL_ALIVE

## Gates (real exits, this session)

- `cargo build -p repop-kernel` → exit 0
- `cargo test -p repop-kernel --test unit_state --test unit_receipt` → exit 0
  (8 + 6 courts passed, 0 failed; plus 1 compile-fail doctest via
  `cargo test -p repop-kernel --doc`, exit 0)
- Non-vacuity probe (mutation leg, this session): swapping the digest key
  source (`issued_root` → `lease_id`) did NOT flip
  `receipt_foreign_key_refused` — the covered bytes already embed
  `issued_root`, so key-source-vs-covered-data is not discriminable without a
  real BLAKE3 KAT. Recorded honestly: the court proves key-DEPENDENCE and a
  full 229-byte single-flip sweep, not key-CHOICE. Restored byte-exact
  (`cmp` clean) and re-gated to green after the probe.

## Owned files (all landed)

- `kernel/crates/repop-kernel/src/state.rs` — per-entity CAS registry
  (REGISTRY_CAP 4096, cache-padded `CachePadded(AtomicU64)` cells, CAS
  AcqRel/Acquire, monotonic law, receipt_seq fetch_add Relaxed, MMR-stack
  `Admissions` accumulator)
- `kernel/crates/repop-kernel/src/lease.rs` — Φ-lease Fresh/Spent affine
  typestate (compile-fail doctest: double-spend is a TYPE error; runtime
  `check_spendable`/`refuse_recommit` for the erased boundary)
- `kernel/crates/repop-kernel/src/receipt.rs` — 229B `UnsealedReceipt`
  (`CGRU`, v0x00, `DeltaS(112) || PhiLease(80) || keyed-BLAKE3(32)`,
  compile-time offset pins, alg-id 0x0000 seam, `emit`/`fold`/`receipt_leaf`
  /`phi_check`)
- `kernel/crates/repop-kernel/src/refuse.rs` — closed refusal taxonomy
  (`VersionConflict{entity,expected,actual}`, `LeaseAlreadySpent`,
  `ReceiptSequenceGap{expected,got}`, `RegistryExhausted`, `VersionOverflow`,
  `ExhaustedLease`)
- `kernel/crates/repop-kernel/src/vendor/keyed_blake3.rs` — vendored keyed +
  unkeyed single-chunk BLAKE3, attributed to cgap `cgap-blake3/src/lib.rs`
  lines 16–155 (compress/IV/permute) + cgap `chatman.rs` keyed-digest
  semantics, LICENSE-P28-SIL, per repop R11 vendor-copy law. Wrapper
  (keyed_digest/hash_unkeyed) written to the BLAKE3 spec: initial CV = key
  (keyed), `ROOT|KEYED` on every block, `CHUNK_START`/`CHUNK_END` on
  first/last, counter 0, zero padding, digest = final CV.

## Shared-seam edits (disclosed)

- `kernel/crates/repop-kernel/src/lib.rs` (C3-owned file): appended module
  declarations + re-exports (`pub mod lease/receipt/refuse/state/vendor`,
  `pub use state as cas` for the C5 court contract
  `repop_kernel::cas::{Registry, adopt}`, `pub use refuse::Refusal`,
  `receipt::{emit, fold}` re-exports). No C3 lines modified.
- `kernel/crates/repop-kernel/src/state.rs` tail: added free fn
  `cas::adopt(&mut Registry, ...)` — demanded by C5's pinned court signature.
- `kernel/crates/repop-kernel-wasm/Cargo.toml` (C6-owned): compile-freeze
  SLA minimal unblock — removed the duplicated trailing `[profile.release]`
  block that broke workspace manifest loading for every lane. C6 later
  re-edited the file themselves; current state is C6's.
- C3's `solver.rs` broke mid-flight once during this session (partial edit);
  resolved by the owning lane in ~30 s under the SLA — no unblock needed.

## Tests (13 P3 §7 courts + 1 accumulator oracle, all green)

unit_state (8): cas_monotonic / cas_entities_independent /
cas_stale_carries_actual / cas_one_winner_per_round (8 real threads, one
winner) / typestate_spent_lease_cannot_recommit (runtime leg; the compile
leg is the compile-fail doctest on the type) / cas_version_overflow_refused
(u64::MAX saturation via disclosed court-seeding `force_version`) /
cas_registry_exhausts_at_cap (4097th entity refused) /
admissions_root_monotonic_and_folds (accumulator == independent std-Vec MMR
oracle at every n; == cgap-parity level `fold` at powers of two).

unit_receipt (6): receipt_229b_layout (offsets/roundtrip/foreign
magic+version+domain-tag refusal) / receipt_foreign_key_refused (key
divergence + 229-byte single-flip sweep) / receipt_alg_id_is_0x0000 (seal
body `digest||0x0000`; 0x0001 named as the server-boundary seam, no seal
slot on the 229B type) / receipt_merkle_order_matters (order changes root;
accumulator agreement) / receipt_stale_lease_cannot_recommit (spend
consumes ticket, fresh/spent typestate, phi_check ExhaustedLease) /
receipt_source_scan_no_std (module bodies of receipt/lease/state/refuse
carry no `std::` paths).

## UNVERIFIED (explicit)

- Keyed-BLAKE3 spec conformance: no KAT vectors run in this lane. The
  implementation follows the BLAKE3 spec structure (keyed single-chunk, CV =
  key, flag placement per spec); byte-level conformance is UNVERIFIED.
  Consequence: cross-implementation receipt parity with cgap chatman.rs is
  UNVERIFIED. Close condition: run the official BLAKE3 test-vector file
  (keyed_0 / keyed_1 contexts, ≤1024B) against
  `src/vendor/keyed_blake3.rs`.
- Key-choice non-vacuity: the foreign-key court cannot discriminate
  key-choice (see probe above). Close condition: BLAKE3 KAT pins the exact
  keyed output for a known key/input pair.
- DeltaS/PhiLease wire parity with cgap `chatman.rs`/`lease.rs` encodings is
  UNVERIFIED (structurally pinned, never byte-compared against cgap vectors).
- The 229B layout is keyed to the cgap-derived shapes, not yet to P1's
  `@repop/abi` pinned ReceiptFrame (repop-abi currently carries only lib.rs;
  its module table is aspirational). Re-pin when P1 lands.
- Admissions accumulator root for non-power-of-two receipt counts uses the
  MMR-stack shape (differs from cgap's level-fold promotion shape). Test
  7b pins the equivalence boundary (powers of two). If cgap parity is a
  hard requirement for odd counts, `Admissions` must switch to a level-fold
  tree with O(n) buffering; currently UNVERIFIED which shape the kernel
  ABI contract will pin.

## Environment facts (receipt law)

- `/Users/sac/repop` is NOT a git repository — no commit/SHA possible;
  landing is on-disk files only (coordinator-level concern, disclosed).
- Registry-heavy courts spawn a 32MB-stack thread: `Registry::new()` is a
  ~786KB value (3 × 4096 cache-padded cells); the default 2MiB test-thread
  stack overflows in debug builds. Court bodies are unchanged; the helper
  (`big_stack`) is in tests/unit_state.rs.
