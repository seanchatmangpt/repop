# C5 Kernel Courts — Wave-3 Receipt

Standing: PARTIAL_ALIVE

## Owned files (C5 lane, wave 3)

- `kernel/crates/repop-kernel/tests/common/mod.rs` — SplitMix64 harness (master seed
  `0xA20C_0FFE_E5A7_E000`, per-lane `master ^ lane_id`), boundary-biased corpus
  generator, scalar oracle mirror, encode_frame, lane seed constants.
- `kernel/crates/repop-kernel/tests/solver_differential_courts.rs` — court
  `differential-oracle` (7 tests).
- `kernel/crates/repop-kernel/tests/cas_differential_courts.rs` — courts
  `cas-registry` + `refusal-typing` (7 tests).
- `kernel/crates/repop-kernel/tests/receipt_differential_courts.rs` — courts
  `receipt-emit` + `admissions-root` (8 tests).
- `kernel/crates/repop-kernel/tests/boundary_sweep_courts.rs` — court `boundary-sweep` (8 tests).
- `kernel/scripts/boundary_gate.py` — mutation campaign gate (sha256 tree manifest,
  /tmp sandbox mutation, fail-closed restore proof + mtime bump, per-run
  /tmp CARGO_TARGET_DIR, exit law 0/1/2/3, kill-rate ledger JSON).

## Gates + exits (run 2026-11-08)

| Gate | Command | Exit | Standing |
|---|---|---|--|
| Gate self-check (G/P two-arm flip proof) | `python3 kernel/scripts/boundary_gate.py --self-check` | 0 | ALIVE |
| Solver differential court (canonical) | `cargo test -p repop-kernel --test solver_differential_courts` | 0 (7/7) | ALIVE |
| CAS + refusal courts (canonical) | `cargo test -p repop-kernel --test cas_differential_courts` | 0 (7/7) | ALIVE |
| Receipt + admissions courts (canonical) | `cargo test -p repop-kernel --test receipt_differential_courts` | 0 (8/8) | ALIVE |
| Boundary sweep court (canonical) | `cargo test --test boundary_sweep_courts` | 0 (8/8) | ALIVE |
| Mutation campaign (6 rows) | `python3 kernel/scripts/boundary_gate.py` | 0, kill 6/6 | ALIVE |

## Non-vacuity receipts (kill ledger, campaign 3)

| Court | Named mutation (sandbox) | Baseline | Mutation | Standing |
|---|---|---|---|---|
| differential-oracle | swap NTE predicate operand order (`src/solver.rs`) | 0 | 101 | ALIVE (killed) |
| cas-registry | skip monotonic version bump (`src/state.rs`: `wrapping_add(1)`→identity) | 0 | 101 | ALIVE (killed) |
| boundary-sweep | widen NTE limit +1 ULP (`src/boundary.rs`) | 0 | 101 | ALIVE (killed) |
| receipt-emit | remove tier-version check (`src/receipt.rs`) | 0 | 101 | ALIVE (killed) |
| admissions-root | change fold blocking `chunks(cap)`→`chunks(2)` (`src/receipt.rs`) | 0 | 101 | ALIVE (killed) |
| refusal-typing | rename `RegistryExhausted` variant (`src/refuse.rs`; court compile break = loud kill) | 0 | 101 | ALIVE (killed) |

Kill-rate ledger: `kernel/scripts/boundary_gate_ledger.json` (rewritten by the
final full campaign; per-court baseline/mutation exits + standing).

## Court-caught kernel defects (errc repair receipts)

1. **False BREACH_NTE at limit −1 ULP** — my differential court caught
   `le_mask_borrow_form`'s propagate term `(a ^ b) & !d` mis-signaling near the
   clamp boundary (row `nte=999999.9999999998 vs limit 1e6 → BREACH signed`,
   mirror said PASS-side). Reproduced with an independent Python brute-force
   (75045/200081 bad for the old form). C2 concurrently repaired it mid-flight
   with the signed borrow-form; my 500k-case re-verification of the new form:
   0/500000 bad. Court now green on canonical.
2. **Stack overflow on test threads (macOS 512KiB)** — `Registry::new()`
   constructs a 786KB value on the test thread stack. Courts now construct
   Registries inside `thread::Builder::stack_size(32MiB)` wrappers; recorded
   as court-side mitigation, not a kernel defect (kernel tests in `--lib`
   run on the main thread).
3. **Gate staleness defect (my own gate)** — campaign 1 ran mutations in a
   /tmp sandbox with a SHARED CARGO_TARGET_DIR; copytree-preserved mtimes +
   mtime-based cargo fingerprints served a stale artifact → false green
   (`differential-oracle` VACUOUS in campaign 1). Fixed: per-run unique
   target dir. Court-caught: the campaign-2/3 runs kill 6/6.
4. **admissions-root court coverage gap (my court)** — 8 leaves never
   exercised the `chunks(cap)` block path, so the fold-blocking mutation was
   inert; court strengthened with a textbook-fold mirror pin over 20 leaves.
   Kill confirmed in a dedicated re-run, then in full campaign 3.

# Cross-lane disclosures (same-checkout fan-out)

- Minimal SLA unblock: stripped the invalid `[profile.release]` block from
  `kernel/crates/repop-kernel-wasm/Cargo.toml` (profiles are rejected in
  non-root manifests; the note in the file itself named the workspace root as
  the single source of truth). C4/C6-owned file, build was frozen for all
  lanes. Backup: `/tmp/c4-manifest-backup.toml`.
- C2 concurrently repaired `le_mask_borrow_form` mid-flight (disclosed above).
- C3's `state.rs`/`receipt.rs`/`refuse.rs`/`lease.rs` landed mid-session; all
  courts were rewritten from planned-pin signatures to the real API once the
  subject landed.

## UNVERIFIED

- `Lease` typestate / `take_receipt_seq` interplay (P3 Phi-lease spend path)
  is not covered by a dedicated court yet — `ReceiptSequenceGap` is exercised
  only structurally (typing + replay court), not end-to-end emit-path.
- Kill ledger is session-local JSON under kernel/scripts/ — not yet a repo
  index doc; the coordinator should fold it into the wave closing receipt.
- Perf claims: none made. Divan bench receipt (min-of-7, CountingAlloc) is
  P2/P3-owned, not landed this session.
- Final full campaign (campaign 3) landed after the receipt draft: kill 6/6,
  gate exit 0 — the table above reflects its ledger
  (`kernel/scripts/boundary_gate_ledger.json`).
