# FFB GA checklist (honesty)

Standing: **NOT GA**

Date: 2026-11-21  
Wave: close identity-fiction gap  
Scope: Frontend-for-Backend (FFB) client shims — on-disk truth vs GA.

## Verdict (read this first)

- FFB is **not** GA.
- **Decision note:** repo-local **`repop` / `repop/compat` only** — kill `@fnox/*` shipping fiction until a publish decision. Canonical: [`FFB-IDENTITY-FORK.md`](./FFB-IDENTITY-FORK.md).
- React host package: **explicit-no** (no separate host package; no `compat/react.ts`).
- Do **not** claim **v26.18.26 GA** (unpinned / research-adjacent; no on-disk product pin).
- Do **not** publish npm under this identity. Do **not** claim WebGPU / 120 Hz / keyless-canvas as shipping.

## What “FFB” means here

FFB = Frontend-for-Backend: legacy React/SaaS screens talking to xaas / projection via **`repop/compat`** facades — not a WebGPU / 120 Hz product. Live consumer UI remains `~/srve/servengine-frontend` (DOM React SPA is the host).

## On disk — 6 conceptual shims

Location: `/Users/sac/repop/packages/repop/src/compat/`  
Package identity: workspace `"repop"` (`private: true`). Import: `repop/compat` or `repop/compat/<module>`.

| # | Shape | On-disk module(s) | Status |
|---|---|---|---|
| 1 | react-query | `useQuery.ts` + `useMutation.ts` | ON DISK (`repop/compat`) |
| 2 | swr | `useSWR.ts` | ON DISK (`repop/compat`) |
| 3 | graphql | `graphql.ts` | ON DISK (`repop/compat`) |
| 4 | table | `table.ts` | ON DISK (`repop/compat`) |
| 5 | store | `store.ts` | ON DISK (`repop/compat`) |
| 6 | db-client | `dbClient.ts` | ON DISK (`repop/compat`) |
| — | React host package | — | **explicit-no** |

Module-file count is **7** `.ts` implementations (useQuery + useMutation are the react-query pair). Conceptual surface: **6 present**; host package: **explicit-no**.

Tests beside the modules: `*.test.tsx` for each of the seven files. Coordinator gate note (SHIM-1): full `src/compat` vitest run reported 15 tests passed historically; this checklist does not re-assert that exit code.

## Export / wiring (honesty closed)

| Check | Result |
|---|---|
| `compat/index.ts` barrel | Exports all six shapes (query/mutation, SWR, graphql, table, store, db-client). |
| `packages/repop` `exports` | `"."`, `"./compat"`, plus **explicit** `./compat/{useQuery,useMutation,useSWR,graphql,table,store,dbClient}` — no wildcard fiction, no `@fnox/*` (import map in [`FFB-IDENTITY-FORK.md`](./FFB-IDENTITY-FORK.md)). |
| `packages/repop/src/index.ts` | Does **not** re-export compat (keeps root API clean; use subpath). |
| Scoped package fiction | **Retired by decision** — identity is `repop/compat` only until a publish decision. |
| Workspace publish | Root + `packages/repop` `"private": true`; **no publish**. |
| GA claim | **None** — barrel/`exports` ≠ GA. |

## npm / publish (non-goal under ratified identity)

- [x] Documented: no `@fnox/*` shipping fiction; identity is `repop/compat` only
- [x] Documented: do not publish npm for FFB GA under this identity
- [x] React host: **explicit-no**

## Product GA checklist

### Closed (honesty / identity)

- [x] Identity fork decided: **`repop/compat` only** ([`FFB-IDENTITY-FORK.md`](./FFB-IDENTITY-FORK.md))
- [x] React host: **explicit-no** (consumer app hosts React; no separate host package)
- [x] Barrel + package `exports` map for `repop/compat` (private workspace; not npm)

### Still open (blocks any future GA claim)

- [ ] SHIM-2 flag path + SHIM-4 live court remain green against a pinned xaas (see fnox sjira SHIM receipts; not re-run this lane)
- [ ] Version pin on disk for any FFB product label (calendar `v26.11.x` waves exist; **v26.18.26 is not a GA pin**)
- [ ] No WebGPU / 120 Hz / keyless-canvas claim without a measured court — those are **DOC-ONLY / target**, not GA evidence

## Explicit non-claims

| Claim | Honest status |
|---|---|
| “FFB GA” | **False** — NOT GA |
| “v26.18.26 GA” | **False** — do not claim; unpinned / not a product release |
| “Scoped `@fnox/*` packages ship” | **False** — fiction killed; identity is `repop/compat` only until publish decision |
| “React host package ships” | **False** — **explicit-no** |
| “7 published shims” | **False** — 6 conceptual modules on disk inside private `repop`; not published |
| “120 Hz / WebGPU shipping” | **False** — not FFB GA evidence |

## Evidence pointers

- Identity decision: [`FFB-IDENTITY-FORK.md`](./FFB-IDENTITY-FORK.md)
- Retired draft redirect: [`FFB-IDENTITY-FORK-DECISION-DRAFT.md`](./FFB-IDENTITY-FORK-DECISION-DRAFT.md)
- Operator ruling 7 (historical naming): `/Users/sac/fnox/docs/sjira/v26.11.18/decisions/OPERATOR-RULINGS-2026-11-19.md` — **superseded for package identity by this wave**
- SHIM orders: `/Users/sac/fnox/docs/sjira/v26.11.18/tickets/SHIM.md`
- SHIM-1 wave-6 modules: `/Users/sac/fnox/docs/sjira/v26.11.18/receipts/FNOX-SJ-SHIM-1.md`
- Compat tree: `/Users/sac/repop/packages/repop/src/compat/`

## Verified on disk (close-gap lane, 2026-11-21)

Re-checked against live tree — checklist boxes above match disk; no GA promotion:

| Fact | Observed |
|---|---|
| Package | `packages/repop/package.json` → `"name": "repop"`, `"private": true`, no `publishConfig`; description states NOT GA / not published |
| Exports | `"."`, `"./compat"`, plus **explicit** seven module subpaths (no `./compat/*` wildcard) |
| Root re-export | `src/index.ts` does **not** mention compat |
| Compat modules | 7 `.ts` impls + barrel; **no** `compat/react.ts` |
| `@fnox/*` in `packages/repop/src` | **zero** matches (identity headers / errors say `repop/compat`) |
| Standing | **NOT GA** — identity closed; product GA still blocked by open items above |

## Lane note

Identity-fiction close only. No commits. No npm publish. No GA promotion. No publish-path scaffold (honesty preferred).
