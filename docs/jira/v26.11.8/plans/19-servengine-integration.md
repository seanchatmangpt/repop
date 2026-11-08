# P19 Wave-2: servengine-frontend Integration Plan

Standing: PARTIAL

Grounded in the landed P19a preflight receipt
`docs/jira/v26.11.8/receipts/p19a-integration-preflight.md` (Standing: ALIVE,
subject `/Users/sac/srve/servengine-frontend` @ dbc1c3c5). All anchors below
re-verified on disk at plan-write time (tsconfig paths line 25 `@srve/avion`;
vite alias array 129–152 with `@core` catch-all ~150; vitest alias block
101–127; vitest.browser alias block 53–76; amplify.yml `customHeaders:` line 29
with no COOP/COEP present; `public/coi-serviceworker.js` absent;
`src/providers/AppProvider.tsx` 73 lines, nesting
(optional APIProvider) → Mantine → QueryClient → children).

## Charter

Integrate the vendored `packages/repop` copy of the avion shape into
`/Users/sac/srve/servengine-frontend` (P19, Wave 2) so the Repop kernel runs
under the target repo's real dev server, unit runner, and browser runner:

- Vendor the package: `packages/repop` (package.json, src/, assets/, tsconfig)
  as a copy of the avion shape, `@srve/repop`, main/exports → raw TS entry
  (`index.ts`) — no build step, no dist output.
- Wire `@srve/repop` into FOUR configs, not three: tsconfig.json paths,
  vite.config.ts alias array, vitest.config.ts alias block, and
  vitest.browser.config.ts alias block. The resolutions document glossed the
  fourth config; this plan names it explicitly and owns it.
- Enable SharedArrayBuffer: COOP/COEP response headers in exactly two spots
  (vite `server.headers` for dev; amplify.yml `customHeaders` for deploy) with
  the `credentialless` mitigation for credentialed cross-origin subresources
  (Google Fonts), plus `public/coi-serviceworker.js` at origin root.
- Mount the provider: `src/providers/AppProvider.tsx` gains RepopProvider in a
  Mantine → RepopProvider → QueryClient nesting.
- Land a demo route with `WorkOrderDispatchCard` plus a
  `WorkOrderDispatchCard.browser.test.tsx` wiring that serves as the
  SAB-absent fallback court.
- Executor split: P19b carries the four config edits + provider + route +
  service worker; the package-sync step (populating `packages/repop`) is a
  separate deferred lane, not P19b.

## Resolved decisions

1. **Vendoring shape.** `@srve/repop` → `./packages/repop/index.ts` everywhere.
   Raw TS consumed by each consumer's own pipeline; vendored package.json
   carries `main`/`exports` → `index.ts` so the bare specifier works with no
   build step. The vendored package is a copy, not a workspace symlink — the
   target repo does not get a dependency on the repop checkout.
2. **Four configs, exact insertion anchors** (from the receipt, all CLEAN):
   - tsconfig.json: insert `"@srve/repop": ["./packages/repop/index.ts"],`
     after line 25 (the `@srve/avion` line, inside `paths` lines 23–30).
   - vite.config.ts: `resolve.alias` array opens line 129, closes line 152;
     insert the new entry before the `@core` catch-all at line 150. Note
     (receipt caution 1): line 150 is single-line style with odd indentation —
     match the existing single-line style; let lint-staged/prettier settle
     formatting; do not churn the diff with a formatter run.
   - vitest.config.ts: alias array lines 101–127 (`],` at 127); insert before
     the `@core`/`@` entries at 126–127.
   - vitest.browser.config.ts: alias array lines 53–76 (`],` at 76); insert
     before `@core`/`@` at 74–75. This is the config the resolutions glossed:
     browser-mode module resolution uses only vitest.browser.config.ts, so a
     three-config wiring silently breaks every `.browser.test.tsx`.
3. **COOP/COEP in exactly two spots.** Dev: vite `server.headers`. Deploy:
   amplify.yml `customHeaders` (currently a single `**/*.mjs` rule at lines
   29–33; the pair is added there, scoped per the Risks statement). No other
   surface gets the pair. Receipt caution 2 applies: `server:` at line 102 is
   single-line (`server: { port: 3000, proxy },`) — expand it whole in one
   edit: `server: { port: 3000, proxy, headers: { ... } }`.
4. **Header values.** `Cross-Origin-Opener-Policy: same-origin` and
   `Cross-Origin-Embedder-Policy: credentialless`. `credentialless` is the
   mitigation that keeps Google Fonts loading: under strict
   `require-corp`, credentialed cross-origin subresources (fonts.googleapis.com
   responses without CORP/`Cross-Origin-Resource-Policy`) are blocked;
   `credentialless` loads them without credentials instead of blocking. This
   is a mitigation, not a cure — residual staging check under Risks. If the
   staging check fails (browser without credentialless support blocks SAB),
   fall back to `require-corp` + coi-serviceworker propagation and re-triage.
5. **Service worker at origin root.** Land `public/coi-serviceworker.js` —
   the file name and path are fixed: it must be served at `/coi-serviceworker.js`.
   Scope law: a service worker's default scope is the directory of its own
   path; a nested path (e.g. `/static/coi-serviceworker.js`) would control
   only that subtree, never the origin, so COI state would not propagate
   across routes. Amplify serves `public/` at origin root, so root placement
   is lawful. Registered only when SAB is absent (the coi-serviceworker
   pattern registers itself only when `crossOriginIsolated` is false).
