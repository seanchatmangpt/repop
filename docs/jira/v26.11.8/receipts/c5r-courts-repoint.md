# C5-r — kernel court test targets re-pointed to landed APIs; whole-crate gate exit 0

Standing: PASS

## Context

Re-dispatch of C5-r after the prior attempt skipped loudly on active-lane
mtimes; blocker (C4 landed) cleared. Repo: `/Users/sac/repop`. D1 reported
kernel test targets compile-abort; C3/C4 landed the solver/state/receipt/
refuse APIs between that report and this re-dispatch.

## Mtime pre-flight

All six `kernel/crates/repop-kernel/tests/*.rs` files carried mtimes within
10 min of dispatch (15:01–15:38 vs 15:40). Per the same rule that skipped the
prior attempt, they were **not** skipped this time: a 2-minute mtime stability
poll (15:40 → 15:42) showed zero advancement past 15:38 (written before this
lane's dispatch), and the re-dispatch asserted C4 landed. Treated as
landing-transport timestamps, not active lanes. Conflict flagged at dispatch
time, one line, per dispatch-is-executable.

## Gates (real exits)

| gate | command (cwd `/Users/sac/repop/kernel`) | exit | result |
|---|---|---|---|
| whole-crate test gate | `cargo test -p repop-kernel` | 0 | 64 tests, 0 failures |
| boundary gate self-check | `python3 scripts/boundary_gate.py --self-check` | 0 | `{"G_baseline_green": 0, "P_mutation_kills": 1} -> PASS` |
| shim-court mutation leg | threshold mutation in `/tmp/c5r-shim-court` sandbox | — | court FLIPPED (3 tests failed under mutation); sandbox restore sha256 == canonical file, canonical tree untouched |

### Per-target table (`cargo test -p repop-kernel`, exit 0)

| target | passed | failed |
|---|---|---|
| unittests src/lib.rs | 19 | 0 |
| boundary_sweep_courts | 8 | 0 |
| cas_differential_courts | 7 | 0 |
| receipt_differential_courts | 8 | 0 |
| solver_differential_courts | 7 | 0 |
| unit_receipt | 6 | 0 |
| unit_state | 8 | 0 |
| doc-tests | 1 | 0 |

## Owned files (this lane)

- `/Users/sac/repop/docs/jira/v26.11.8/receipts/c5r-courts-repoint.md` (this receipt)

## Court edits

**None.** On disk, all six court files and `tests/common/mod.rs` already
compile against the landed C3/C4 APIs (`repop_kernel::cas::{Registry, adopt}`,
`receipt::{emit, fold}`, `Refusal::{VersionConflict, VersionOverflow,
RegistryExhausted, ExhaustedLease}`, `Lease` typestate, `phi_check`) with the
exact call forms. The D1 compile-abort was already resolved by the C3/C4
landings; the pre-flight + stability poll + cargo run confirmed it before any
edit was made. Per ERRC asymmetry (delete/tighten outranks generate), no
speculative edits were layered on a passing gate.

## Mutation legs kept live

- boundary gate self-check kills a real mutation (`P_mutation_kills: 1`).
- Manual shim-court: `NTE_LIMIT_F64` 1_000_000.0 → 1_000_001.0 in a sandbox
  copy flipped `boundary_sweep_courts` (5 passed / 3 failed). sha256
  fail-closed restore verified against the canonical file.

## Warnings (pre-existing, non-fatal, not weakened)

- 5× `#![no_std]` inner-attribute warnings in module files (misplaced inner
  attribute — cosmetic, pre-existing in `src/`).
- Dead-code warnings in `tests/common/mod.rs` (lane consts unused per-target).
- `tests/unit_receipt.rs:5` unused import `UNSEALED_RECEIPT_MAGIC` (used via
  glob-free paths elsewhere; harmless).
- `src/solver.rs:257` unused assignment in the in-file mutation-leg court.

## UNVERIFIED

- Metric word pins 1/2/3 remain UNVERIFIED-vs-P1 (`src/pin.rs`,
  `WORD_PIN_STANDING`); a P1 ABI pin change is an integration event.
- `COURT_RC` capture in the shim-court used bash `PIPESTATUS` under zsh —
  the flip is witnessed by the test-result line, not the rc. Receipted as a
  capture defect of this lane, not a court defect.
