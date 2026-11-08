# P11 — RepopProvider + Worker Lifecycle (Wave-2 Plan)

Standing: PARTIAL

## Charter

Own the React binding layer of `packages/repop` (P11 row,
`docs/wave-1-resolutions.md`): `RepopProvider` plus the context/hook seam it
exposes. Scope is provider + context files only — hooks (useCgapEntity,
useHyperplane, useActor) belong to P12/P13; this lane delivers the provider,
the React context they consume, and the worker lifecycle contract behind it.
Grounding citations: R6 (store template, AppProvider slot, test project law),
R10 (package step 6: `repop` React package), R5 (SAB check + postMessage
fallback), R11 (determinism + Chicago test law).

## Resolved decisions

Inherited from `docs/wave-1-resolutions.md`; refined here, not contradicted.

1. **Lazy worker boot.** `RepopProvider` mounts with NO worker. The worker
   boots on first consumer subscription (first `useSyncExternalStore`
   getSnapshot hit) or explicit `provider.bootstrap()`. Rationale: SSR must
   never touch `navigator`/`SharedArrayBuffer` (R5: COI is
   environment-fragile), and a mounted-but-unconsumed provider must not pay
   the `.avm` fetch cost. Boot is idempotent: concurrent boot requests
   collapse onto one in-flight promise (promise-map per P10 store pattern).
2. **DI injection seam for tests, default singleton.** Props:
   `workerFactory?: () => RepopWorkerHandle`, `client?: RepopClient`.
   Default = module singleton client per R6 `procurementDesignStore.ts`
   pattern (module-scoped instance + `Set<listeners>`). Tests inject a real
   in-process handle (Chicago: real collaborators, no mocks of owned code);
   no global mutable state is touched when the seam is used.
3. **SSR-safe getServerSnapshot.** The context exposes
   `useSyncExternalStore` with an explicit `getServerSnapshot` returning the
   stable fallback constants (R6 `tableFilterStore.ts:9-17` stable-fallback
   law). Server render never boots the worker and never allocates listeners.
4. **Cleanup only when self-created.** On unmount, the provider tears down
   the worker/client ONLY if it created them (default singleton path where
   it constructed the handle, or it was the first subscriber to trigger
   lazy boot). Injected instances (DI seam) are never cleaned up — owner
   disposes. Refcount subscribers to decide the self-created teardown edge.
5. **Guard-throw useRepopClient.** `useRepopClient()` reads the context and
   THROWS a typed `RepopProviderMissingError` when no provider is above it
   in the tree. Fail-closed per the inherited laws: never a silent default
   client. Error carries the component-adjacent fix hint (wrap in
   `<RepopProvider>`).
6. **Stable-selector law.** Context value identity changes only on
   (client identity, boot state) transitions — never per-frame. Selector
   consumers (P12/P13) receive the same stable-fallback constants on the
   server and pre-boot client so `getSnapshot` results are referentially
   stable across hydration. No new object literals inside render; memoize
   at the provider boundary.

## Owned files

- `packages/repop/src/provider/RepopProvider.tsx`
- `packages/repop/src/provider/RepopProviderMissingError.ts`
- `packages/repop/src/provider/useRepopClient.ts`
- `packages/repop/src/context/repopContext.ts`
- `packages/repop/src/context/repopContextValue.ts` (type + stable fallbacks)

Boundary: NOT owned — `packages/repop/src/hooks/*` (P12/P13),
`packages/client` (P10), `packages/worker` (P7/P8/P9), monorepo scaffolding
(P14). If a shared type must move, disclose in both lanes' receipts
(same-checkout-fanout collision law).

## Gates

| Gate | Command | Pass criterion |
|---|---|---|
| Type | `pnpm --filter repop typecheck` | exit 0 |
| Unit | `pnpm --filter repop test src/provider src/context` | all pass; jsdom project |
| SSR court | unit `provider.ssr.test.tsx` | renderToString; no COI globals; stable identity |
| Guard court | unit `useRepopClient.test.tsx` | no provider: typed throw; with: client |
| Lifecycle court | unit `provider.lifecycle.test.tsx` | injected handle not disposed; lazy boot |
| Mutation leg | revert guard-throw diff | guard court MUST flip to red on the reverted subject |
| Consumer gate | `pnpm --filter repop build` | exit 0, package entry emits |

No `.browser.test.tsx` in this lane — provider lifecycle runs in the jsdom
project; worker/WASM behavior is P7/P8's surface.

## Dependencies

- **P10** (`@repop/client`): RepopClient type + headless store contract
  (listeners, stable fallback constants). Blocked on its exported surface;
  typeimport only, no client edits.
- **P14** (scaffolding): `packages/repop/package.json`, tsconfig, tsup entry.
  If absent at start, coordinate — this lane does not create scaffold files.

## UNVERIFIED-pending

- Exact `RepopClient` type name/shape from P10 — UNVERIFIED until P10's
  export surface lands.
- React 19 `useSyncExternalStore` SSR behavior under the repo's exact React
  version — UNVERIFIED until the SSR court runs.
- Whether P14 scaffolding uses tsup or a bob-analog build — UNVERIFIED until
  P14 lands; gate command may need the filter name adjusted.
- Worker handle disposal API name (`dispose` vs `terminate`) — UNVERIFIED
  until P7/P9 protocol lands.
