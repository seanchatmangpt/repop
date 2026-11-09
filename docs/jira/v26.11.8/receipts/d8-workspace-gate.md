# D8 — `cargo test --workspace` green without weakening any gate

Standing: ALIVE

## Subject

Repo `/Users/sac/repop/kernel` (workspace: repop-abi, repop-kernel, repop-kernel-wasm,
repop-bench). Host `cargo test --workspace` failed compiling the repop-kernel-wasm
lib-test: 4× E0433 `cannot find wasm32 in arch` + E0152 duplicate `panic_impl` — the
wasm32-only glue (panic handler, eh personality, `__heap_base` extern,
`memory_size`/`memory_grow` intrinsics, `#[global_allocator]`, `#![no_main]`,
`#![no_std]`) was compiled into the host test binary where none of it is lawful.

## Diff (all in repop-kernel-wasm src, plus one import line in repop-kernel tests)

`crates/repop-kernel-wasm/src/lib.rs`:
- `#![no_std]` → `#![cfg_attr(target_arch = "wasm32", no_std)]`; `#![no_main]` →
  `#![cfg_attr(target_arch = "wasm32", no_main)]` (on host, `no_main` dropped the
  lib-test harness's `main` → `_main` undefined at link).
- `#[panic_handler]` and `__rust_eh_personality` gated `cfg(target_arch = "wasm32")`
  (std owns panic/eh on host; kills the E0152 duplicate `panic_impl`).
- `read_frame` split into wasm32 arm (intrinsic-bounded read) + host twin returning
  `None` (typed refusal, never a fabricated pointer) under
  `cfg(not(target_arch = "wasm32"))`.
- `PanicInfo` import gated to wasm32.

`crates/repop-kernel-wasm/src/arena.rs`:
- `__heap_base` extern moved inside the wasm32-gated `heap_base()`; host twin returns 0.
- `mem_top()` split: wasm32 arm reads `memory_size(0)`; host twin returns `usize::MAX`
  so the alloc loop always takes the in-bounds path and never reaches growth.
- `memory_grow` call site routed through `grow_one_page()` with host twin returning
  `usize::MAX` (typed null at the call site); unreachable on host since `mem_top` is
  unbounded.
- `#[global_allocator]` + `GlobalAlloc` impl gated to wasm32; host keeps `GLOBAL_ARENA`
  as a plain static (std owns the host allocator, so the test harness never routes
  through the bump arena's raw pointers).
- `PAGE` const gated to wasm32; `GlobalAlloc` import gated.

`crates/repop-kernel/tests/unit_receipt.rs` line 5 (the one named warning line):
removed unused `UNSEALED_RECEIPT_MAGIC` from the import list.

## Gates (all run 2026-11-08, this session)

| Gate | Command | Before | After |
|---|---|---|---|
| Workspace tests | `cd kernel && cargo test --workspace` | exit 1 (E0433 ×4 + E0152 in repop-kernel-wasm lib test) | **exit 0**, 13 suites, 83 passed / 0 failed |
| wasm32 release build | `cargo build -p repop-kernel-wasm --release --target wasm32-unknown-unknown` | (built, hash `3cc67f94…370e6b`) | exit 0, **byte-identical**: sha256 `3cc67f94d67927d3bed1c995a99538d9c0facb98a211ec4e911a134c21370e6b` before = after, 901 bytes |
| Footprint gate | `python3 kernel/scripts/footprint_gate.py` | PASS (C6w landing) | **PASS**: build ok, all 9 pinned exports, no extras, 901 ≤ 131072, mutation leg refuses (missing `repop_abi_version`), non-vacuous |
| Clippy | `cargo clippy --workspace --all-targets` | exit 0 | exit 0, **zero warnings from this change**; remaining warnings pre-existing in repop-abi/repop-kernel/repop-bench (dead-code, clippy lints) |

## No gate weakened

The wasm32 release artifact is byte-identical (sha256 match, 901 bytes); the footprint
gate (build + exports + size + mutation legs) passes unchanged. Host behavior changed
only where the crate has no host semantics anyway (`read_frame` host arm = typed None;
`GLOBAL_ARENA` on host is a plain static; std owns host panic/eh/alloc). The crate has
zero host tests, so no host test logic was skipped or suppressed.

## Standing

ALIVE — all three gates re-run to exit 0 this session; wasm artifact byte-equivalence
proven by sha256, not size-only.
