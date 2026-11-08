# J07 — Wave-2 Plan: P7 Worker Boot Chain (P7)

Standing: PARTIAL

## Charter

Specify the `@repop/worker` boot chain: AtomVM wasm boot under COI
(cross-origin isolation), SAB-backed WIR0 ring exchange, and a functional
postMessage fallback for non-COI environments. Plan only — no code in this
document; implementation is the P7 CONSTRUCT lane.

Subject: `/Users/sac/repop`, wave v26.11.8, lane J07 (single file:
`docs/jira/v26.11.8/plans/07-worker-boot.md`).

## Resolved decisions

From `docs/wave-1-resolutions.md` R5 (worker/SAB boot), E16, E20:

- **Vendored coi-sw.js at scope root.** AtomVM's `coi-serviceworker.js`
  is vendored into repop as `public/coi-sw.js` (no upstream path
  dependency; same vendor-copy law as R11 for cgap files). Registered by
  the boot FSM before any wasm load attempt.
- **SAB probe is ground truth, not crossOriginIsolated alone.** Boot
  decisions read `typeof SharedArrayBuffer !== "undefined"` plus a real
  `new SharedArrayBuffer(8)` construction probe. `crossOriginIsolated`
  is advisory telemetry only — environments exist where the flag lies in
  both directions. The probe result, not the flag, selects the transport.
- **One-shot reload with sessionStorage loop guard.** Port atomvm's
  graceful reload (atomvm-runtime.mjs lines 154–167) as a single reload
  attempt guarded by a sessionStorage key; on second entry the guard
  short-circuits to fallback instead of reloading again. The atomvm
  reload-loop bug class (reload storms) is NOT ported.
- **Boot FSM with typed states and bounded poll.** States: `IDLE`,
  `PROBE`, `SW_REGISTERING`, `RELOADING`, `PROBE_AFTER_RELOAD`,
  `SAB_BOOT`, `FALLBACK_BOOT`, `FAILED`. Worker readiness established by
  bounded poll: 20 attempts x 100ms deadline-checked on a real observable
  (worker `ready` message), never a fixed sleep. Timeout = `FAILED` with
  a typed reason, never a hang.
- **postMessage fallback REQUIRED and functionally complete.** COI is
  environment-fragile (E20). The fallback path must carry the full
  frame/receipt API surface (kernel instantiate, frame submit, receipt
  drain) so callers are transport-agnostic. SAB is a performance
  upgrade, not an API fork.
- **COOP/COEP credentialless headers in repop vite.config.ts.** Exactly
  per E16: `vite.config.ts` `server.headers` and `amplify.yml`
  `customHeaders`. `Cross-Origin-Embedder-Policy: credentialless` to
  avoid breaking Google Fonts. (amplify.yml itself is P15's file; this
  lane owns the vite.config.ts half only.)
- **Firefox fallback via SW.** Firefox lacks credentialless COEP; the
  coi-sw service worker path supplies isolation there. The FSM's
  `SW_REGISTERING` state and the SAB probe after reload cover this —
  Firefox takes the reload-then-SAB path, other non-COI environments
  take postMessage fallback.

## Owned files

- `packages/worker/src/boot/*` (FSM, probe, SW registration, reload
  guard, transport selection)
- `public/coi-sw.js` (vendored)
- `vite.config.ts` (COOP/COEP credentialless server headers)

Shared seams disclosed now: `amplify.yml` customHeaders is P15's;
worker transport trait consumed by kernel instantiation (P8) and
client store (P9). `packages/worker/src/*` outside `boot/` is P8's.

## Gates

- **G1 FSM legality**: every state transition is in the typed transition
  table; illegal transitions refused at compile time (discriminated
  union / exhaustive switch). Mutation leg: inject an illegal transition
  in a `.browser.test.tsx`, court must fail.
- **G2 fallback-required**: with the SAB probe forced to fail (real
  construct without COI headers), the postMessage path boots the worker
  and drains a receipt end-to-end. A skipped fallback test is FAIL.
- **G3 SAB happy path**: with COOP/COEP headers served (real vite dev
  server, real chromium via `.browser.test.tsx`), SAB probe passes and
  the ring round-trips a 64B frame. Assert final ring state, not call
  counts.
- **G4 reload guard**: simulate double-entry (guard key pre-set in
  sessionStorage) — no second reload occurs, FSM lands in
  `FALLBACK_BOOT`. Mutation leg: delete the guard, observe the reload
  fire once. A court that cannot flip is vacuous.
- **G5 headers**: real HTTP GET against the vite dev server returns
  `Cross-Origin-Opener-Policy: same-origin` and
  `Cross-Origin-Embedder-Policy: credentialless`. Assert on the actual
  response object.
- **G6 no-sleep grep**: `packages/worker/src/boot/` contains zero
  `Process.sleep`/`setTimeout`-as-coordination; the only timing is the
  bounded 20x100ms poll on the ready observable.

## Dependencies

- P4 — ABI layouts (frame/register/receipt) consumed by the ring and
  fallback codec.
- P6 — kernel wasm artifact; boot FSM instantiates it post-readiness.
- P8 — kernel instantiation inside the worker (sibling, not this lane).
- P9 — client store consumes the transport-agnostic API.
- P11 — vitest browser project config (`.browser.test.tsx` runner G2/G3
  ride on).
- P15 — amplify.yml customHeaders (deployment half of G5).

## UNVERIFIED-pending

- Exact atomvm `coi-serviceworker.js` version/SHA to vendor — UNVERIFIED
  until the vendoring commit lands with the source SHA recorded.
- Whether vite dev server headers apply to service worker script
  responses (G5 may need a dev-server plugin or `preview` mode) —
  UNVERIFIED until G5 runs for real.
- Safari/WebKit behavior under credentialless COEP — untested; fallback
  path is the designed answer, but no receipt exists yet.
- Poll budget 20x100ms sufficiency on slow CI chromium — UNVERIFIED
  until G2/G3 run in CI.
