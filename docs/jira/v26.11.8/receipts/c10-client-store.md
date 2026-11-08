# C10 — @repop/client Headless Store (Wave-3 Construct)

Standing: PASS

Lane: C10 (CONSTRUCT, P10 plan). Repo: /Users/sac/repop, package
`packages/client`.

## Gates (executed this session, real exits)

| Gate | Command | Result |
|---|---|---|
| Typecheck | `pnpm exec tsc --noEmit` (packages/client) | exit 0 (TSC-PASS) |
| Tests | `pnpm exec vitest run` | 7 files, 42/42 passed, 0 failed |
| No-React | `node scripts/no-react-gate.mjs` | exit 0 — 0 react imports under src/ |
| Zero-JSON | court inside `src/no-react.test.ts` | pass (pattern built at runtime so the court cannot self-match) |
| Mutation legs e/f | `src/snapshot-stability.test.ts` | court fires on both mutants (in-place-commit mutant violates identity court; allocating-empty mutant violates EMPTY-identity court) |

## Owned files (all landed)

- `packages/client/package.json` (@repop/client, NO react dep; vitest + tsc scripts)
- `packages/client/tsconfig.json` (extends tsconfig.base.json, strict)
- `packages/client/vitest.config.ts`
- `packages/client/scripts/no-react-gate.mjs` (standalone fail-loud gate)
- `packages/client/src/index.ts` (public surface)
- `packages/client/src/errors.ts` (RepopError base + RepopNotBootedError,
  StaleVersionError, TimeoutError, UnknownFrameError, WorkerRefusalError,
  BreachError — all typed, never thrown across the async seam)
- `packages/client/src/types.ts` (EntityRecord, status union,
  RepopSnapshot, RepopResult Either, TransportHandle, WorkerLike, WorkerFactory)
- `packages/client/src/store/repopClient.ts` (RepopClientStore: subscribe /
  getSnapshot / getServerSnapshot, whole-state cache with generation bump,
  immutable replace per entity)
- `packages/client/src/store/empty.ts` (EMPTY_ENTITIES / EMPTY_ENTITY_LIST /
  SERVER_SNAPSHOT module constants + binding selector-contract doc header)
- `packages/client/src/protocol/frames.ts` (frame union + binary encoder,
  9-byte header, 64B receipt — see UNVERIFIED-vs-C9)
- `packages/client/src/protocol/decode.ts` (decodeFrame → Either; truncate /
  length-mismatch → BreachError; unknown kind → UnknownFrameError)
- `packages/client/src/protocol/correlate.ts` (CorrelationMap: injected clock,
  injected timeouts, settle/refuse/sweep, no timers)
- `packages/client/src/worker/owner.ts` (WorkerOwner: idempotent start/terminate,
  injectable factory, transport view)
- Tests: `src/snapshot-stability.test.ts` (with mutation legs e–f),
  `src/correlation.test.ts`, `src/stale-version.test.ts`,
  `src/lifecycle.test.ts`, `src/kernel-ready.test.ts`, `src/timeout.test.ts`,
  `src/no-react.test.ts`, plus `src/test-support.ts` (real in-process
  FakeTransport / FakeClock / FakeWorker — Chicago, no mock framework).

## Design notes (as built)

- Either-shaped results everywhere: unbooted → RepopNotBootedError; refusal →
  WorkerRefusalError; deadline → TimeoutError; stale write or stale receipt →
  StaleVersionError; unknown/truncated frame → UnknownFrameError / BreachError.
  No `throw` crosses the async seam.
- Deadlines use an injected clock (`now` option) and explicit
  `sweepNow()` / inbound-frame sweeps — no `setTimeout`, no sleeps
  (no-sleep law; `timeout.test.ts` uses FakeClock.advance).
- Kernel-ready is a state transition: the frame flips readiness and re-commits
  so useSyncExternalStore subscribers get a new snapshot identity.
- Refusal law as built: a refusal frame rejects the correlated waiter; for an
  unknown corrId it still surfaces as the same typed refusal in the Either
  (fail-closed, never a silent swallow) — gate `correlation.test.ts:158`.
- Collision disclosure: C11 landed an SLA-minimal types-only shell at
  `src/index.ts` + `package.json` mid-flight (its header names P10 as the
  replacer). Verified `packages/repop` defines its own structural types
  locally and imports nothing from `@repop/client`, then replaced both files
  with the real surface, keeping C11's `sideEffects: false` and ts ^5.9.
  C11's `vitest run || echo` failure-masking test script was removed (a gate
  that cannot exit 1 is vacuous).

## UNVERIFIED

- Frame union + binary layout in `src/protocol/frames.ts` is the local
  provisional contract, marked UNVERIFIED-vs-C9 in-file: `packages/worker`
  did not exist at construct time, so P9's landed protocol could not be
  compared. Outbound request kind 0x10 is likewise UNVERIFIED-vs-C9. When C9
  lands, `kernel-ready.test.ts` layout pins are the court that must either
  hold or force the adapter rewrite.
- P1 (@repop/abi) receipt type: `lastReceipt` is pinned as a 64B Uint8Array
  copy per R3; the abi TS mirror's actual shape was not available — field
  type only, shallow impact.
- Mutation legs e/f are subclass-mutant proofs (the court's condition is
  evaluated against the mutant state and fires), not source-revert shim
  runs — full shim-court replay remains open.
- Tests exercise the store against real in-process fakes; no real Worker or
  kernel wasm participates in this lane (browser-court coverage belongs to
  P5/P7/P15 lanes).
