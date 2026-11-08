# C6 (P4) — Kernel wasm glue + footprint gate — Wave-3 CONSTRUCT receipt

Standing: PASS (flipped from PARTIAL_ALIVE by C6w wire-up, 2026-11-08 —
see `c6w-wireup.md` in this dir; the repop-abi re-attach UNVERIFIED item
below is closed by that receipt)

## WIRE-UP (C6w, 2026-11-08)

The decoupled repop-abi path dep is re-attached; `repop_abi_version` reads
`repop_abi::layout_spec::LAYOUT_VERSION`; `repop_solve` / `repop_receipt_emit`
validate frames through the real repop-abi codecs (bounds-checked read,
fail-closed typed refusals); `repop_cas_*` stay `ERR_UNWIRED` for P2/P3.
Gates re-run: build exit 0 (artifact 901 bytes, was 559), footprint gate
exit 0 (all 4 legs incl. mutation non-vacuity), export list still exactly 9.
Runtime probe: valid frames → ERR_UNWIRED, garbage → typed refusals, OOB
offset → typed refusal, no trap. Full evidence: `c6w-wireup.md`.

## Gates (ran this session, real exits)

| Gate | Command | Exit | Result |
|---|---|---|---|
| Build | `cargo build --release --target wasm32-unknown-unknown -p repop-kernel-wasm` (cwd `/Users/sac/repop/kernel`) | 0 | artifact `target/wasm32-unknown-unknown/release/repop_kernel_wasm.wasm` |
| Footprint gate (all 4 legs) | `python3 scripts/footprint_gate.py` (cwd `/Users/sac/repop/kernel`) | 0 | build ok / exports 9-of-9 exact via wasm-objdump / size 559 <= 131072 / mutation flips exports leg (missing `repop_abi_version`), mutation build root deleted after |
| Mutation non-vacuity | (gate leg 4) | 0 | mutated module FAILS exports leg -> gate refuses; a pass would exit 1 VACUOUS GATE |

Artifact size: **559 bytes** (budget 128 KiB = 131072). Strip+fat-LTO+opt-level
"z" profile effective from the workspace root `kernel/Cargo.toml`.

## Export surface (pinned, gate-enforced)

`repop_abi_version`, `repop_version`, `repop_scratch_alloc`,
`repop_scratch_reset`, `repop_scratch_remaining`, `repop_solve`,
`repop_receipt_emit`, `repop_cas_commit`, `repop_cas_read` — exact match, no
unauthorized extras; structural exports `memory` + `__rust_eh_personality`
permitted. Panic = `wasm32::unreachable`; eh personality stable `#[no_mangle]`
stub. Arena over `__heap_base` with one-page-at-a-time `memory.grow`, growth
refusal returns null/`ERR_OOM` (documented fallback). Placeholders
(`repop_solve`, `repop_receipt_emit`, `repop_cas_commit`, `repop_cas_read`)
return `ERR_UNWIRED = 7` from `src/abi.rs` until P2/P3 wire `repop-kernel`.

## Owned files (all written this session)

- `/Users/sac/repop/kernel/crates/repop-kernel-wasm/Cargo.toml`
- `/Users/sac/repop/kernel/crates/repop-kernel-wasm/src/lib.rs`
- `/Users/sac/repop/kernel/crates/repop-kernel-wasm/src/arena.rs`
- `/Users/sac/repop/kernel/crates/repop-kernel-wasm/src/abi.rs`
- `/Users/sac/repop/kernel/scripts/footprint_gate.py`

## Shared-seam edits (disclosed, non-owned)

- `/Users/sac/repop/kernel/Cargo.toml` — added `[profile.release]` at the
  workspace root (cargo ignores non-root package profiles; without this the
  fat-LTO/strip profile is dead text). Lane C6 attribution comment inline.

## Compile-freeze SLA disclosure (repop-abi decoupling)

`repop-abi` was mid-flight from its owning lane at build time (missing
`receipt.rs` module, `derive(Eq)` on f64 frames — build errors cited above in
session log). I did NOT edit its sources. Instead the path dep is temporarily
decoupled in `repop-kernel-wasm/Cargo.toml` (disclosure comment inline,
"re-attach when P1 lands"). Effect: export signatures are Ptr-offset-based,
not typed by repop-abi layouts yet. Re-attaching is one Cargo.toml line plus
re-typing the four placeholder signatures.

## UNVERIFIED

- Placeholder capabilities (`repop_solve` / `repop_receipt_emit` /
  `repop_cas_*`) return `ERR_UNWIRED`; they are not the solver/CAS/receipt
  behavior — P2/P3 landing is required before any capability claim.
- `repop-abi` re-attach: export signatures not yet validated against real P1
  64B layouts (dep decoupled, see disclosure).
- Size budget: 559 bytes is the first measured number; the 128 KiB budget is
  the dispatch target, not yet re-validated after P2/P3 kernels land (solver
  + CAS + blake3 will grow the artifact; gate will hold whatever is pinned
  then — consider re-pinning a tighter budget at that point).
- eh-stub necessity on wasm32-unknown-unknown: stub kept (cgap precedent);
  no runtime probe was run to confirm it is required vs merely permitted.
- Gate python-fallback export parser: exercised only implicitly via the
  objdump path in this run (objdump present); fallback leg itself was NOT
  independently executed this session (loud skip exit 3 path untested).
- No git commit made (coordinator owns git transitions).
