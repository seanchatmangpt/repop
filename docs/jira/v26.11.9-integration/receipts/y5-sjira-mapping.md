# Y5 — repop → sJira mapping (lane receipt)

Standing: PARTIAL_ALIVE

## Subject

`/Users/sac/repop/packages/worker/src/sjira/` (new, lane-owned):
`types.ts` — WorkOrder row + sJira refusal union mirrored from the xaas seam
(`Xaas.Pack.admit/3`, /Users/sac/xaas/lib/xaas/pack.ex:595-655; refusal
taxonomy pack.ex:610-624; standing vocab + `"sjira:" <> digest` idempotency
from /Users/sac/xaas/lib/xaas/sjira/engineer_workflow.ex:12-19,67);
`project.ts` — `workOrderFromPlane` (HyperplaneRegister 64B ABI → WorkOrder
row: `requires_capability = hyperplane:<plane_kind>`,
`path_scope = resource:WorkOrder/<plane_id>`, `authority_ceiling = "DO"`,
`graph_digest` = lowercase hex of the 8B binding), `REPOP_REFUSAL_MAP`
(VersionConflict → subject_concurrency_conflict; ExhaustedLease →
authority_ceiling_insufficient, `"<tick>/<tick_ceiling>"`; each mapping
decision cited in-source), `receiptSealedFragment` (alg_id/version/op_count
attributes; relationships WorkOrder/<plane_id> + Receipt/<digest-hex>);
`project.test.ts` — 9 courts.

## Gates (executed this session)

- `npx tsc --noEmit` (packages/worker) — exit 0.
- `npx vitest run` (packages/worker) — 18 files, 145/145 passed, incl.
  `src/sjira/project.test.ts` (9 tests): pinned row-literal fixture
  (transcription law), fail-closed courts (all-zero binding →
  binding_evidence_missing; plane_id 0 → work_order_subject_invalid;
  all-zero receipt binding → not_sealed), mutation leg on the mapping table
  (deep-equal pinned literals + table-key exhaustiveness).
- Environment repair: `pnpm install --frozen-lockfile` (root; tree had no
  node_modules before the gates — install was required, not incidental).

## Falsifiers honored

- Plane without binding digest → typed refusal, never a row (never admit
  without evidence). Witnessed by the all-zero-binding court.
- Mapping table mutations flip a pinned-literal court (mutation leg present).

## UNVERIFIED / deferred

- Live `Xaas.Pack.admit/3` round-trip: deferred — requires the pinned pack on
  the xaas side. The row shape here is the transcription mirror (cited
  file:line), not an xaas-executed admission. Standing is therefore
  PARTIAL_ALIVE, not ALIVE.
- `xaas` untouched (read-only lane discipline held).
