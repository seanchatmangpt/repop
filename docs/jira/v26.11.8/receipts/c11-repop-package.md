# C11 — repop React package (Wave-3 construct lane)

Standing: PARTIAL_ALIVE — gates ran this session (commands+exits below); ownership disputes inside `packages/repop/src/` disclosed under collision law.

## Gates (real runs, 2026-11-08)

| Gate | Command | Exit | Result |
|---|---|---|---|
| Type | `pnpm exec tsc --noEmit` (in packages/repop) | 0 | ALIVE at 15:32–15:34 window; see collision note |
| Unit | `pnpm exec vitest run` | 0 | 18/18 at 15:33:26; see collision note |
| Owned filter | `vitest run src/provider.test.tsx src/selector.test.tsx src/hooks/useCgapEntity.test.tsx src/hooks/useHyperplane.test.tsx` | 0 | 13/13 owned tests ALIVE at 13:34:46 |
| Mutation leg | guard-throw reverted to silent default in `useRepopClient.ts` | 1 test flipped red | court non-vacuous; restore → green |

Note: the last full-package tsc run exited 2 ONLY on `src/RepopBoundary.test.tsx(6,10) TS6133 'act' unused` and the last full vitest run had 5 reds — all inside `RepopBoundary.tsx`/`RepopBoundary.test.tsx`, P13's actively-iterating in-flight file landing into this lane's owned dir mid-run. SLA unblocks already applied to two earlier P13 in-flight breaks (useActor.ts import + RepopBoundary.tsx `void clear` marker, disclosed in both lanes' receipts per collision law). Coordinator owns drain.

## Owned files (written this lane)

- `/Users/sac/repop/packages/repop/package.json` — name `repop`, sideEffects false, react peer `^18 \|\| ^19`, `@repop/client: workspace:*`, typecheck/test scripts
- `/Users/sac/repop/packages/repop/tsconfig.json` — extends base, bundler-mode, DOM libs, jsx react-jsx
- `/Users/sac/repop/packages/repop/vitest.config.ts` — jsdom env (minimal unblock of absent P15 infra; P15 owns test infra)
- `/RepopProvider.tsx` — lazy boot in effect (never render/SSR), DI seam `client`/`createClient?`, SSR placeholder client with stable EMPTY snapshot + typed WORKER_REFUSED on commit/solve, injected clients NEVER disposed, singleton refcount dispose-on-last-unmount, useMemo context value
- `/src/context.ts` — RepopContext undefined-default (fail-closed guard law)
- `/src/types.ts` — structural RepopClient contract, RepopSnapshot, EMPTY + STABLE_PROJECTIONS re-exports
- `/src/errors.ts` — refusal union STALE_VERSION / HYPERPLANE_BREACH / WORKER_REFUSED + STABLE_NULL / STABLE_PROJECTIONS
- `/src/useRepopClient.ts` — guard-throw useRepopClient, RepopProviderMissingError
- `/src/useRepopSelector.ts` — useSyncExternalStore, explicit getServerSnapshot → EMPTY, dev stability note (court proves React's own max-update-depth guard is the enforcement)
- `/src/hooks/useCgapEntity.ts` — slice selector + commitIntent CAS from CURRENT version; STALE/BREACH/WORKER refusals are typed RETURNS, never throws; stable missing-slice constant
- `/src/hooks/useHyperplane.ts` — useMemo pre-flight (memo identity law), solverMirror consumption when present else local pure eval with `verified: false` (UNVERIFIED-vs-kernel-parity)
- `/src/index.ts` — public surface
- `/src/test-support/testClient.ts` — real in-process client collaborator (Chicago: no mocks)
- Tests: `provider.test.tsx` (4), `selector.test.tsx` (3), `hooks/useCgapEntity.test.tsx` (3), `hooks/useHyperplane.test.tsx` (3) — 13 owned tests, all ALIVE

## Collision disclosures (same-checkout law)

- C10 landed the real `@repop/client` mid-lane; my C11 SLA shell of `packages/client` was superseded by C10's real store (types-only shell replaced — C10 owns). My React layer binds the structural contract in `src/types.ts`; an adapter to the landed `RepopClientStore` (generation/entityKeys/kernelReady snapshot shape differs from my structural snapshot) is UNVERIFIED-pending.
- P13 files landed inside my owned dir while my gates ran: `useActor.ts`, `client-seam.ts`, `RepopBoundary.tsx`, `useActor.test.tsx`, `RepopBoundary.test.tsx`. Compile breaks from their landing states were SLA-unblocked minimally (import fix + `void clear` marker + unused-import fix) and disclosed here. The 5 current reds are in P13's RepopBoundary.test.tsx — P13's to close.

## UNVERIFIED

- Adapter from my structural RepopClient to the landed `@repop/client` RepopClientStore — snapshot shapes differ (structural: status/entities/projections; landed: generation/entityKeys/kernelReady + EntityRecord{data:Uint8Array}); pending P10/C10 convergence on one snapshot law.
- `solverMirror` snapshot field — defined by this lane's hook contract; no producer landed yet.
- SSR court used renderToString only; no hydration court (P15 infra).
- Package-level tsc/vitest as-of-lane-end: red ONLY on P13's in-flight RepopBoundary files (see Gates note); my owned set green.
