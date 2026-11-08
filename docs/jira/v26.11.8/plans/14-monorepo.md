# P14 — Monorepo Scaffolding (ships FIRST in wave 3)

Standing: PARTIAL

## Charter

Establish the repop monorepo skeleton so every wave-3 lane lands inside a
working pnpm workspace from commit one. P14 owns the root: package manager,
workspace graph, shared TS config, verify-script aggregation chain, wasm build
orchestration, and P28-SIL vendored-copy attribution. All other wave-3 lanes
(P1-P13, P15-P20) are downstream consumers of this scaffold; nothing upstream
blocks it.

Grounded in wave-1 resolutions R10 (adopted build order) and R11 (cgap
vendored-copy license decision, determinism law, test law). Existing root
files on disk (`package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`)
are P14-owned and refined here, not rewritten from scratch.

## Resolved decisions

1. **pnpm workspace, `packages/*`.** `pnpm-workspace.yaml` globs
   `packages/*` (already on disk). Wave-3 package shells land as
   `packages/abi`, `packages/kernel` (wasm glue + courts mirror),
   `packages/worker`, `packages/client`, `packages/repop`. Kernel Rust stays
   at root `kernel/` (per R10 lane table) — it is NOT an npm package; it is
   consumed via the wasm artifact copied into `packages/worker/public/`.
   P14 does not create package contents — only empty shells with `package.json`
   + `tsconfig.json` extends, so downstream lanes fill them.

2. **Verify script aggregation chain.** Root `verify` = build → typecheck →
   lint → test, fanned via `pnpm -r run <script>` (already on disk). The
   aggregate leg adds kernel courts: `verify-aggregate` chains
   `pnpm run verify && cd kernel && just courts && just footprint` so a wave-3
   receipt gate runs one command end to end. Order is load-bearing: courts
   only run after a green build; a red early leg short-circuits (CI-gate
   masking accepted here deliberately — the chain is one lane's gate, not a
   fleet gate). Per-package `verify` scripts inherit the same names so
   `pnpm -r` aggregation stays uniform.

3. **Strict tsconfig, bundler resolution.** `tsconfig.base.json` (on disk):
   `strict`, `moduleResolution: "bundler"`, `verbatimModuleSyntax`,
   `isolatedModules`, `noUncheckedIndexedAccess`,
   `exactOptionalPropertyTypes`. Every package tsconfig is a single
   `{ "extends": "../../tsconfig.base.json" }` plus per-package
   `include`/`outDir`. No path aliases at the repop root — R6's three-place
   alias wiring is a servengine-frontend (P19) concern, not a repop one;
   workspace packages resolve via pnpm symlinks + `exports` fields.

4. **Wasm build orchestration: cargo → packages/worker/public.** Root
   `justfile` owns the chain: `just kernel-build` runs
   `cargo build -p repop-kernel --target wasm32-unknown-unknown --release`
   (R10 step 3, raw linear-memory/SAB, no wasm-bindgen hot path), then copies
   the `.wasm` artifact + `LICENSE-P28-SIL.md` notice into
   `packages/worker/public/wasm/` with a sha256 sidecar
   (`repop-kernel.wasm.sha256`) so the worker package can assert artifact
   identity at boot. `just verify` = `pnpm run verify-aggregate` after a
   kernel-build. Worker lanes (P6-P9) consume the public/ artifact, never
   cargo directly.

5. **P28-SIL vendored-copy attribution (R11 default, adopted).** Kernel
   deps cgap-blake3/cgap-branchless/cgap-arrow arrive as vendored copies
   under `kernel/vendor/` (no path-dependency on the cgap workspace — R11).
   Attribution implementation:
   - `LICENSE-P28-SIL.md` at repo root: license text + URN notice.
   - `NOTICE` at repo root: per-crate vendored provenance table
     (source repo, source SHA, vendored date, local path).
   - Each vendored crate dir carries an unmodified copy of its upstream
     `LICENSE` plus a `VENDORED.md` header stating source SHA + parent
     commit of the vendoring commit.
   - A root gate (inside `verify-aggregate`) greps: every
     `kernel/vendor/*/Cargo.toml` has a sibling `VENDORED.md`; every
     `kernel/vendor/*` has a LICENSE file; NOTICE lists every vendored dir.
     Fail-closed exit 1 on any missing attribution file.
   - Copy is byte-exact (`cp -p`), never regenerated — vendored source is
     evidence, like a receipt.

## Owned files

P14 owns exactly these paths (all others are downstream lanes' property):

- `package.json` (root, exists — refine scripts only)
- `pnpm-workspace.yaml` (exists — already final)
- `tsconfig.base.json` (exists — already final)
- `justfile` (new — kernel-build, artifact copy, verify-aggregate leg)
- `packages/abi/package.json`, `packages/abi/tsconfig.json` (shell)
- `packages/worker/package.json`, `packages/worker/tsconfig.json` (shell),
  `packages/worker/public/wasm/.gitkeep`
- `packages/client/package.json`, `packages/client/tsconfig.json` (shell)
- `packages/repop/package.json`, `packages/repop/tsconfig.json` (shell)
- `packages/kernel/package.json`, `packages/kernel/tsconfig.json` (shell —
  wasm-glue TS companion for P4)
- `LICENSE-P28-SIL.md` (new)
- `NOTICE` (new)

Out of scope: `kernel/` Rust sources (P2/P3/P4/P5), any package `src/`,
vitest/playwright config (P15), ggen pack (P16-P18).

## Gates

Fresh-clone gate, run from an empty-cache checkout:

| Gate | Command | Exit |
|---|---|---|
| Workspace resolves | `pnpm install --frozen-lockfile` | 0 |
| All packages build | `pnpm run build` | 0 |
| All packages typecheck | `pnpm run typecheck` | 0 |
| Kernel artifact chain | `just kernel-build && just verify` | 0 |
| Attribution gate | attribution check inside `verify-aggregate` | 0 |
| Mutation leg (non-vacuity) | delete one `VENDORED.md` → verify-aggregate exits 1 | 1 |

Shells are green-by-construction: empty `src/` with a placeholder export so
`tsc -b` and `tsup` have a real entry, never a skipped compile.

## Dependencies

- Upstream: none. P14 is the first-shipped wave-3 lane.
- Downstream: all lanes. P1 needs `packages/abi` shell; P6-P9 need
  `packages/worker` shell + `just kernel-build`; P10 needs `packages/client`;
  P11-P13 need `packages/repop`; P15 needs the vitest slot in the workspace;
  P19 consumes published workspace layout.

## UNVERIFIED-pending

- `just kernel-build` end-to-end on this machine — R2 notes cgap justfile
  already targets wasm32-unknown-unknown, but repop's own kernel crate does
  not exist until P2/P3 land; gate marked UNVERIFIED until a real crate
  compiles.
- Attribution-gate mutation leg — court written but not executed against a
  real vendored tree (no vendor/ exists yet).
- tsup as per-package bundler — R10 says "tsup/bob-analog"; tsup unchosen on
  disk (no devDependencies anywhere). Decision deferred to first real package
  build; shells carry `main`/`exports` pointing at `dist/` so either bundler
  slots in without shell edits.
- Exact pnpm lockfile — cannot be minted until package shells carry
  dependencies; first `pnpm install` in wave 3 writes it.
