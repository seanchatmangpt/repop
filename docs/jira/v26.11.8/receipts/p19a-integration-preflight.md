# P19a Integration Preflight — servengine-frontend anchor validation

Standing: ALIVE

Subject: /Users/sac/srve/servengine-frontend @ dbc1c3c50a06a9b450def72beb88b548e0837da7 ("test(e2e): opt-in parallel-safe project for proven self-seeding wo-cycle specs (SP-B)", HEAD 2026-11-08 11:12 -0800). Read-only; last commit touching amplify.yml is b306e32 (baseline extraction) — no amplify drift landed since baseline.

## Per-anchor table

| # | File | Plan anchor | Current reality | Verdict |
|---|------|-------------|-----------------|---------|
| 1 | tsconfig.json | `@srve/avion` paths line | Line 25: `"@srve/avion": ["./packages/avion/index.ts"],` inside `paths` (lines 23–30). Insert `"@srve/repop": ["./packages/repop/index.ts"],` after line 25 | CLEAN |
| 2a | vite.config.ts | alias array bounds | `resolve.alias` array: opens line 129, closes line 152 (`],`). Entries 130–151. Note lines 150–151 are single-line style (`{ find: "@core", ... }`, `{ find: "@", ... }` — and line 150 has odd indentation). Insert new entry before the `@core` catch-all at line 150 | CLEAN |
| 2b | vite.config.ts | server block | Line 102: `server: { port: 3000, proxy },` — single-line form; any multi-line server edits must rewrite this line whole | CLEAN (note form) |
| 3a | vitest.config.ts | alias block | `resolve.alias` array lines 101–127 (`],` at 127). pm4vitest entry 118–121, `@srve/contracts` 122–125, `@core`/`@` at 126–127. Insert before line 126 | CLEAN |
| 3b | vitest.browser.config.ts | alias block | `resolve.alias` array lines 53–76 (`],` at 76). `@srve/avion` 66–69, `@srve/contracts` 70–73, `@core`/`@` 74–75. Insert before line 74 | CLEAN |
| 4 | amplify.yml | customHeaders | Lines 29–33: single rule only — pattern `**/*.mjs` → `Content-Type: application/javascript`. No COOP/COEP headers exist. Last-touch commit b306e32 = baseline; nothing landed since the plan's read | CLEAN |
| 5 | src/providers/AppProvider.tsx | provider nesting | 73 lines. Shape: `AppProvider` = pointer-handler useEffect + `mapsBody` (`MantineProviderWrapper > QueryClientProviderWrapper > children`); when `GOOGLE_MAPS_API_KEY` present, wraps `mapsBody` in `<APIProvider>`. Current nesting: (optional APIProvider) → Mantine → QueryClient → children. Plan insertions should add new providers inside `MantineProviderWrapper` at lines 55–57, or outermost if order-independent | CLEAN (structure differs from naive "flat list" assumption) |
| 6 | package.json | versions | `react`/`react-dom` `^19.0.0` (lines 74/76); `@mantine/core` `^8.3.10` (line 40); `zod` `^4.1.12` (line 83) | CLEAN if plan assumed React 19 / Mantine 8 / zod 4; DRIFT if plan assumed zod 3 |
| 7 | packages/repop | must not exist | `packages/` = a2a-sim, avion, component-library, contracts, pm4playwright, pm4vitest. No `repop` | CLEAN |
| 8 | public/ | no coi-serviceworker | `public/coi-serviceworker.js` absent; no `*coi*` match in `public/` | CLEAN |

## Drift list for the executor

No DRIFT anchors. Executor cautions (non-blocking):

1. vite.config.ts line 150 has inconsistent indentation — a formatter run over it may churn the diff; match existing single-line style for the new alias entry and let lint-staged/prettier settle formatting.
2. `server:` is single-line (line 102) — if the plan appends COOP/COEP headers via `server.headers`, expand to `server: { port: 3000, proxy, headers: {...} }` in one edit.
3. AppProvider's conditional APIProvider wrapper: a new provider that must sit inside/outside APIProvider depends on the maps branch — confirm intended layer before inserting (insert at lines 55–57 for inside-Mantine, or wrap at the `AppProvider` return for outermost).
4. If the plan pinned zod 3 APIs, it must target zod 4 (`^4.1.12`).
