# Y1 — wasm-boot export allowlist repair (X9 census)

Standing: PARTIAL_ALIVE

## Subject

- Repo: `/Users/sac/repop`
- Files:
  - `packages/worker/src/boot/wasm-boot.ts` — allowlist repaired
  - `packages/worker/src/boot/wasm-boot.test.ts` — drift guard + contract tests
- Authority: `kernel/scripts/footprint_gate.py` (REPOP_FUNCS, lines 24-35 —
  the measured release-build export table, pinned by lane C6's footprint gate)

## Diff

- Replaced the 6 invented allowlist names (`repop_frame_submit`, `repop_frame_drain`,
  `repop_solver_step`, `repop_cas_version`, plus the other 2) with the 9 pinned
  exports: `repop_abi_version`, `repop_version`, `repop_scratch_alloc`,
  `repop_scratch_reset`, `repop_scratch_remaining`, `repop_solve`,
  `repop_receipt_emit`, `repop_cas_commit`, `repop_cas_read`.
- Added `STRUCTURAL_EXPORTS` = `memory`, `__rust_eh_personality` — mirrors the gate's
  STRUCTURAL_EXPORTS exemption; a real artifact's `memory` export is no longer refused
  as an extra. `checkExportContract` extras check now exempts the structural set.
- Drift guard: `wasm-boot.test.ts` reads the footprint gate file (path resolved via
  `import.meta.url`, so it works from any vitest cwd) and asserts
  `KERNEL_EXPORT_ALLOWLIST == REPOP_FUNCS` (order-independent), plus a second test
  asserting the structural sets match. Fail-closed: missing gate file or unparseable
  table throws loudly.
- Boot-FSM files (`boot-fsm.ts` / `boot-fsm.test.ts`) carry no export names — nothing to
  update there (grep-verified); the wasm-export contract test is `wasm-boot.test.ts`.

## Gates

- `npx tsc --noEmit` (packages/worker) — exit 0, TSC-OK
- `npx vitest run` (packages/worker) — 102/102 passed (99 baseline + 3 new), 15 files
- Shim court (non-vacuity): sed-flipped `repop_solve` -> `repop_solve_SHIM` in
  footprint_gate.py -> drift-guard test FAILED as required; restore verified via
  `sha256sum -c` — OK, byte-exact.

## UNVERIFIED

- Runtime instantiation against the real artifact at boot: the `.wasm` artifact is
  not in the repo yet (C15 deferral); `instantiateKernel` remains UNVERIFIED
  end-to-end. The contract is now pinned to the gate's measured table, so name
  drift cannot hide behind an unpinned allowlist.
