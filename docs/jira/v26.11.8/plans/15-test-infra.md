# P15 — Test Infrastructure Plan (vitest projects, playwright, just courts)

Standing: PARTIAL

## Charter

Stand up the Wave-2 test infrastructure for the repop monorepo (P14
scaffolds the workspace; P15 owns everything that runs tests):

1. Two vitest projects under one `vitest.workspace.ts`:
   - **unit**: jsdom environment, excludes `*.browser.test.*`.
   - **browser**: `@vitest/browser` + playwright provider, real
     chromium, includes only `*.browser.test.*`.
2. A file-naming law that makes worker/WASM tests un-mockable:
   anything touching AtomVM wasm, SAB rings, or service workers is
   `*.browser.test.ts(x)` and therefore can never land in the jsdom
   project (jsdom has no SharedArrayBuffer/Atomics.wait).
3. A playwright crossOriginIsolated smoke: boot the dev server with
   COOP/COEP headers, open the page, assert
   `window.crossOriginIsolated === true` and that the AtomVM worker
   reaches ready. Fail-closed: missing header = red, never a skip.
4. Dev-server COOP/COEP headers so `crossOriginIsolated` is true
   locally, matching the amplify.yml production header set (R5).
5. `just` recipes: `just courts` (wraps the python mutation gate),
   `just verify` (aggregate chain), plus per-project test targets.

Every design claim below cites the Wave-1 resolutions
(`docs/wave-1-resolutions.md`) — R5, R6, R10, R11 and the shared
test law (Chicago, mutation legs, fail-closed).

## Resolved decisions

### D1. vitest workspace shape — two projects

`vitest.workspace.ts` at repo root declares `test.projects`:

```ts
export default defineWorkspace([
  'vitest.unit.config.ts',
  'vitest.browser.config.ts',
]);
```

- `vitest.unit.config.ts` — `environment: 'jsdom'`,
  `exclude: ['**/*.browser.test.*']` (plus vitest defaults),
  setup file for jsdom-only shims. Unit = headless store logic,
  pure ABI mirror checks, message-protocol frame router on
  ArrayBuffer (no Atomics.wait needed).
- `vitest.browser.config.ts` — `browser: { enabled: true,
  name: 'chromium', provider: 'playwright', headless: true }`,
  `include: ['**/*.browser.test.*']`. Real chromium, no mocks of
  the browser itself (Chicago law; R6/E6 precedent: worker/WASM
  tests are `.browser.test.tsx` against real chromium).
- 3-way alias law (R6): every config that resolves `@repop/*`
  mirrors `tsconfig.json` paths — vitest configs duplicate
  `resolve.alias` from vite.config.ts; a drift court asserts the
  three alias maps stay equal (see Gates).

### D2. File-naming law (`.test` vs `.browser.test`)

- `*.test.ts(x)` — runs in jsdom only. Must not import wasm,
  Atomics.wait, service workers, or any module that touches
  `SharedArrayBuffer` at import time. A lint/grep gate enforces
  this (Gates G4).
- `*.browser.test.ts(x)` — runs in real chromium via the browser
  project. REQUIRED for: AtomVM wasm boot (R1/E3/E8/E20), SAB ring
  behavior (R5/WIR0 slots), worker message protocol end-to-end,
  `postMessage` fallback path, COI smoke preconditions.
- The suffix is the only routing signal — no per-file tags,
  no manual project lists. A file's project is derived from its
  name alone.
- Mutation court for the gate itself: renaming a wasm-touching
  test to plain `.test.ts` must turn G4 red; moving it back must
  go green.

### D3. Playwright crossOriginIsolated smoke

`playwright.config.ts` at repo root:

- `webServer`: reuse the vite dev server (`pnpm dev`, port from
  vite config) so the same COOP/COEP headers serve both vitest
  browser runs and playwright — one header source, not two.
- Single smoke spec (`tests/e2e/coi-smoke.spec.ts`):
  1. Navigate to `/`.
  2. Assert `await page.evaluate(() =>
     window.crossOriginIsolated)` is `true`.
  3. Assert `SharedArrayBuffer` is constructible in page context.
  4. Await the worker-ready beacon (worker posts a typed ready
     frame; P9 owns the frame shape — P15 awaits a DOM event/
     selector, not the frame internals, to avoid a P9 dependency
     in the spec body).
- Fail-closed: if headers are missing, step 2 fails the run —
  there is no skip path, no `test.skip` on missing COI (E20: COI
  is environment-fragile, so the smoke exists precisely to catch
  that; a skip would be a vacuous gate).
- Non-vacuity leg: removing `Cross-Origin-Opener-Policy` from the
  dev header set must turn the smoke red; restoring must turn it
  green (mutation leg law, R11).
- Chromium channel: pinned via playwright's bundled chromium;
  the same browser binary serves `@vitest/browser` (provider
  playwright) so there is exactly one browser install.

### D4. COOP/COEP dev headers

