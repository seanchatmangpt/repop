# repop v26.11.8 wave index

Standing: PARTIAL

Aggregate derived from disk 2026-11-08 ~15:45 PST (ls/grep over
docs/jira/v26.11.8/), fully mechanically re-derived after mid-flight lane
landings. Plans without a receipt on disk are UNVERIFIED-UNLANDED. Receipt
names in both tables are verified against `ls receipts/` at write time.

## Plan -> receipt -> standing

Receipt attribution is by receipt-filename number overlap (cNN / NN prefix);
01 and 19 are attributed by subject overlap, noted below. Status vocab:
LANDED-PASS on PASS, LANDED-ALIVE on ALIVE, PARTIAL_ALIVE, PARTIAL,
UNVERIFIED-UNLANDED when no receipt exists on disk.

| Plan | Subject | Receipt | Status |
|---|---|---|---|
| 01-abi | 01-abi — Wave-2 Plan, Lane P1: @repop/abi Pi | g1-abi-reconcile.md | PARTIAL |
| 02-solver | P2 Wave-2 Plan — Kernel Hyperplane Solver | - | UNVERIFIED-UNLANDED |
| 03-cas-receipt | 03 - CAS Version Registry + Receipt | c4-cas-receipt-kernel.md | PARTIAL_ALIVE |
| 04-wasm-build | P4 — Kernel wasm32-unknown-unknown Build (Wa | c6-wasm-glue.md | LANDED-PASS |
| 05-kernel-courts | P5 Kernel Courts — Wave-2 Plan | - | UNVERIFIED-UNLANDED |
| 06-sab-ring | P6 Wave-2 Plan: SAB Ring (WIR0 Slot Port, At | c6b-sab-ring.md | PARTIAL_ALIVE |
| 07-worker-boot | J07 — Wave-2 Plan: P7 Worker Boot Chain (P7 | 07-worker-boot.md | PARTIAL_ALIVE |
| 08-atomvm | P8 — AtomVM Integration Plan (Wave 2, lane J | - | UNVERIFIED-UNLANDED |
| 09-message-protocol | P9: Worker Message Protocol (Wave-2 | c9-protocol-router.md | LANDED-PASS |
| 10-client-store | P10 — @repop/client Headless Store (Wave-2 | c10-client-store.md | LANDED-PASS |
| 11-provider | P11 — RepopProvider + Worker Lifecycle (Wav | c11-repop-package.md | PARTIAL_ALIVE |
| 12-hooks | P12 — useCgapEntity + useHyperplane Hooks (W | - | UNVERIFIED-UNLANDED |
| 13-boundary-actor | P13 Wave-2 Plan: useActor + RepopBoundary | - | UNVERIFIED-UNLANDED |
| 14-monorepo | P14 — Monorepo Scaffolding (ships FIRST in w | - | UNVERIFIED-UNLANDED |
| 15-test-infra | P15 — Test Infrastructure Plan (vitest proje | - | UNVERIFIED-UNLANDED |
| 16-pack-ontology | P16 Wave-2 Plan: ggen Pack Semantic Core | c16-pack-ontology.md | LANDED-PASS |
| 17-pack-gates | P17 — Pack Gates + Witnesses (cgap-popcorn-a | - | UNVERIFIED-UNLANDED |
| 18-pack-templates | P18 Pack Templates Plan (Wave 2) | - | UNVERIFIED-UNLANDED |
| 19-servengine-integration | servengine integratio | p19a-integration-preflight.md | LANDED-ALIVE |
| 20-aoq-uplink-demo | P20 — AoQ Uplink Seam, Local OCEL Ledger, De | - | UNVERIFIED-UNLANDED |

Plan numbering gaps (NN with no plan file) are absent-from-disk, not skipped
by this lane.

## Receipt inventory

| Receipt | Standing | Subject |
|---|---|---|
| 07-worker-boot.md | PARTIAL_ALIVE | C7 / P7 — Worker Boot Chain Receipt |
| c10-client-store.md | PASS | C10 — @repop/client Headless Store (Wave-3 |
| c11-repop-package.md | PARTIAL_ALIVE — gates ran th | C11 — repop React package (Wave-3 construc |
| c16-pack-ontology.md | PASS | C16 Receipt — cgap-popcorn-aoq ggen pack s |
| c16b-adoption.md | PASS (lane-local) | C16b Receipt — three-frame adoption for cg |
| c4-cas-receipt-kernel.md | PARTIAL_ALIVE | C4 — CAS Version Registry + 229B Receipt E |
| c6-wasm-glue.md | PASS (flipped from PARTIAL_ALIVE  | C6 (P4) — Kernel wasm glue + footprint gat |
| c6b-sab-ring.md | PARTIAL_ALIVE | C6b Receipt: SAB Ring (WIR0 port, SPSC, tr |
| c6w-wireup.md | PASS | C6w — repop-kernel-wasm ABI re-attach + co |
| c9-protocol-router.md | PASS | C9 — Worker message protocol: binary frame |
| d1-kernel-gate-sweep.md | PARTIAL | D1 Kernel Gate Sweep — v26.11.8 |
| d2-receipt-lint.md | PARTIAL | D2 Receipt Lint — v26.11.8 wave artifacts |
| d4-normalization.md | PARTIAL | D4 Plan Normalization — v26.11.8 |
| g1-abi-reconcile.md | PARTIAL | G1 — repop-abi layout vs cgap-popcorn-aoq  |
| g2-zod-projection.md | PARTIAL — deterministic ×2 rend | G2 zod projection via shacl-to-zod-pack |
| g3-admission-dryrun.md | PARTIAL | G3 admission dry-run: cgap-popcorn-aoq (no |
| g4-servengine-projection.md | PARTIAL_ALIVE | G4 — servengine-patch ggen projection (P19 |
| g5-docs-projection.md | PARTIAL | G5 — pack docs projection (wire_law / hook |
| g6-marketplace-baseline.md | PARTIAL_ALIVE | G6 Marketplace Baseline Receipt (ggen-mark |
| p19a-integration-preflight.md | ALIVE | P19a Integration Preflight — servengine-fr |
| p19b-servengine-config.md | PARTIAL | P19b — servengine-frontend config-side rep |
| r2-court-registration.md | PARTIAL_ALIVE | R2 Court Registration Bundle Receipt |
| r3-ts-repair.md | PARTIAL_ALIVE | R3 TS Repair — Residual Sweep (DRAIN, seco |

c4, c16b, g5, p19b are cross-cutting or sub-lane receipts; the plan table
attributes the primary receipt per plan (19 also has p19b on disk).

## Code census

| Dir | Files |
|---|---|
| packages | 1040 |
| kernel | 1144 |
| packs | 40 |

No .git at repo root: dirty state unknown; all landings uncommitted. Counts
include node_modules and dist (not excluded).

Tallies (live re-read): 20 plans, 23 receipts — 6 PASS, 1 ALIVE, 8
PARTIAL_ALIVE, 7 PARTIAL. Aggregate stays PARTIAL: PASS+ALIVE (7
of 23) do not yet carry the majority; PARTIAL-family does.

## Coordinator open items

- NOTICE vendor SHA pin: unresolved.
- git init pending: repo has no .git; landings cannot be committed or
  SHA-receipted until initialized.
- xstate-v5: pre-existing red, not introduced by this wave.
- G2 landing gated: canonical packages/repop/src/generated/ write blocked on
  lane ownership resolution.
- C2 reconcile: queued, no receipt on disk yet.
