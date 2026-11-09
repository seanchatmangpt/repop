# R4 Backfill: C5 kernel courts

Standing: PASS

## Census

LANDED-WITHOUT-RECEIPT (settled ~15:41; gate run post-settlement).

## Files owned (on disk, no receipt existed)

- kernel/crates/repop-kernel/tests/boundary_sweep_courts.rs
- kernel/crates/repop-kernel/tests/cas_differential_courts.rs
- kernel/crates/repop-kernel/tests/receipt_differential_courts.rs
- kernel/crates/repop-kernel/tests/solver_differential_courts.rs
- kernel/crates/repop-kernel/tests/common/
- kernel/crates/repop-abi/tests/golden_fixture.rs

## Gate (run by R4)

- `cargo test -p repop-kernel` — exit 0 (all court suites pass).
- `cargo test -p repop-abi` — exit 0 (golden_fixture suite green; 0 doc-tests).

## Findings

None.

## Notes

Attests current disk state only, not the dead lane's claims. Re-dispatch list and
maxStaleRetries 3-vs-2 decision: see r4-census.md.