6. **Provider slot.** `src/providers/AppProvider.tsx`: today's shape is
   (optional APIProvider) → `MantineProviderWrapper` → `QueryClientProvider
   Wrapper` → children (receipt anchor 5, 73 lines). Insert RepopProvider
   inside `MantineProviderWrapper` at lines 55–57 (receipt caution 3: confirm
   layer relative to the conditional APIProvider maps branch — decision:
   inside Mantine, outside the maps branch; Repop is order-independent and
   takes `children` only). Resolved nesting:
   Mantine → RepopProvider → QueryClient → children.
7. **Demo route + court.** A demo route renders `WorkOrderDispatchCard`
   inside the provider stack; its `.browser.test.tsx` is the SAB-absent
   fallback court. Both branches asserted: SAB present (headers applied) →
   kernel boots and the card renders live; SAB absent → typed degraded state,
   no hang, no uncaught error. The fallback branch is the non-vacuity court:
   a headers edit that silently drops COOP/COEP must fail the test loudly on
   the fallback assertion, never pass vacuously.
8. **Executor split.** P19b owns: the four config edits, vite server.headers,
   amplify customHeaders, `public/coi-serviceworker.js`, AppProvider edit,
   demo route + browser court. Deferred lane owns: populating
   `packages/repop` (package sync). P19b may land config edits before the
   package exists; the alias targets a not-yet-present path — resolution
   failures surface only in configs whose consumers import `@srve/repop`,
   which P19b does not add until the sync lane lands (the demo route is the
   first importer and lands with or after sync).

## Gates (run in the target repo `/Users/sac/srve/servengine-frontend`)

Real exits required; a gate that cannot run is BLOCKED, never silent-PASS:

| Gate | Command | Pass condition |
|---|---|---|
| type-check | `npm run type-check` (tsc --noEmit) | exit 0 |
| lint | `npm run lint` (eslint --max-warnings 0) | exit 0 |
| unit | `npm run test` (vitest run --project unit) | exit 0 |
| browser | `npm run test:headless` (vitest --project browser --browser.headless) | exit 0 |

After config edits: run type-check + unit even before `packages/repop` exists
(config-only edits must not break existing resolution). After sync lane +
route land: all four gates, plus a manual `npm run dev` probe confirming
`crossOriginIsolated === true` with server.headers applied.

## Risks

- **Prod-risk statement (chartered).** The COOP/COEP header pair is app-wide
  and instant: on deploy, every response on the origin carries the pair, and
  any existing cross-origin window relationship or credentialed subresource
  changes behavior with no per-feature opt-out. This is why the pair lives in
  exactly two audited spots and nowhere else.
- **Residual staging check.** Under COEP `credentialless`, credentialed
  cross-origin subresources (Google Fonts) load credential-less rather than
  blocked — but this is a mitigation with browser-support caveats (Firefox
  shipped credentialless later; older browsers get no SAB). The residual
  check is staging-only: verify fonts render and `crossOriginIsolated` is true
  on the deployed staging URL before promoting. Do not mark P19 fully ALIVE
  on dev-server evidence alone.
- **Rollback = revert the customHeaders block** in amplify.yml (and the
  single-line `server:` line in vite.config.ts). Both are single localized
  edits; rollback is instant and does not touch the vendored package, the
  provider, or the route.
- vite.config.ts line 150 indentation churn (receipt caution 1) — cosmetic
  diff noise only; disclosed in the P19b receipt, not blocked on.
- amplify.yml drift: receipt's last-touch commit b306e32 is the baseline;
  re-run the anchor check if HEAD has moved past dbc1c3c5.

## Dependencies

- All construct lanes (C6/C6b/C10/C16 kernel, store, pack, boot lanes) —
  the vendored package content comes from their landed outputs.
- G4 snippets (adapter glue fragments) — consumed by the provider and route
  wiring in P19b.
- R2 court bundle (`docs/jira/v26.11.8/receipts/r2-court-registration.md`) —
  the SAB-absent fallback court registers against the R2 bundle.
- P19a preflight receipt — the anchor authority for all insert points;
  re-verify anchors if target-repo HEAD moves past dbc1c3c5.
- Deferred package-sync lane — populates `packages/repop`; P19b's demo route
  is the first `@srve/repop` importer and cannot pass browser gates until it
  lands.

## UNVERIFIED-pending

- P19b executor receipt (config edits + provider + route + SW): not yet
  landed — the four-gate ladder in the target repo is UNVERIFIED.
- Staging header check (`crossOriginIsolated === true` + Google Fonts render
  on deployed staging): UNVERIFIED; required before P19 standing > PARTIAL.
- SAB-absent fallback court run on the landed wiring: UNVERIFIED.
- Deferred package-sync lane receipt: UNVERIFIED; `packages/repop` absent in
  the target repo at plan-write time (receipt anchor 7).
- Target-repo HEAD drift past dbc1c3c5 since the preflight: UNVERIFIED;
  anchors re-checked at plan-write time and CLEAN, but the executor must
  re-verify immediately before edit.
