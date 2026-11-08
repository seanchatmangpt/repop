# P8 — AtomVM Integration Plan (Wave 2, lane J08)

Standing: PARTIAL

## Charter

Integrate the AtomVM BEAM-on-WASM runtime into `@repop/worker` so the worker
boots a real Erlang/OTP actor layer inside the browser: fetch the vendored
`AtomVM-web-agnostic.wasm`, load a prebuilt `.avm`, and bridge the JS OTP
supervisor shim to the cgap kernel's 64B intent frames over the SAB ring.
Scope is strictly the AtomVM seam — the boot chain (COI service worker, SAB
check, postMessage fallback) is P7; the binary frame router is P9.

Ground truth (R1, `docs/wave-1-resolutions.md`): the bootable asset is
`/Users/sac/unrdf/packages/atomvm` — prebuilt `AtomVM-web-agnostic.wasm`
(~0.67MB), `.avm` loader, `coi-serviceworker.js`, JS OTP layer (`src/otp/`,
`supervisor-tree.mjs`, `process-broker.mjs`), browser boot proven in
vitest-browser tests (E3, E8, E20). **No erlc on this machine** — no new
Erlang module compilation is possible in this wave. Popcorn has zero fleet
presence (E8) and is upstream-fetch, out of scope for v26.11.8.

## Resolved decisions

1. **AtomVM, not Popcorn.** R1 is binding. Any plan revision touching
   Popcorn contradicts the wave contract and is refused.
2. **`AtomVM-web-agnostic.wasm` vendored at build time.** The asset is copied
   from the unrdf atomvm package into `packages/worker/src/atomvm/assets/`
   by a build script (not committed as a path-dependency import), with a
   sha256 pin recorded in a `assets-pin.ts` module so the worker can assert
   asset identity at boot. Vendored-copy law per R11: no path-dependency on
   the unrdf workspace; attribution notice carried alongside.
3. **Prebuilt `.avm` only.** We ship the existing prebuilt `.avm` from the
   unrdf package. We do not compile Erlang. If the prebuilt `.avm` lacks
   behaviors the shim needs, the shortfall is listed DEFERRED, never
   hand-rolled BEAM bytecode.
4. **JS OTP supervisor shim.** A TypeScript shim (`otp-shim/`) adapts the
   unrdf JS OTP layer (`supervisor-tree.mjs`, `process-broker.mjs`) to
   repop semantics: actor mailboxes are bridged to kernel intent frames —
   an inbound 64B `IntentFrame` from the SAB ring is delivered as a mailbox
   message to the addressed actor; an actor's outbound reply/drift/breach is
   encoded back to 64B frames (or typed refusals) and pushed to the P9
   router. Zero-JSON across the boundary (inherited law): the shim is the
   ONLY place typed JS objects and binary frames meet.
5. **Honest DEFERRED list for anything needing erlc.** Anything requiring
   new Erlang module compilation (custom gen_server behaviors, new OTP
   applications inside the .avm, hot code loading) is DEFERRED with an
   explicit close condition (erlc or a prebuilt replacement .avm becomes
   available). See UNVERIFIED-pending.
6. **Descope recommendation.** If the prebuilt `.avm` + JS OTP shim cannot
   demonstrate a single end-to-end intent-frame round trip through a real
   AtomVM actor in `.browser.test.tsx` (Chicago, real wasm, no mocks), the
   recommendation is to DESCOPE AtomVM from v26.11.8: ship the kernel wasm +
   SAB ring (P4/P6/P7) as the sole worker runtime and re-target AtomVM for a
   later wave. The BEAM actor layer is enrichment, not load-bearing for the
   P1–P7 chain. Decision is flagged, not taken, in this plan (see
   UNVERIFIED-pending).

## Owned files

All under `packages/worker/src/atomvm/` (lane J08 exclusive; P6/P7/P9 own
siblings under `packages/worker/` but not this subtree):

