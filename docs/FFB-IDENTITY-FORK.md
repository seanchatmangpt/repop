# FFB identity fork — decision (ratified)

Status: **RATIFIED** 2026-11-21  
Standing: product remains **NOT GA**  
Companion: [`FFB-GA-CHECKLIST.md`](./FFB-GA-CHECKLIST.md)  
Supersedes: [`FFB-IDENTITY-FORK-DECISION-DRAFT.md`](./FFB-IDENTITY-FORK-DECISION-DRAFT.md) (redirect stub only)

## Decision note (normative)

**Repo-local `repop` / `repop/compat` only.** Kill `@fnox/*` shipping fiction until an operator publish decision lands with registry evidence.

- Canonical import surface: workspace package `"repop"` (`private: true`), subpath `repop/compat` (barrel) or `repop/compat/<module>`.
- Do **not** write import paths, READMEs, checklists, or release notes as if `@fnox/react`, `@fnox/react-query`, `@fnox/swr`, `@fnox/graphql`, `@fnox/table`, `@fnox/store`, or `@fnox/db-client` exist as packages.
- Source comments and error strings must not invent `@fnox/*` names as registry identity.
- **Do not publish npm** under this identity (non-goal; not a GA precondition).

## React host

| Item | Standing |
|---|---|
| Separate React host package (`@fnox/react` / `compat/react.ts`) | **explicit-no** — FFB does not ship a React host package. React is a peer of `repop`; the consumer app (e.g. `~/srve/servengine-frontend`) is the host. |

## On-disk surface (honest)

Six conceptual shims under `packages/repop/src/compat/`:

| Conceptual shape | Module(s) |
|---|---|
| react-query | `useQuery.ts`, `useMutation.ts` |
| swr | `useSWR.ts` |
| graphql | `graphql.ts` |
| table | `table.ts` |
| store | `store.ts` |
| db-client | `dbClient.ts` |

Plus barrel `compat/index.ts` and package `exports` for `"./compat"` plus **explicit** subpaths for each module (no `./compat/*` wildcard; no scoped `@fnox/*` packages).

### Consumer imports (no path hacks)

| Want | Import |
|---|---|
| Full barrel | `import { useQuery, useSWR, … } from "repop/compat"` |
| react-query | `import { useQuery } from "repop/compat/useQuery"` / `import { useMutation } from "repop/compat/useMutation"` |
| swr | `import { useSWR } from "repop/compat/useSWR"` |
| graphql | `import { gql, useGraphQL } from "repop/compat/graphql"` |
| table | `import { useTable } from "repop/compat/table"` |
| store | `import { createStore } from "repop/compat/store"` |
| db-client | `import { createDbClient } from "repop/compat/dbClient"` |

Prefer these subpaths over deep relative paths into `packages/repop/src/compat/…`.

## What this closes

| Gap | Closure |
|---|---|
| Identity fiction | Closed — `repop/compat` only; `@fnox/*` shipping fiction killed in normative docs |
| React host | Closed — **explicit-no** |
| Barrel / `exports` | Closed for honesty — full barrel + `repop/compat` subpath (private workspace) |

## What this does **not** close

- Product **GA** (standing remains **NOT GA**)
- SHIM-2 flag path / SHIM-4 live court vs a pinned xaas
- On-disk calendar/product version pin for an FFB GA label (`v26.18.26` is not a pin)
- npm registry publication (non-goal until a separate publish decision)

## Future branch (operator-gated only)

If a real scoped publish is ever ratified with registry evidence (non-404 + non-private + `publishConfig`), revisit dual-identity or re-exports. Until then: **`repop/compat` only**.

## Non-actions

- No npm publish
- No inventing a React host package to match old prose
- No WebGPU / 120 Hz / keyless-canvas shipping claims
- No GA promotion
- No publish-path scaffold under this wave (honesty: stay `repop/compat` until a separate operator publish decision with registry evidence)
