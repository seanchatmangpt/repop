# P10 — @repop/client Headless Store (Wave-2 Plan)

Standing: PARTIAL

## Charter

Plan the headless, React-free client store for `@repop/client` at
`/Users/sac/repop/packages/client`. The store is the only state authority above the
worker: it owns entity snapshots, in-flight promise correlation, and listener
notification, and exposes a `useSyncExternalStore`-compatible contract so the React
package (P11-P13) binds without the client importing React. All design claims cite
`/Users/sac/repop/docs/wave-1-resolutions.md` (E10 pattern law, R6, R10 step 5).

## Resolved decisions

All decisions resolved from wave-1 receipts; none contradict coordinator defaults (R11).

1. **React-free external store.** `packages/client/src` never imports `react`
   (E10, R6). The store is a module-level singleton class with a
   `Set<() => void>` listener set, mirroring
   `procurementDesignStore.ts` (R6) and `tableFilterStore.ts:9-17` fallback
   constant law. React enters only in `packages/repop` (P11-P13) via
   `useSyncExternalStore(store.subscribe, store.getSnapshot)`.
2. **Reference-stable snapshots + module-level EMPTY fallbacks.** `getSnapshot`
   returns the same object identity until a real mutation; selectors that would
   otherwise allocate return a shared module-level constant (e.g.
   `const EMPTY_ENTITIES: ReadonlyMap<...> = new Map()`,
   `const EMPTY_HYPERPLANE: HyperplaneSnapshot | null = null`) so
   `useSyncExternalStore` does not loop on `Object.is` inequality
   (`tableFilterStore.ts:9-17` law, R6).
3. **Entity map: version / status / lastReceipt.** Per-entity record shape:
   `{ data, version, status, lastReceipt }` where `status` is a closed union
   (`idle | loading | ready | stale | refused`) and `lastReceipt` is the 64B
   UnsealedReceipt summary from the worker (R3 receipt tiering). Stale-version
   writes are typed refusals, never silent overwrites (fail-closed, inherited law).
4. **Promise correlation map.** Outbound frames carry a correlation ID (P9
   router contract, zero-JSON binary frames); the store keeps
   `Map<corrId, { resolve, reject, entityKey, deadline }>`, settles on receipt
   dispatch or typed refusal frame, and sweeps deadlines so a dropped worker
   rejects rather than hanging.
5. **Worker lifecycle ownership.** The client does NOT boot the worker. It
   accepts an injected transport handle (`{ send, subscribe }`) so P11
   (RepopProvider) owns lazy boot, COI/SAB vs postMessage fallback choice
   (R5: fallback REQUIRED), and teardown. Client-side transport tests use a
   real in-process fake transport (Chicago), not a mock framework.

## Owned files

- `/Users/sac/repop/packages/client/src/index.ts` — public surface
  (createClientStore, types, constants).
- `/Users/sac/repop/packages/client/src/store.ts` — store singleton:
  entity map, listeners, subscribe/getSnapshot, mutation + notify.
- `/Users/sac/repop/packages/client/src/correlation.ts` — promise
  correlation map, deadline sweep, settle/refuse paths.
- `/Users/sac/repop/packages/client/src/selectors.ts` — slice selectors with
  EMPTY fallback constants.
- `/Users/sac/repop/packages/client/src/types.ts` — EntityRecord, status union,
  TransportHandle, typed refusal unions.
- Tests: `packages/client/src/*.test.ts` (unit project only; no worker here, so
  no `.browser.test.tsx` needed — worker tests belong to P5/P7/P15).

No other lanes' files are touched. `packages/repop` (hooks, provider) is
explicitly out of scope.

## Gates

| Gate | Command (outline) | Pass condition |
|---|---|---|
| Snapshot stability | vitest unit court | Same identity before mutation; new after; EMPTY stable |
| Rejection paths | corrupt/corrId miss/deadline/stale | Typed refusal; rejects; no silent change |
| No-React-import | `rg "from 'react'" packages/client/src` | 0 matches (fail-loud guard first) |
| Zero-JSON boundary | `rg "JSON.(parse\|stringify)" src/` | 0 matches (inherited law) |
| Mutation leg | revert store mutation in one court | court must flip to fail (non-vacuity) |

Chicago discipline: real in-process fake transport, final-state asserts on the
entity map; no `jest.mock`/`vi.mock` of owned collaborators.

## Dependencies

- **P9 (worker message protocol)** — frame router and correlation-ID wire
  contract. Client blocks on P9's emitted frame-type union; dependency is
  one-way (client consumes types, worker never imports client). If P9 lands
  after P10, P10 ships against the type union agreed here and a court asserts
  wire-compat when P9 lands.
- **P1 (@repop/abi)** — 64B layout TS mirror supplies the Receipt/record types
  referenced by `lastReceipt`.
- **P15 (test infra)** — vitest unit project config must exist before gates run.
- No dependency on P11-P13 (they depend on this store, not vice versa).

## UNVERIFIED-pending

- Exact frame-type union names from P9 — UNVERIFIED until P9's plan/receipt
  lands; types.ts pins to this plan's provisional union until then.
- Whether the abi TS mirror (P1) exposes receipts as typed views over bytes or
  decoded structs — affects `lastReceipt` field type only.
- Footprint of the correlation deadline default (needs P15 timing harness
  numbers) — pinned constant, court-asserted, not a sleep (no-sleep law:
  deadline is injected, tests pass explicit deadlines).
- All gates in this plan are UNVERIFIED until run against real code in the
  construct wave; no gate has been executed yet (plan-only lane).
