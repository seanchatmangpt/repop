# P19b — servengine-frontend config-side repop integration (lane P19b)

Standing: PARTIAL

Repo: /Users/sac/srve/servengine-frontend @ HEAD dbc1c3c50a06a9b450def72beb88b548e0837da7
(uncommitted working-tree changes only — coordinator owns git).
Preflight: P19a receipt, all anchors CLEAN.

## Files changed (with line anchors)

| File | Change | Anchor |
|---|---|---|
| tsconfig.json | `@srve/repop` path entry added after `@srve/avion` | tsconfig.json:26 |
| vite.config.ts | 3 alias entries (`@srve/repop/assets`, `@srve/repop/worker` subpaths before bare `@srve/repop`, all before `@core` catch-all), plus `server.headers` COOP/COEP | vite.config.ts:158-169 (aliases), vite.config.ts:102-108 (headers) |
| vitest.config.ts | same 3 alias entries | vitest.config.ts:123-135 |
| vitest.browser.config.ts | same 3 alias entries | vitest.browser.config.ts:71-81 |
| amplify.yml | global `customHeaders` entry, pattern `"**"`, COOP same-origin + COEP credentialless | amplify.yml:29-36 |
| src/providers/AppProvider.tsx | `RepopProvider` wraps `QueryClientProviderWrapper`'s children; import from `@srve/repop` | AppProvider.tsx:8 (import), AppProvider.tsx:58 (wrap) |
| packages/repop/ (new) | stub shell: package.json, index.ts, RepopProvider.tsx, NOTICE.md — all marked `REPOP-SYNC-PENDING` | packages/repop/* |

## Gates

- `npm run type-check` — exit 2, 21 errors. Zero in lane-owned files (scoped grep rc=1).
  Baseline control run at HEAD file versions (lane edits swapped out via `git show HEAD:path`
  snapshot method, no stash): identical 21 errors, exit 2 — **all pre-existing, zero
  session-introduced**. Stub type-checks clean: `@srve/repop` import resolves via the new
  tsconfig paths entry; RepopProvider.tsx compiles under strict + verbatimModuleSyntax.
  Errors: playwright specs (`page`, `clientWorkOrderNumber`, unused `expect`), DoNotUsePanel
  unused imports, contentFilesChat smoke unused locals, badgeConfig BadgeColor "lime",
  photoQa.court WoLifecycleState. None reference repop/RepopProvider.
- `npx eslint <6 lane files>` — exit 0, 0 errors. The two packages/repop files are
  eslint-ignored by the existing packages/ ignore pattern (same as avion/pm4vitest);
  recorded honestly.
- Grep verification (real exits, exact strings): tsconfig 1 hit; `@srve/repop` 3 hits in each
  of vite/vitest/vitest.browser; COOP same-origin vite.config.ts:106, COEP credentialless
  vite.config.ts:107 + amplify.yml:35; AppProvider import line 8 + wrap line 58;
  REPOP-SYNC-PENDING marker in all 4 stub files. Exclusion check: 0 diffs touch routeTree.gen.ts
  or src/routes/.

## Scope compliance

No package sync performed. Did not touch routeTree.gen.ts, src/routes/, or any component
beyond AppProvider's nesting. Edits remain uncommitted working-tree changes.

## UNVERIFIED (deferred)

- Browser leg (vitest browser project run) — deferred to P19c after the real package sync.
- Demo route — deferred to P19c after the real package sync.
- vite/vitest alias resolution at runtime (dev server / browser bundle) — stub never imported
  by anything except AppProvider; resolution exercised only through tsc path mapping.
