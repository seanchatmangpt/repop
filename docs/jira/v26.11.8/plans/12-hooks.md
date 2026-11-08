# P12 — useCgapEntity + useHyperplane Hooks (Wave-2 Plan)

Standing: PARTIAL

## Charter

Plan the repop React hook surface (lane P12, `~/repop/packages/repop`):
`useCgapEntity` (slice selectors over the headless store) and `useHyperplane`
(memoized pre-flight solver mirror over bounds identity). Every design claim
cites `docs/wave-1-resolutions.md` (R6 store template, R10 build order step 6,
R11 test law) and the landed facts from the P12 plan. Output is an exact edit
plan; no code written by this lane.

## Resolved decisions

1. **Typed refusal unions, never throws.** The hook returns
   `HookResult<T> = { ok: true; value: T } | HookRefusal` where
   `HookRefusal` is a closed union: `STALE_VERSION | HYPERPLANE_BREACH |
   WORKER_REFUSED`. STALE_VERSION and HYPERPLANE_BREACH are returned
   values, not thrown exceptions — a React render must not enter an
   error boundary for a lawful stale/breach state. WORKER_REFUSED
   carries the worker's typed refusal payload verbatim (R6 zero-JSON
   binary frames decoded by the store, P10).
2. **CAS reads version at call time, not render time.** `commitIntent` reads
   the current snapshot version from the store at the moment of the CAS call
   (P3 kernel CAS registry is the authority). A version captured during
   render is display-only and never used as the expected-version operand.
   This closes the stale-render-clobber class: two components rendering the
   same snapshot cannot both commit.
3. **Store updates only on kernel ack.** No optimistic local mutation. The
   store (P10) applies a snapshot only after the kernel ack frame arrives via
   the worker ring (P6/P9). The hooks therefore never write to the store
   directly; they dispatch intents and render whatever snapshot the store
   last acked. Consequence: during in-flight commits the UI shows the last
   acked state plus the hook's own refusal/pending union.
4. **Selector law — module-level stable constants.** `STABLE_NULL` and
   `STABLE_PROJECTIONS` are module-level frozen constants. Selectors return
   these instead of inline `?? {}` / `?? null` literals, so
   `useSyncExternalStore` identity is reference-stable and re-renders are
   driven by real snapshot changes only. Precedent: servengine-frontend
   `tableFilterStore.ts:9-17` stable-fallback constants law (R6).
5. **useHyperplane memoization.** Pre-flight solver mirror memoized over
   bounds identity with a `WeakMap<BoundsIdentity, Mirror>`. Re-render with
   the same bounds object returns the cached mirror without re-solving;
   a new bounds identity invalidates. Bounds identity is the dependency, not
   a deps array — structural, not positional.
6. **Solver parity = generated, never hand-duplicated.** The TS solver mirror
   (`solverMirror.ts`) and pinned `parityVectors.ts` are ggen-generated from
   the same ontology as the kernel solver (R11 determinism law; P16/P18 pack
   is the generation contract). Hand-duplication of solver math in TS is
   banned. Parity is proven by a three-legged proof:
   (a) drift court — generated mirror vs kernel on a swept input corpus,
   (b) pin-vector court — mirror output vs the pinned coefficient vectors,
   (c) live browser differential — real wasm kernel in `.browser.test.tsx`
   (R6 test law) with bit-level f64 compare against the mirror.

## Owned files

- `packages/repop/src/hooks/*` (this lane adds:
  `useCgapEntity.ts`, `useHyperplane.ts`, `hookResult.ts` types,
  `stableConstants.ts`, `solverMirror.ts` + `parityVectors.ts` [generated],
  plus `.test.tsx` and `.browser.test.tsx` co-located per file)

## Gates

| Gate | What it kills | Mutation leg |
|---|---|---|
| pin-vector court | mirror drifts from pinned coefficients | flip one coefficient → court FAILs |
| live differential court | mirror vs real wasm, bit-level f64 | perturb kernel decode → mismatch |
| memo identity court | WeakMap cache returns stale mirror | mutate bounds identity → invalidates |
| CAS court | commit uses render-time version | stale expected-version → refuses STALE |
| selector-law court | inline `?? {}` breaks ref stability | inline literal → re-renders change |

Sweep gates: no `?? {}` / `?? null` inline fallbacks in hook sources; no
`Process.sleep`-style timing in tests (bounded polls on store observables);
zero-JSON across the worker boundary asserted by the router court (P9).

## Dependencies

- **P1** (`packages/abi`): 64B frame layouts + TS mirror — hook types decode
  nothing without the ABI types; exact coefficient values P1/P16-owned.
- **P2** (kernel solver): hyperplane solver semantics the mirror must match;
  parityVectors are pinned against P2's ontology output.
- **P10** (`packages/client`): headless store — subscribe/commitIntent/
  snapshot-version API the hooks consume; store/provider API names are
  UNVERIFIED until P10 lands.

## UNVERIFIED-pending

- Exact coefficient values for `parityVectors.ts` — owned by P1/P16; this
  plan pins the mechanism (ggen generation from shared ontology), not values.
- Store/provider API names (subscribe, getSnapshot, commitIntent signatures)
  — owned by P10/P11; hook signatures above are drafted against the P10
  pattern (procurementDesignStore module-singleton + listeners, R6) and may
  rename on P10 landing.
- Worker refusal payload shape crossing WORKER_REFUSED — owned by P9 router.
