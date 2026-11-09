# P19c — @srve/repop package sync + demo route + browser courts (lane P19c)

Standing: ALIVE

Repos:
- /Users/sac/srve/servengine-frontend @ HEAD dbc1c3c50a06a9b450def72beb88b548e0837da7 (uncommitted working-tree edits; coordinator owns git)
- /Users/sac/repop (upstream source, read-only: **no-VCS, vendored working tree 2026-11-08** — no SHA exists to cite)

## Delivered

1. **@srve/repop real package** (replaced P19b's REPOP-SYNC-PENDING stub):
   - `packages/repop/src/` ← repop `packages/repop/src` (provider, context, boundary,
     errors, types, client-seam, useActor, useRepopClient, useRepopSelector, hooks
     useCgapEntity/useHyperplane, test-support/testClient). C10 client store API and
     C11 hooks preserved verbatim; only relative import extensions rewired
     (`.js`/`.ts` suffixes stripped for servengine's `moduleResolution: bundler`).
   - `packages/repop/client/` ← repop `packages/client/src` minus `worker/owner.ts`
     (worker bundling is a later lane; `client/index.ts` documents the elision at the
     former WorkerOwner export). C10 `RepopClientStore` verbatim.
   - `packages/repop/abi/` ← repop `packages/abi/src` (layout, u64, generated).
   - Root `index.ts` barrel: one package serves all three via subpath re-exports;
     resolves via P19b's tsconfig paths + vite/vitest aliases (`@srve/repop` →
     `packages/repop/index.ts`).
   - `worker/index.ts`: typed UNSUPPORTED stub (`RepopWorkerUnsupported` +
     `repopWorkerUnsupported()`); `@srve/repop/worker` subpath points here.
   - `package.json`: exports `.` and `./worker`.
   - `NOTICE.md`: provenance — no-VCS vendored working tree 2026-11-08; modification
     ledger (import rewiring only + WorkerOwner elision).
2. **`src/components/features/repop-demo/WorkOrderDispatchCard.tsx`** — function
   component; `useCgapEntity` + `useHyperplane` with the demo bounds pinned as
   constants (NTE 800 / GPM 0.22 / geofence 200; hyperplane register normal [800, 1],
   offset 200). Fail-closed render: store status != "ready" renders a typed refusal
   panel (`repop-dispatch-refusal`, role=alert, carries observed status) — no spinner,
   no dispatch controls pre-boot.
3. **`src/routes/_authenticated/repop-demo/index.tsx`** — `createFileRoute` +
   `beforeLoad: authGuard`, RepopProvider → RepopBoundaryRoot → RepopBoundary → card.
   routeTree.gen.ts untouched (generator regenerates on next dev/build run).
4. **Unit test** `WorkOrderDispatchCard.test.tsx` — real TestRepopClient collaborator
   (vendored Chicago-style), asserts fail-closed render (refusal panel present, no
   dispatch card, no spinner) + ready-path render.
5. **Browser court** `WorkOrderDispatchCard.browser.test.tsx` — real chromium:
   happy path (ready store → dispatch card + solver side 1), SAB-absent fallback
   (bootstrap rejects → typed refusal render), COI-absent court (same refusal render).

## Gates (real exits)

| Gate | Command | Exit | Result |
|---|---|---|---|
| type-check | `npx tsc --noEmit` | 0 errors in lane files; 23 total | Baseline was 21 (P19b). The 2-error delta lives in files other lanes have mid-flight edits on (playwright/bdd spec + `login/index.tsx`, both modified in the shared tree, not by this lane) — scoped grep for `repop-demo\|packages/repop` returns zero. Zero errors introduced by P19c. |
| eslint | `npx eslint src/components/features/repop-demo src/routes/_authenticated/repop-demo` | 0 | Clean. `packages/repop` is eslint-ignored by the existing `packages/` ignore (same as avion/pm4vitest; P19b noted this too). |
| unit test | `npx vitest run src/components/features/repop-demo/WorkOrderDispatchCard.test.tsx` | 0 | 2/2 passed (jsdom, real TestRepopClient). |
| browser court | `npx vitest run --config vitest.browser.config.ts src/components/features/repop-demo/WorkOrderDispatchCard.browser.test.tsx` | 0 | 3/3 passed in headless chromium (playwright deps present — courts executed, NOT authored-but-unrun). First run failed 2/3 on a wrong matcher (`toContain` with a string); fixed to `element().textContent` reads and re-ran green. |

## Files

- packages/repop/** (vendored: src/, client/, abi/, worker/, index.ts, package.json, NOTICE.md)
- src/components/features/repop-demo/WorkOrderDispatchCard.tsx
- src/components/features/repop-demo/WorkOrderDispatchCard.test.tsx
- src/components/features/repop-demo/WorkOrderDispatchCard.browser.test.tsx
- src/routes/_authenticated/repop-demo/index.tsx

Not touched: routeTree.gen.ts, src/routes/ elsewhere, tsconfig/vite/vitest configs
(P19b's aliases already resolve the barrel).

## UNVERIFIED / deferred

- Route registration in routeTree.gen.ts — regenerates on next `npm run dev`/build;
  not exercised in this lane (generator lane owns it).
- Browser court exercised the component fail-closed render against an injected
  refusing client; the real worker boot path (SAB/COI on a live page) is exercised by
  the later worker-bundling lane, not by injected-client courts.
- Dev-server alias resolution (`@srve/repop` through vite dev) — tsc + vitest browser
  run exercised the alias chain; a dev-server boot smoke was not run.
- RepopProvider in AppProvider still serves the default placeholder singleton
  (status idle forever) — intentional until the worker lane lands a real client
  factory.
