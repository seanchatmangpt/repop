# Y3: WorkOrderDispatchCard geofence silent-default repair

Standing: PASS

## Subject

`src/components/features/repop-demo/WorkOrderDispatchCard.tsx` (untracked lane file, X19 wave)
and its unit court, in `/Users/sac/srve/servengine-frontend` (branch `main`).

## Defect

`readDemoWorkOrder` silently defaulted missing bound fields (`nte`/`gpm` → 0,
`geofence` → `GEOFENCE_BOUND`), so the hyperplane check passed vacuously on
entity data that never carried a real bound. Violates fail-closed law: malformed
input must yield a typed refusal, not a default-to-bound.

## Diff

- `readDemoWorkOrder(data: unknown): DemoWorkOrderParse` — discriminated union
  `{ ok: true, workOrder } | { ok: false, refusalReason }`. Any non-object
  payload or missing/non-finite `nte`/`gpm`/`geofence` returns a typed refusal
  naming the offending field. No default-to-bound path remains (exported for
  direct court reuse). `isFiniteNumber` rejects NaN/Infinity.
- Card body: parse via `useMemo`; on `!parsed.ok` renders a typed refusal panel
  (`data-testid="repop-dispatch-malformed"` with
  `repop-dispatch-malformed-reason` carrying the refusal reason) before any
  bound or hyperplane evaluation. Dispatch controls and the solver line do not
  render on malformed data. Hooks stay unconditional (React hooks law).
- Court added in `WorkOrderDispatchCard.test.tsx`: entity published
  `{ nte: 400, gpm: 0.3 }` (geofence absent) on a ready store → asserts the
  malformed refusal panel renders, the reason names `geofence`, and NEITHER
  `repop-dispatch-card` NOR `repop-dispatch-solve` is present. Mutation leg is
  inherent: the old silent-default behavior is the mutant — the assertions
  `queryByTestId("repop-dispatch-solve")` toBeNull and no dispatch card are
  exactly the checks the old code fails (it rendered side-1 pass with defaulted
  bounds).

## Gates (real exits)

- `npx vitest run --config node_modules/.y3/vitest.y3.config.ts src/components/features/repop-demo/WorkOrderDispatchCard.test.tsx` → exit 0, **3/3 passed**.
  Temp config dropped the unit project's `globalSetup` because a foreign server
  (Phoenix CompileError page) holds :4000 and `backend.globalSetup.ts`
  fail-closed refuses adoption; the card courts are no-network (TestRepopClient).
  Temp config deleted after the run.
- `npx tsc --noEmit` → 11 errors, **0 in repop-demo files**. The X19 census cited
  23 baseline errors; today's baseline is 11 (pre-existing failures shrank —
  baseline moved, not my files). Zero new errors introduced.

## Environment notes

- Full-suite vitest (`npm test`) is currently blocked repo-wide by the
  fail-closed backend identity guard (foreign :4000 listener) — pre-existing,
  not introduced by this lane.

## Files

- `/Users/sac/srve/servengine-frontend/src/components/features/repop-demo/WorkOrderDispatchCard.tsx` (edited)
- `/Users/sac/srve/servengine-frontend/src/components/features/repop-demo/WorkOrderDispatchCard.test.tsx` (edited)

## UNVERIFIED

- Browser court (`WorkOrderDispatchCard.browser.test.tsx` — payload is
  well-formed, expected unaffected) not run: browser project needs chromium
  headless; not exercised this lane.
- Full unit suite (`npm test`) not run (backend guard above).
- Git staging/commit: the entire `repop-demo/` directory is untracked on
  `main` (never tracked — no git history). Coordinator owns git transitions;
  staging is left to the coordinator, who should note the untracked-evidence
  law when landing this lane.
