# C7 / P7 — Worker Boot Chain Receipt

Standing: PARTIAL_ALIVE

## Gates (all run this session, exact commands + results)

- `tsc --noEmit` (packages/worker): 0 errors in `src/boot/**` — ALIVE.
- `vitest run src/boot` (packages/worker): 6 files, 24 tests, 24 passed, 0 failed — ALIVE.
- `cmp` atomvm `coi-serviceworker.js` vs `public/coi-sw.js`: BYTE-IDENTICAL — ALIVE.
  Source SHA256: 05cd88b13b443daaf3377964a5ae0d81470b80e7d139801132c0297bc7a68aec.

## Owned files (landed)

- packages/worker/src/boot/detect.ts (SAB construct probe = ground truth)
- packages/worker/src/boot/transport-decision.ts (pure decision table)
- packages/worker/src/boot/coi-boot.ts (sessionStorage reload guard, one-shot)
- packages/worker/src/boot/boot-fsm.ts (typed states/events, closed table, 20x100ms poll)
- packages/worker/src/boot/wasm-boot.ts (P4 exports-contract check, fail-closed)
- packages/worker/src/boot/index.ts (bootWorker entry)
- packages/worker/public/coi-sw.js (vendored, byte-identical)
- packages/worker/src/boot/{detect,transport-decision,coi-boot,boot-fsm,wasm-boot}.test.ts,
  boot-worker.test.ts (unit tests)
- vite.config.ts (REPO ROOT — was absent; COOP/COEP credentialless server headers per R5/E16)

## Seam disclosures

- vite.config.ts at repo root was written because it was absent at lane time; if C14
  scaffold also lands a root vite.config.ts, headers must be merged (my headers: COOP
  same-origin, COEP credentialless).
- packages/worker/package.json + tsconfig.json: I created initial versions; another lane
  later rewrote both (exports ./src/index.ts, vitest 3, allowImportingTsExtensions,
  vitest/globals types). Their versions stand; my gates ran against theirs.
- src/ring/** (P6) has in-flight tsc errors; my tsc gate is scoped to src/boot/** only.

## UNVERIFIED

- Kernel wasm artifact (C6) does not exist in the repo yet — instantiateKernel is
  compile-gated against the provisional P4 export allowlist only. UNVERIFIED until a
  real .wasm instantiates.
- Exact P4 export names: provisional allowlist in wasm-boot.ts; UNVERIFIED until P4/C6
  pin them from the first measured release build.
- coi-sw.js vendoring SHA recorded (05cd88b1...) but atomvm upstream version tag not
  pinned. UNVERIFIED per plan.
- G3/G5 browser-class gates (real vite dev server + real chromium headers/SAB ring)
  ride on P11 infra — not run in this lane.
- Poll budget 20x100ms sufficiency on slow CI chromium — UNVERIFIED until browser
  tests run in CI.
