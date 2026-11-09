# C15 — Test Infrastructure Receipt (wave v26.11.8)

Standing: PARTIAL_ALIVE

All C15-owned surfaces landed on disk and gated this session; chain exit 1
is honest red driven entirely by cross-lane env-shift failures (registered
below), plus one by-design loud skip.

## Owned files (all landed)

- `/Users/sac/repop/vitest.config.ts` — root runner, `test.projects`:
  unit (jsdom, excludes `**/*.browser.test.*`, `passWithNoTests: true`)
  + browser project referenced as `"vitest.browser.config.ts"`.
- `/Users/sac/repop/vitest.browser.config.ts` — browser project: real
  chromium, playwright provider, headless, includes only
  `packages/*/src/**/*.browser.test.{ts,tsx}`. Standalone-runnable.
- `/Users/sac/repop/playwright.smoke.config.ts` — testDir
  `playwright/smoke`, webServer boots `pnpm exec vite --port 5173
  --strictPort` (single header source: C14's `server.headers`).
- `/Users/sac/repop/playwright/smoke/crossOriginIsolated.smoke.spec.ts`
  — fail-closed COI court (headers + `crossOriginIsolated` + SAB
  constructible). No skip path for missing COI.
- `/Users/sac/repop/playwright/smoke/boot.smoke.spec.ts` — fail-closed
  worker-ready beacon court (contract:
  `document.documentElement.dataset.repopWorkerReady = "ready"` from the
  app composition root — P11 owns emitting it).
- `/Users/sac/repop/playwright/smoke/fixtures/coi.html` — fixture page
  (no app surface needed).
- `/Users/sac/repop/scripts/verify.sh` — gate chain, exit law
  0/1/2/3, no `|| true`; skips are `[SKIP] <reason>` lines.
- `/Users/sac/repop/scripts/test_file_convention_gate.py` — suffix law
  (`.spec` only under `playwright/`; Worker/SAB/WebAssembly/Atomics in a
  jsdom-routed `.test` file = refuse; comments exempt).
- `/Users/sac/repop/package.json` — scripts rewritten in-scope only
  (`test`, `verify`), added `test:browser`, `test:smoke`; devDeps added.
- `/Users/sac/repop/justfile` — created (none existed at root); thin
  wrappers `test`, `test-browser`, `test-smoke`, `verify`,
  `verify-aggregate`.

## Gates (real exits this session)

| Gate | Command | Exit |
|---|---|---|
| convention gate | `python3 scripts/test_file_convention_gate.py` | 0 (PASS, 89 files) |
| empty-suite no-tests handling | `npx vitest run --project unit --passWithNoTests packages/zzz-none` | 0 |
| unit project (full) | `npx vitest run --project unit` | 1 — 141 pass / 3 fail, all env-shift findings on other lanes' files |
| verify.sh syntax | `bash -n scripts/verify.sh` | 0 |
| justfile parse | `just --list` + `just -n verify-aggregate` | 0 |
| pnpm install | `pnpm install` | 0 (vitest 3.2.7, @vitest/browser 3.2.7, playwright 1.65.0, @playwright/test 1.65.0, vite 7.3.7, jsdom 27.4.0, @types/node 26.6.6) |
| playwright chromium | `npx playwright install chromium` | 0 — installed this session, exit 0. Browser leg IS verified, not uninstalled-UNVERIFIED. |
| COI smoke | `pnpm exec playwright test --config playwright.smoke.config.ts playwright/smoke/crossOriginIsolated.smoke.spec.ts` | 0 PASS (headers served, `crossOriginIsolated === true`, SAB constructible in real chromium) |
| COI mutation court | strip COOP header from vite.config.ts → rerun | mutated exit 1 (RED — court flips); restore sha256 `44cd61c1…` byte-exact before/after |
| boot smoke (direct) | full playwright run | 1 RED when run with no app surface — fail-closed by design |
| full chain | `bash scripts/verify.sh` | 1 — convention PASS, unit FAIL (cross-lane), coi-smoke PASS, boot-smoke [SKIP] |

## Registered findings (cross-lane, not C15 defects)

1. **jsdom runner realm/URL shift** — under the root unit project
   (jsdom), vitest makes `import.meta.url` http-based, so
   `new URL('.', import.meta.url).pathname` loses the filesystem prefix.
   Applied one-line SLA unblock to `packages/client/src/no-react.test.ts`
   (now `import.meta.dirname`, vitest-injected, realm-safe) — 2 tests
   went green. Disclose in the client lane's receipt. Post-fix: 141
   pass / 3 fail.
2. **worker ring tests are node-env tests** —
   `postMessageTransport.test.ts` (2 tests) and `wireRing.test.ts`
   "copies payload" fail under jsdom (MessageChannel semantics +
   cross-realm Uint8Array `toEqual` "no visual difference"). Pass under
   the worker package's own node-env config. Owning lane should either
   rename them `.browser.test.ts` (real MessageChannel is a browser
   surface) or fix the realm mismatch. Worker lane to disclose.
3. **repop package tests are order-dependent under parallel workers** —
   failures MOVED between runs (useHyperplane→RepopBoundary flip-flop;
   passes in isolation). Cause not diagnosed (worker parallelism /
   render-count interference). Repop lane to diagnose.
4. **Root vite devDep was absent** — C14 landed `vite.config.ts` with
   correct COOP/COEP credentialless headers (reconciled: no edit needed)
   but no root `vite` devDep; C15 pinned `vite@^7.3.7` (disclosed
   addition beyond the contract devDep list; the smoke's dev server
   requires it).

## Contract conflicts flagged (one line each, executed as disclosed)

- Contract named `@vitest/browser-playwright` — that is vitest-4-era
  packaging; the tree pins vitest ^3.2 (runner and package-level test
  files must share a major), so the coherent conservative pin is
  `@vitest/browser@^3.2.7`, where the playwright provider ships bundled.
  Real-chromium law unchanged.
- Contract named `playwright` as the runner dep; the test-runner surface
  is `@playwright/test` — both pinned `^1.55.0` (resolved 1.65.0).
- Contract filenames (`playwright/smoke/`, `playwright.smoke.config.ts`,
  single root `vitest.config.ts` with `test.projects`) differ from the
  P15 plan's file list (`vitest.workspace.ts` trio, `tests/e2e/`).
  Dispatch-is-executable: contract names won.
- C14's root vite config was present with the exact required header set —
  reconciled, zero edits (contract: "reconcile only the headers block").

## UNVERIFIED

- Browser project has no `.browser.test` files yet (none exist in the
  tree — worker/ring surfaces are the intended first tenants). The
  browser project config is landed but its first green run is
  UNVERIFIED until a `.browser.test` file exists.
- `credentialless` COEP vs the AtomVM service-worker fetch path — COI
  smoke validated headers + SAB only; actual AtomVM wasm boot needs the
  app surface (P8/P11).
- `@vitest/browser` 5.1.0 available — upgrade to the vitest-4
  `@vitest/browser-playwright` packaging is deferred to a coordinated
  workspace-wide vitest major bump.