- `assets/` — vendored `AtomVM-web-agnostic.wasm` + prebuilt `.avm`
  (build-script output, sha256-pinned)
- `assets-pin.ts` — sha256 constants + boot-time identity assert
- `vendor-atomvm.mts` — build script: copy from unrdf atomvm package,
  compute + write pins, fail-closed on missing/moved assets
- `runtime.ts` — wasm instantiation + `.avm` load, reusing the unrdf
  `atomvm-runtime.mjs` SAB check pattern (R5: lines 154–167) behind the
  P7-provided boot interface
- `otp-shim/` — JS OTP supervisor shim: `mailbox-bridge.ts` (IntentFrame
  <-> actor mailbox), `supervisor-adapter.ts`, `broker-adapter.ts`
- `atomvm.worker.runtime.ts` — package-internal entry wiring AtomVM into
  the P7 boot chain (registered as an optional runtime, postMessage
  fallback unaffected)
- `__tests__/atomvm.browser.test.tsx` — browser-project tests (R6 law:
  worker/WASM tests MUST be `.browser.test.tsx`, real chromium)

## Gates

| Gate | Command (shape) | Pass condition |
|---|---|---|
| Asset pin | `node .../src/atomvm/vendor-atomvm.mts` | exit 0; fail loud on missing assets |
| Boot identity | runtime.ts assert | sha256 mismatch = typed refusal |
| Browser boot | `pnpm vitest run --project browser` | chromium boots wasm + `.avm`; exit 0 |
| Round-trip | `.browser.test.tsx` court | 64B frame in -> actor -> out (P1 pin) |
| Mutation leg | corrupt one shim encode byte | court FAILs on mutated copy |
| Zero-JSON | grep sweep `src/atomvm/` | no JSON.stringify/parse on worker-boundary path |
| Type/lint | repo typecheck + lint | exit 0 |

Chicago law: tests drive the real vendored wasm and real `.avm` — no mocks
of AtomVM, the broker, or the ring; mutation leg proves the court can flip.

## Dependencies

- **P7 (boot chain)** — runtime.ts registers onto P7's COI service-worker
  boot + SAB check + postMessage fallback; J08 consumes the P7 boot
  interface, does not re-implement it. Sequencing: P7 interface frozen
  before `atomvm.worker.runtime.ts` lands.
- **P9 (message protocol)** — frame router owns correlation IDs and receipt
  dispatch; the shim encodes/decodes frames to the P1-pinned 64B layout and
  hands them to P9's router. Sequencing: P1 layout pin is the hard
  prerequisite for the round-trip court; P9 router may be stubbed by P9's
  published interface, not by a local mock (Chicago).
- **P6 (SAB ring)** — inbound/outbound frame transport; J08 depends on the
  ring's transport trait, not its Atomics internals.

## UNVERIFIED-pending

- **Descope decision itself** — the R6 descope recommendation (drop AtomVM
  from v26.11.8 if the end-to-end round-trip court cannot pass) is flagged
  for the coordinator, not decided here. UNVERIFIED until the court runs.
- **Prebuilt `.avm` capability surface** — which OTP behaviors the shipped
  `.avm` actually supports is UNVERIFIED until the browser boot court runs;
  the DEFERRED list below is provisioned from R1 and may grow.
- **unrdf asset stability** — sha256 of `AtomVM-web-agnostic.wasm` /
  `.avm` at vendoring time; pins are minted by `vendor-atomvm.mts`, not
  asserted in this plan.
- **DEFERRED (needs erlc or a new prebuilt .avm)**: new Erlang modules;
  custom supervisor behaviors beyond the existing JS OTP layer; hot code
  loading; any repop-specific OTP application. Close condition: erlc
  available on this machine, or an upstream prebuilt `.avm` that covers
  the shortfall.

Receipt (lane J08, Wave 2 plan): file
`docs/jira/v26.11.8/plans/08-atomvm.md`, read-only plan output, claims
cited to `docs/wave-1-resolutions.md` (R1, R5, R6, R11). No code written.
