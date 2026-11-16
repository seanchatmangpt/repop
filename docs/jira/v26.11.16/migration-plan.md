# repop migration plan v26.11.16

Standing: UNVERIFIED

## Identity
- Path: /Users/sac/repop
- Remote: https://github.com/seanchatmangpt/repop.git
- Branch@sha: main @ e28d0f8 (tracks origin/main, ahead 0 / behind 0)
- Last commit: 2026-11-08; commits: 4; size: 5 MB
- Languages/build: pnpm workspace (package.json, pnpm-workspace.yaml, vitest, playwright) plus
  Rust kernel (`kernel/crates/repop-kernel`, Cargo.toml), justfile
- Nested repos: none

## Observed state
- Dirty: 18 modified: kernel/Cargo.lock, kernel/crates/repop-kernel/{Cargo.toml,src/lib.rs,
  src/receipt.rs,src/state.rs}, packages/worker/{package.json,src/boot/*,src/ocel/*},
  docs/jira/v26.11.8/receipts/d7-vendor-sha-pin.md
- Untracked: 65, grouped: `packages/` (13), `packs/` (7), `scripts/` (6), `docs/` (4),
  `kernel/` (2), `.run/` (1)
- Ahead/behind 0/0; stash: 0; unpushed branches: 0
- Build dirs: none present (no node_modules, no kernel/target); `scratch/` 280K
- Submodules: none; no README.md at top level

## What it is
"repop": a young (4 commits, all Nov 2026) workspace with a Rust kernel exposing receipts/state,
a WASM-booted TS worker with OCEL batch handling, packs, and playwright smoke tests. Licensed
under a custom `LICENSE-P28-SIL.md`. No README; purpose inferred from layout.

## Classification
ACTIVE (census agrees; 8 days old, wave-3 work in flight).

## Migration risk
HIGH relative to size: the entire wave-4 in-progress change set (18 modified + 65 untracked,
across kernel, worker, packs, scripts) exists only in this working tree. No stashes/branches.

## Recommended action
COMMIT-PUSH
1. `git -C /Users/sac/repop add -A && git commit -m "preserve(v26.11.16): in-flight wave after maxStaleRetries decision"`
2. `git -C /Users/sac/repop push origin main`
3. Cleanup (if present later): `rm -rf node_modules kernel/target .run test-results`
4. New machine: `git clone https://github.com/seanchatmangpt/repop.git`

## First commands on the new machine
`pnpm install && pnpm test` and `cargo check --manifest-path kernel/Cargo.toml` (stated, not run).

## See Also
- ../v26.11.9-integration/ (previous jira dir), ../v26.11.8/
- /Users/sac/docs/jira/v26.11.16/README.md (master index)
