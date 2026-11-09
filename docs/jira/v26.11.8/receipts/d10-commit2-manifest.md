# D10 — Commit-2 staging manifest (read-only prep, nothing staged)

Standing: PARTIAL — census re-derived 2026-11-08 16:01–16:06 PST at HEAD `588fef5`; final census MUST be re-derived at staging time (C20r landed mid-census: `packages/worker/src/{ocel,uplink}` mtimes 15:58–16:00, receipt mtime 16:01).

## Method (real exits)

- `git rev-parse --short HEAD` → `588fef5`, exit 0
- `git status --porcelain=v1` → 59 entries (8 M, 51 untracked incl. dirs), exit 0
- `git show --name-only --format="" 588fef5` → exit 0 (baseline contents confirmed)
- Standing-line sweep, all 49 files in `docs/jira/v26.11.8/receipts/*.md`, exit 0
- Owned-files sections read from 18 receipts, exit 0

## Clusters table

| # | Cluster | Owning receipt(s) (Standing re-read from disk) | Classification | Commit-2? |
|---|---|---|---|---|
| 1 | `NOTICE` (M) — 1-line cgap URN | d7-vendor-sha-pin.md (PARTIAL_ALIVE; URN pinned `ede726ff…`, gates exit 0) | LANDED-VERIFIED | yes |
| 2 | `docs/jira/v26.11.8/README.md` (M) + `docs/jira/v26.11.8/receipts/g2-zod-projection.md` (M, +12) | coordinator doc update + G2 amendment (G2b g2b-landing.md PARTIAL_ALIVE supersedes) | LANDED-VERIFIED (doc-only) | yes |
| 3 | `kernel/crates/repop-kernel-wasm/src/arena.rs`, `src/lib.rs` (M) | d8-workspace-gate.md (ALIVE — cfg-gating wasm32-only glue; workspace cargo test + clippy exit 0). mtimes 15:59 — verify diff is D8-only at staging. | LANDED-VERIFIED | yes |
| 4 | `packages/worker/src/ring/postMessageTransport.test.ts`, `wireRing.test.ts` (M) | c6br-ring-repair.md (PASS — R4 census finding 1 repair) | LANDED-VERIFIED | yes |
| 5 | `pnpm-lock.yaml` (M) | byproduct of worker pkg config: c6b-sab-ring.md:28 (PASS), c9-protocol-router.md:81 (PASS) | LANDED-VERIFIED | yes |
| 6 | `packages/worker/src/boot/**`, `packages/worker/public/**`, `vite.config.ts` | 07-worker-boot.md (PARTIAL_ALIVE — tsc 0 src/boot, vitest 24/24) | LANDED-VERIFIED (green scoped gates) | yes |
| 7 | `packages/worker/src/protocol/**`, `packages/worker/{package.json,tsconfig.json,vitest.config.ts}` | c9-protocol-router.md (PASS — 20/20; pkg/tsconfig touches additive+disclosed) | LANDED-VERIFIED | yes |
| 8 | `packages/abi/**` | c2b-golden-byte.md (ALIVE) + d9-generator-of-record.md (ALIVE — gen_ts_mirror.py is generator of record) | LANDED-VERIFIED | yes |
| 9 | `packages/repop/**` | MIXED: C12-useActor-boundary.md (PASS) + g2b-landing.md (PARTIAL_ALIVE — compile-vs-zod UNVERIFIED, real TS2307) + p19c-demo-route.md (ALIVE, vendored src) | LANDED-UNVERIFIED (named red: G2b TS2307) — stageable as landed-with-named-red | yes (flag in commit msg) |
| 10 | `kernel/crates/repop-kernel/**` | c4-cas-receipt-kernel.md (PARTIAL_ALIVE, 13 courts) + c5r-courts-repoint.md (PASS — zero court edits needed, already compile) + D8 workspace green | LANDED-VERIFIED | yes |
| 11 | `kernel/crates/repop-bench/**`, `kernel/justfile`, `kernel/Cargo.lock` | d8-workspace-gate.md (ALIVE — workspace members) | LANDED-VERIFIED | yes |
| 12 | `kernel/scripts/**`, root `justfile` | c18r-determinism.md (PASS) + d9-generator-of-record.md (ALIVE) | LANDED-VERIFIED | yes |
| 13 | `packs/cgap-popcorn-aoq/**` | c16-pack-ontology.md + c16b-adoption.md (PASS), c17r-path-hardening.md (PASS), c18-pack-templates.md (PASS, 7 templates), c18r-determinism.md (PASS, determinism court exit 0) | LANDED-VERIFIED | yes |
| 14 | `scripts/**` (verify_parity, gen_ts_mirror, render_templates, render_baseline, parity_fixture) | c2b-golden-byte.md (ALIVE) + c18r-determinism.md (PASS) + d9-generator-of-record.md (ALIVE) | LANDED-VERIFIED | yes |
| 15 | `vitest.config.ts`, `vitest.browser.config.ts`, `playwright/**`, `playwright.smoke.config.ts` | c15-test-infra.md (PARTIAL_ALIVE — projects split, browser project, COI mutation court flips) | LANDED-VERIFIED | yes |
| 16 | `packages/worker/src/ocel/**`, `packages/worker/src/uplink/**` | c20r-ocel-uplink.md (receipt mtime 16:01 — landed DURING this census; tsc 0, vitest 99/99 incl. C6b-r, 37/37 scoped, mutation legs green) | **IN-FLIGHT — DO-NOT-STAGE-YET** (surfaces mtime 15:58–16:00 <10 min at census) | defer unless re-census quiet ≥10 min |
| 17 | `scratch/`, `.ggen/`, `.ggen-v2/`, `test-results/` | none — ephemeral working capital | DO NOT COMMIT | no |

