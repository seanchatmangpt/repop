# D1 Kernel Gate Sweep — v26.11.8

Standing: PARTIAL

Aggregate kernel-side gate sweep over /Users/sac/repop/kernel. Not a full-green sweep:
1 of 3 crates green (repop-abi), repop-kernel and repop-kernel-wasm are compile-aborts
mid-flight. No source edited (write lanes own everything); every exit below is real.

## Commands and exits

| Gate | Command | Exit |
|---|---|---|
| Build | `cd kernel && cargo build --workspace` | 101 |
| Test (abi) | `cargo test -p repop-abi` | 0 |
| Test (kernel) | `cargo test -p repop-kernel` | 101 |
| Test (wasm) | `cargo test -p repop-kernel-wasm` | 101 |
| Wasm release | `cargo build -p repop-kernel-wasm --release --target wasm32-unknown-unknown` | 101 |
| Footprint | `python3 kernel/scripts/footprint_gate.py` | 1 |
| Clippy | `cargo clippy -p repop-abi` | 0 (1 warning) |

## Per-crate gate table

| Crate | Build | Tests | Notes |
|---|---|---|---|
| repop-abi | PASS | PASS 17 passed / 0 failed | Matches C1 known-state (17/17). Clippy exit 0. |
| repop-kernel | PASS (lib) | COMPILE-ABORT | Lib compiles; 3 test targets fail to compile. 0 tests executed — compile-abort is not a failure count. |
| repop-kernel-wasm | FAIL (host) | COMPILE-FAIL | 8 errors host, 3–5 on wasm target. |

## repop-kernel failing test targets (compile-abort, real errors)

- `boundary_sweep_courts` — E0308 incorrect arguments to a function
- `cas_differential_courts` — E0599 `len` not found on `UnsealedReceipt`; E0608 cannot index `UnsealedReceipt`; E0308 argument mismatch
- `receipt_differential_courts` — 6 errors: E0432 unresolved import `repop_kernel::cas::adopt`; E0425 `p_prev` not found; E0599 `register_entities` on `Result<T,E>`; E0608/E0308 on `UnsealedReceipt`
- `unit_state` — E0425... actually E0308 incorrect arguments
- Lib-test warning: unused import `Admissions`

## repop-kernel-wasm error inventory

Host build (8 errors):
- E0433 cannot find `IntentFrame` in `repop_abi` (lib.rs:139)
- E0433 cannot find `ReceiptFrame` in `repop_abi` (lib.rs:155)
- E0425 cannot find `LAYOUT_VERSION` in `repop_abi` (lib.rs:37)
- 4x E0433 `wasm32` not in `core::arch` on host target
- "unwinding panics are not supported without std"

wasm32-unknown-unknown release build (3 errors): "`From` is not yet stable as a const trait" (E0658) + E0284 type annotations needed. The footprint gate hits the same 3 errors.

## BLOCKED — in-flight lanes explaining each red

- **repop-kernel-wasm vs repop-abi surface drift**: the wasm wrapper references
  `IntentFrame` / `ReceiptFrame` / `LAYOUT_VERSION` that repop-abi does not export.
  Either the wasm lane (C6/C6w) is ahead of the abi lane or the abi lane moved the
  surface under it. The known-state expectation "wasm wrapper green but its abi dep
  re-attached by C6w" is exactly the state found: the wrapper's abi dependency surface
  has diverged from what repop-abi currently exports — this is the C6w re-attach
  boundary, not a footprint violation.
- **repop-kernel differential courts**: `UnsealedReceipt` API churn (no `len`, not
  indexable, changed function signatures) and a moved/renamed `cas::adopt` —
  consistent with solver/CAS/receipt lanes mid-flight rewriting those surfaces.
  Compile-abort means 0 tests executed; cannot attribute to solver/CAS/receipt lanes
  beyond the named crates' surfaces being in motion.
- **footprint_gate.py**: exit 1 is induced by the repop-kernel-wasm compile failure,
  not a footprint breach. Gate is not yet producing a footprint verdict at all.

## UNVERIFIED

- **Git census**: `git status --porcelain` in /Users/sac/repop → "fatal: not a git
  repository". There is no `.git` at /Users/sac/repop. Untracked-evidence census
  cannot be produced as specified; file-count census therefore UNVERIFIED. (Working
  tree itself is present and populated; only VCS metadata is absent.)
- **Which lane owns each in-flight surface**: receipt names the boundary (abi-surface
  drift, receipt/CAS API churn) not the owning lane IDs — lane ownership of
  `UnsealedReceipt`/`cas::adopt` was not traced in this lane.
- **Clippy on repop-kernel / repop-kernel-wasm**: not run (kernel clippy would not
  compile; abi clippy ran, exit 0).
- **Test-passing counts for kernel/wasm**: 0 (compile-abort), so no pass/fail counts
  exist to record.

## Census

- Crates present in kernel/: repop-abi, repop-kernel, repop-kernel-wasm (3). The
  solver/CAS/receipt crates named in the dispatch brief are separate test targets
  inside repop-kernel (`cas_differential_courts`, `receipt_differential_courts`,
  `unit_state`, `boundary_sweep_courts`) not separate crates.
- Footprint script: kernel/scripts/footprint_gate.py (present, exit 1 on wasm compile).
- Clippy warnings: 1 — `AbiError::DegenerateNormal { .. }` pattern on a unit variant,
  crates/repop-abi/src/lib.rs:88.