- In `vite.config.ts` `server.headers` (~line 103 per E16):
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Cross-Origin-Embedder-Policy: credentialless`
    (credentialless, not require-corp — Google Fonts must keep
    loading; E16 explicitly chose credentialless for this).
- Single source of truth: the header map is exported from one
  module (e.g. `config/coi-headers.ts` or inline const consumed
  by vite.config.ts) so the amplify.yml `customHeaders` block
  (~line 24 per E16) can be diffed against it by a drift gate
  rather than by memory. (amplify.yml itself is owned by P19;
  P15 owns the dev-side map + the drift gate.)
- The AtomVM asset boot chain (`service-worker-manager.mjs`,
  `atomvm-runtime.mjs` SAB check + graceful reload, E20/R5)
  depends on these headers at runtime — header drift breaks boot,
  so the smoke (D3) is the header court.

### D5. `just` recipes

Root `justfile` gains (P14 owns the justfile skeleton; P15 owns
these recipes only):

- `just test` — `vitest run --project unit`
- `just test-browser` — `vitest run --project browser`
- `just e2e` — `playwright test` (runs the COI smoke)
- `just courts` — wraps the python mutation gate
  (`python3 scripts/mutation_gate.py` or the landed P5 court
  runner): runs every court's mutation leg, exits non-zero if any
  court fails to flip. Recipe exits 1 on any un-flipped mutation,
  2 on infrastructure error (missing python/browser), per the
  exit-code law (Gates G6).
- `just verify` — aggregate chain, fail-fast, ordered:
  1. lint/typecheck (P14's targets)
  2. `just test`
  3. `just test-browser`
  4. `just e2e`
  5. `just courts`
  Any step's non-zero exit aborts the chain with that exit code
  (no `|| true` anywhere — the rg fail-loud law applies to any
  tool-availability check inside the recipes: refuse to fake-pass).
- Kernel-side courts (P5's Rust differential/boundary courts) are
  invoked by `just courts` too, via the kernel crate's own runner;
  P15 owns the recipe line, P5 owns the runner.

## Owned files

- `vitest.workspace.ts` (new)
- `vitest.unit.config.ts` (new)
- `vitest.browser.config.ts` (new)
- `tests/setup/unit.setup.ts` (new; jsdom-only shims)
- `playwright.config.ts` (new)
- `tests/e2e/coi-smoke.spec.ts` (new)
- `config/coi-headers.ts` (new; dev header map single source)
- `vite.config.ts` — one edit: `server.headers` consume the map
  (coordinate with P14, who owns vite.config.ts; P15's edit is
  limited to the headers block)
- root `justfile` — recipes `test`, `test-browser`, `e2e`,
  `courts`, `verify` (per-lane module pattern; no cross-lane
  variable name collisions)

Not owned: `amplify.yml` (P19), package.json dependency entries
(P14 adds `@vitest/browser`, `playwright`, `vitest` versions;
P15 specifies them in Dependencies below), kernel court runner
(P5), worker frame shapes (P9).

## Gates

| Gate | Checks | Pass | Fail |
|---|---|---|---|
| G1 | unit project runs, excludes `.browser.test` | exit 0, 0 browser files executed | exit 1 |
| G2 | browser project runs in real chromium | exit 0 | exit 1 (2 if browser missing) |
| G3 | COI smoke red without COOP header | mutation leg flips | exit 1 |
| G4 | no wasm/SAB/Atomics imports inside `.test.*` | grep empty | exit 1 |
| G5 | 3-way alias maps identical (tsconfig/vite/vitest) | diff empty | exit 1 |
| G6 | exit-code law: 0/1/2/3 uniform | all runners | exit 1 on drift |

G6 is the consistency law: every runner this lane owns
(vitest both projects, playwright, courts recipe, verify chain)
maps outcomes to the same codes. `just verify` propagates the
first non-zero child code unchanged. A runner that exits 0 on a
skipped court is a vacuous gate — G6's court for `just courts`:
inject a never-flipping mutation, expect exit 1; hide python
from PATH, expect exit 2, never 0.

## Dependencies

- P14 (monorepo scaffolding): package.json + dependency installs
  (`vitest`, `@vitest/browser`, `playwright`, `jsdom`), justfile
  skeleton, vite.config.ts ownership — P15 builds on its targets.
- P1 (`@repop/abi`): unit tests import the generated TS mirror.
- P5 (kernel courts): `just courts` wraps P5's runner.
- P6/P7/P9 (SAB ring, boot chain, message protocol): define the
  `.browser.test` surface P15's naming gate protects.
- P11 (RepopProvider/lifecycle): browser tests boot through it.
- P19 (servengine-frontend): mirrors the header map into
  amplify.yml; consumes the same vitest project pattern (R6/E6).

## UNVERIFIED (pending Wave-2 execution)

- Exact `@vitest/browser` + vitest version pairing that works on
  this machine's chromium — pinned after first green browser run.
- `credentialless` COEP behavior with the AtomVM service worker
  fetch path (E16 validated it for fonts only) — smoke run
  decides; fallback is `require-corp` + crossorigin attrs on
  atomvm assets.
- Whether `just courts` needs a python venv wrapper or bare
  `python3` suffices — decided by first gate run exit code.
- Playwright webServer vs P14's dev-server port choice — port
  constant lands with P14's vite.config.ts; smoke config pins it
  after.
