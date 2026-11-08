# G4 — servengine-patch ggen projection (P19 snippet bundle)

Standing: PARTIAL_ALIVE

Subject: /Users/sac/repop @ HEAD (packs/cgap-popcorn-aoq/servengine-projection/ + dist/servengine-patch/). Source anchors: /Users/sac/srve/servengine-frontend @ dbc1c3c (read-only; per p19a-integration-preflight.md, zero DRIFT anchors).

## What was manufactured

A deterministic ggen-projected patch bundle: ontology (TTL) → SPARQL → Tera → 9 snippet files, driven by the pack-scoped manifest `packs/cgap-popcorn-aoq/servengine-projection/ggen.toml.canonical` (declarative-rules schema, 9 rules). Ground truth consumed: wave-1 resolutions R5 (COOP/COEP 2-spot, credentialless), R6 (4 alias tables, AppProvider composition root, TanStack routes), p19a preflight (exact insertion lines, zero drift).

- Ontology: `ontology/servengine-patch.ttl` — AliasEntry / HeaderEntry / ProviderSlot / DemoRoute individuals; every row binds every column (no OPTIONAL; fill-forward trap avoided by construction).
- Queries: `queries/{aliases,headers,slot,demo}.rq` — all with ORDER BY (strict-mode law).
- Templates: `templates/*.tera` — multi-row loops use `sparql_results`; single-row rules use `row.*` (ggen 26.11.5 binds both `row` and `sparql_results`; the `r.*` form fails FM-GEN-008).
- Output: `/Users/sac/repop/dist/servengine-patch/` (9 files, listed with SHAs below).

## Gates table (all run this session, real exits)

| Gate | Command | Exit | Result |
|---|---|---|---|
| ggen dry-run parse | `ggen sync run --dry-run --skip-ea-admission` | 1→0 after template fixes | template bugs found+fixed (Tera inline-if; r.*→row.*) |
| Render 1 | `ggen sync run --skip-ea-admission` (staged root ggen.toml) | 0 | written: 9, skipped: 0, graph_hash_hex 0a0112ab…afb05e |
| Render 2 (determinism) | same, re-run | 0 | shasum 256 diff of all 9 files = empty → BYTE-IDENTICAL |
| JSON parse | python3 json.load on tsconfig-paths.snippet.json | 0 | PASS; == {"paths": {"@srve/repop": ["./packages/repop/index.ts"]}} |
| YAML parse | python3 yaml.safe_load on amplify snippet | 0 | PASS; COOP same-origin + COEP credentialless under pattern "**/*" |
| TS/TSX parse | esbuild parse each of 7 .ts/.tsx snippets | 7× exit 0 | PASS |
| Content vs ground truth | mechanical check vs servengine's own tsconfig (org extracted by regex, not hand-typed) | 0 | 8/8 PASS — "@srve/repop", COI headers, RepopProvider slot, route "/repop" |

## Rendered files (SHA-256, re-read from disk at receipt time)

- `dist/servengine-patch/AppProvider-slot.snippet.tsx` sha256 bc0fb02de9c77206663265d91ef01fb6d6fda2c9a890ee968759877a9422db64
- `dist/servengine-patch/amplify-custom-headers.snippet.yml` sha256 4008d96f3609d159a8c5b75a50514c3a03567663c0b4614b2b5aeef163907e67
- `dist/servengine-patch/demo-route/repop.browser.test.snippet.tsx` sha256 89bd1376bc1f05098378d1b956d37940cac47923c539b6ff33dce3a97da705fc
- `dist/servengine-patch/demo-route/repop.route.snippet.tsx` sha256 68dd919a00fb53f5daf85ac647c838a9f7bd1ee092ad0a87fda949a3c4de43e9
- `dist/servengine-patch/server-headers.snippet.ts` sha256 b74213a84597171450b88fb4ad5c0d762d600c056518a772a7f75b556e348143
- `dist/servengine-patch/tsconfig-paths.snippet.json` sha256 5a364b5b4595b8038add052f80f27769cac969c1c9e2dae72ff246aca3ca5ff7
- `dist/servengine-patch/vite-alias.snippet.ts` sha256 59b627ef6813729480f91c913c1aadb4b070b34169d5898b34ab2149777551b0
- `dist/servengine-patch/vitest-alias.snippet.ts` sha256 f918b03965d3f8872af7f8104bf8f929735226d08f0049559fb0db855e3b2dfd
- `dist/servengine-patch/vitest-browser-alias.snippet.ts` sha256 60e1a33db47b818b0101f01adb993011ed121fe47dac54711947902585d822d9

## Invocation notes (for the next ggen lane)

- ggen 26.11.5 adds the EA admission gate ([FM-LAW-015]): `--skip-ea-admission` is the documented opt-out for non-SBB bundles; un-skipped runs refuse.
- `ggen sync run` reads `ggen.toml` from cwd only: the canonical manifest is staged at the repo root for the render and moved to `scratch/g4-staging/ggen.toml` afterward (`rm` denied in this session; move-not-delete used).
- 26.11.5 exposes context as `row.*` (single-row) / `sparql_results` (loop) + flat column keys; `json` filter does not exist in this Tera build; `__tera_context` dump is the fastest context debugger.

## UNVERIFIED (by design)

- All 9 snippets are UNVERIFIED as integrations: they have not been applied to servengine-frontend (executor lane's job). Parse and content gates prove shape, not integration behavior (alias resolution, COI boot, provider nesting under the APIProvider branch).
- Insertion-line anchors are as-of p19a preflight @ dbc1c3c; re-check line numbers at apply time.
- `@srve/repop` package does not exist yet in servengine (preflight anchor 7 says CLEAN); snippets are inert until the package lands.