Note: the receipts dir itself (`docs/jira/v26.11.8/receipts/*.md` untracked files) is part of cluster 2-adjacent docs — stage the new receipts alongside their owning clusters (each receipt cites its cluster's files; staging receipt with cluster keeps commit self-describing).

## Proposed commit-2 path list (explicit paths, never `-A`)

Re-derive `git status --porcelain` at staging time, then stage per cluster, receipts alongside code:

```text
# docs + receipts (clusters 1, 2 + all new lane receipts)
NOTICE
docs/jira/v26.11.8/README.md
docs/jira/v26.11.8/receipts/          # explicit files only at staging: the 25 new .md files (see census list below)

# C6br ring repair (PASS)
packages/worker/src/ring/postMessageTransport.test.ts
packages/worker/src/ring/wireRing.test.ts

# D8 wasm cfg-gating (ALIVE)
kernel/crates/repop-kernel-wasm/src/arena.rs
kernel/crates/repop-kernel-wasm/src/lib.rs
kernel/Cargo.lock

# worker boot/protocol/pkg (07, C9, C6b)
packages/worker/src/boot/
packages/worker/src/protocol/
packages/worker/public/
packages/worker/package.json
packages/worker/tsconfig.json
packages/worker/vitest.config.ts
pnpm-lock.yaml
vite.config.ts

# ABI golden byte + generator of record (C2b, D9)
packages/abi/
scripts/

# repop package (C12 PASS + G2b PARTIAL_ALIVE named-red + P19c ALIVE)
packages/repop/

# kernel crate + bench + gates (C3/C4/C5r/D8/C18r)
kernel/crates/repop-kernel/
kernel/crates/repop-bench/
kernel/justfile
kernel/scripts/
justfile

# pack surface (C16/C16b/C17r/C18/C18r — all PASS)
packs/

# test infra (C15 PARTIAL_ALIVE, green incl. mutation court)
vitest.config.ts
vitest.browser.config.ts
playwright/
```

New receipt files to stage (from census, all untracked under `docs/jira/v26.11.8/receipts/`):

```text
C12-useActor-boundary.md
c15-test-infra.md
c17r-path-hardening.md
c18-pack-templates.md
c18r-determinism.md
c2b-golden-byte.md
c5r-courts-repoint.md
c6br-ring-repair.md
c20r-ocel-uplink.md
d7-vendor-sha-pin.md
d8-workspace-gate.md
d9-generator-of-record.md
g2b-landing.md
p19c-demo-route.md
r4-backfill-c11-provider-hooks.md
r4-backfill-c12-boundary.md
r4-backfill-c15-test-infra.md
r4-backfill-c17-pack-gates.md
r4-backfill-c18-templates.md
r4-backfill-c20-uplink-ocel-demo.md
r4-backfill-c4-state-receipt.md
r4-backfill-c5-kernel-courts.md
r4-census.md
r5-hook-residuals.md
r6-zod-dep.md
docs/wave-1-resolutions.md
d10-commit2-manifest.md (this file — stage last, after final re-census)
```

## Exclusions

- `scratch/` — lane working capital (G2 cites scratch paths but scratch is not product). Not committed.
- `.ggen/`, `.ggen-v2/` — ggen sync working dirs, ephemeral.
- `test-results/` — vitest/playwright output, ephemeral.
- No /tmp-copied harnesses in census; no playwright-traces dir in census. If either appears by staging time, exclude.
- `kernel/target/**`, `node_modules/**` — ignored, not in census.
- Coordinator flag (from c20r receipt): `packages/worker/src/index.ts` missing on disk — pre-existing gap outside C20r's owned files.

## C20r gate for staging cluster 16

Stage `packages/worker/src/ocel/` + `packages/worker/src/uplink/` only if at staging time: (a) both dirs quiet (no file mtime newer than 10 min), (b) c20r-ocel-uplink.md Standing re-reads PASS/PARTIAL_ALIVE with gates green, (c) `npx vitest run src/ocel src/uplink` green. Otherwise defer to commit 3 with its own receipt citation.
