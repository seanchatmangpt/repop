# P13 Wave-2 Plan: useActor + RepopBoundary

Standing: PARTIAL

## Charter

Lane J13-r, re-dispatch — the original writer never landed this file. Plan for the P13
surface of the repop React package: the `useActor` hook and the `RepopBoundary`
component, the typed containment layer between React consumers and the actor/refusal
fabric.

Framing:

- Wave-1 explore fleet (docs/wave-1-resolutions.md, build order step 6) placed useActor +
  RepopBoundary in `packages/repop`; worker/client seams come from P9/P10/P11.
- Disk state at plan time (2026-11-08): the P13 files already exist on disk —
  `packages/repop/src/client-seam.ts` (164 lines), `packages/repop/src/useActor.ts`
  (177 lines), `packages/repop/src/RepopBoundary.tsx` (156 lines). This plan doubles as
  the wave-2 court spec for that landed surface. Every claim in Resolved decisions was
  re-verified on disk this session, not recalled from session memory.

## Resolved decisions

### D1. Refusal vocabulary: 7 typed causes x containment class

Each refusal carries a containment class (`fallback` | `inline`) and a required
monotonic sequence number (the replay/dedup key). Unknown cause or missing seq fails
closed.

| Cause | Class | Law |
|---|---|---|
| HYPERPLANE_BREACH | fallback | fail-closed subtree swap; only breached entity swaps |
| STALE_VERSION | inline-first | inline retry up to maxStaleRetries, then fallback promotion |
| KERNEL_UNREADY | inline | auto-recovers on kernel ready; no user action |
| UNKNOWN_FRAME | fallback | fail-closed swap |
| HANDLER_THREW | fallback | handler defect is fallback-class containment |
| MAILBOX_FULL | inline | transient capacity; inline containment |
| ACTOR_NOT_FOUND | fallback | actor table miss; fallback-class |

Verified on disk: the 7-cause vocabulary appears in client-seam.ts (14 hits),
useActor.ts (3 hits), RepopBoundary.tsx (7 hits).

### D2. client-seam.ts: descope-safe client interface

Hooks program against a 4-method interface — `send`, `subscribe`,
`setUnhandledRefusalSink` (client-seam.ts:106), `isReady` — so worker/AtomVM boot state
never leaks into hook internals. A no-op sink stub exists at client-seam.ts:127 for the
descope path. Descope-safe means: hooks compile, typecheck, and behave lawfully with the
worker layer removed; degradation travels through refusal classes, never compile
coupling.

### D3. useActor: discriminated-union state machine, always-resolving send

- `IDLE_ACTOR_STATE` is a frozen stable-identity constant (useActor.ts:30,
  Object.freeze). A pid switch resets to this constant (useActor.ts:7 comment law),
  never to a fresh object — reference-stable reset.
- `send()` is always-resolving: it never rejects, so no unhandledrejection is possible.
  Unobserved refusals route to the boundary sink (`setUnhandledRefusalSink`).
- The state is a discriminated union over `status`; every send resolves with a typed
  refusal or a real result.

### D4. RepopBoundary: per-entity subtree swap

- Containment state is `Map<pid, refusal>`. On refusal, only the breached entity's
  subtree swaps to its fallback; siblings stay mounted (no global remount).
- STALE_VERSION runs inline-first with `maxStaleRetries` (RepopBoundary.tsx:84) then
  promotes to fallback (RepopBoundary.tsx:136, staleSeqs length vs maxStaleRetries).
- KERNEL_UNREADY auto-recovers on kernel ready (wait state, no swap).
- UNKNOWN_FRAME fails closed with a swap.
- A wrapped ErrorBoundary catches real throws, outside the refusal fabric.

### D5. Name-collision note

XState also exports `useActor`. Package scoping makes the name legal; the alias decision
(re-export as `useRepopActor`?) is deferred to the integration lane P19 — not this
lane's call.

## Owned files

- packages/repop/src/client-seam.ts
- packages/repop/src/useActor.ts
- packages/repop/src/RepopBoundary.tsx
- This plan doc: docs/jira/v26.11.8/plans/13-boundary-actor.md

## Gates

Every gate carries a mutation leg — the court fails when the law is violated, not only
when the code passes. Canonical mutation leg shared by G1-G5: delete the
always-resolving `.then` from `send` and the court must fail with a real unhandled
rejection; a court that still passes is VACUOUS.

- G1: refusal vocabulary closed-world — only the 7 causes, each with class + monotonic
  seq; unknown cause or missing seq fails.
  Mutation leg: delete a cause from the union (typecheck court fails); strip seq
  (court fails).
- G2: useActor pid switch resets to the IDLE_ACTOR_STATE constant, reference-stable.
  Mutation leg: mutate the reset to a fresh object; stable-identity assert fails.
- G3: breach on pid A swaps A's subtree only; siblings stay mounted.
  Mutation leg: mutate Map to a global flag; siblings remount; court fails.
- G4: STALE_VERSION inline-first with maxStaleRetries then fallback promotion;
  KERNEL_UNREADY auto-recovers on ready; UNKNOWN_FRAME fail-closed swap.
  Mutation leg: mutate inline-first to immediate fallback; retry-counting court fails.
- G5: client-seam descope safety — hooks stay lawful with the worker layer removed.
  Mutation leg: descope stub removed; hook court fails loudly, never silently.

Unit courts run in `.test.tsx` (jsdom project). The real-worker leg is
`.browser.test.tsx` (vitest browser project, real chromium, real AtomVM worker; P15
infra dependency).

## Dependencies

- P9 worker message protocol: refusal wire format + monotonic seq source.
- P10 client store: the store the seam wraps.
- P11 RepopProvider: sink and lifecycle binding in the AppProvider slot.

## UNVERIFIED-pending

- maxStaleRetries default drift: resolved facts say default 3; disk
  (RepopBoundary.tsx:84) shows default 2. Coordinator decides the canonical default
  before the G4 court runs.
- XState `useActor` alias decision: deferred to P19.
- All gate exits in this doc are UNVERIFIED: read-only plan lane, no courts executed
  this session.
- `.browser.test.tsx` real-worker leg: pending P15 test-infra receipt.
