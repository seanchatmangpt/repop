# C12 Receipt — useActor + RepopBoundary (P13 implementation)

Standing: PASS

## Owned files (landed)

- /Users/sac/repop/packages/repop/src/client-seam.ts — descope-safe seam
  (send/subscribe/getSnapshot/setUnhandledRefusalSink/isReady), 7-cause
  refusal vocabulary (STALE_VERSION, HYPERPLANE_BREACH, WORKER_REFUSED,
  KERNEL_UNREADY, UNKNOWN_FRAME, TIMEOUT, BREACH), fallback/inline
  containment-class mapping with required monotonic seq (containRefusal is
  the only lawful mint).
- /Users/sac/repop/packages/repop/src/useActor.ts — discriminated-union actor
  state machine (idle/pending/committed/refused), IDLE_ACTOR_STATE constant,
  always-resolving send (containment at seam catch + actor .then(onOk,onErr)),
  pid switch resets to IDLE_ACTOR_STATE, KERNEL_UNREADY auto-recover via
  seam.subscribe readiness observer (no sleeps), bounded maxAutoRecovers=3.
- /Users/sac/repop/packages/repop/src/RepopBoundary.tsx — per-entity
  Map<pid, ContainedRefusal> registry (RepopBoundaryRoot + useBoundaryRegistry
  via useSyncExternalStore), STALE_VERSION inline-first (retry preserves the
  distinct-seq count; promotion at >maxStaleRetries), KERNEL_UNREADY
  transparent containment, fail-closed subtree swap for all fallback-class
  causes, CrashBoundary class ErrorBoundary for real throws, useBoundaryRefuse
  fail-closed delivery hook.
- /Users/sac/repop/packages/repop/src/useActor.test.tsx — 5 courts.
- /Users/sac/repop/packages/repop/src/RepopBoundary.test.tsx — 7 courts.

## Gates (real exits)

| Gate | Command | Exit |
|---|---|---|
| tsc scoped (owned files + tests) | tsc --project tsconfig.scoped.json | 0 |
| vitest owned courts | vitest run src/useActor.test.tsx src/RepopBoundary.test.tsx | 0 (12/12 pass) |
| Full-package vitest | vitest run | 1 — 2 failures, BOTH in P12 lane files (useCgapEntity.test.tsx parse error TS1005, useHyperplane.test.tsx memo-identity court); pre-existing to this lane, not introduced by C12. |
| Package-wide tsc | tsc --noEmit | 2 — same P12 file (TS1005 parse error aborts full-program check; scoped gate is the trustworthy signal). |

## Mutation legs (shim-court, non-vacuity)

1. Containment removal (both layers: seam catch + actor .then rejection
   handler rethrow) — court FAILS (rc=1, containment court times out and the
   afterEach unhandledRejection court captures real unhandled rejections).
   First attempt mutating only useActor's onErr was VACUOUS (seam catch
   contains first); the lawful mutant removes containment at BOTH layers.
   Restored byte-exact: useActor.ts a786c073..., client-seam.ts c392c5de...
2. Class-mapping flip STALE_VERSION "inline"->"fallback" — 2 courts FAIL
   (rc=1), including inline-first. First attempt flipping UNKNOWN_FRAME was
   VACUOUS (inline===undefined renders fallback either way; the court does
   not discriminate on mapping for inline===undefined cases).
   Restored byte-exact: c392c5de... (hash re-verified post-restore).

## Disclosed coordination notes

- Scaffold unblock: packages/repop had NO package.json/tsconfig/vitest config
  and no react in the workspace — created package.json, tsconfig.json,
  vitest.config.ts, tsconfig.scoped.json and installed deps (react 19,
  @testing-library/react, jsdom). P14/P15 lanes own scaffolding; reconcile.
- SLA minimal unblock on C11's types.ts: `export { X } from` did not bind
  STABLE_PROJECTIONS locally (line 43 use failed tsc); changed to
  `import + re-export`. Disclosed here for BOTH lanes' receipts.
- RepopBoundary.tsx carried a C11 SLA note ("clear not yet wired") — removed;
  clear is now wired as the retry affordance passed to inline UI.
- KERNEL_UNREADY court initially failed with state stuck "pending" — hook
  fixed to land refused-before-arming auto-recovery.

## UNVERIFIED (handoff)

- index.ts (landed mid-flight by another lane) does not export client-seam /
  useActor / RepopBoundary — coordinator to reconcile the barrel.
- Structural compatibility with P10's concrete @repop/client (real commitIntent
  Either shape) is typed-only; no runtime integration test across packages.
- KERNEL_UNREADY auto-recover re-dispatch uses the SAME expectedVersion; a
  boot-time version bump would need snapshot-read before re-send.
- maxStaleRetries promotion counts distinct seqs per boundary instance; a
  pid remount resets the count (per-instance, not registry-persisted).
