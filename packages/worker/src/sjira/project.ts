/**
 * repop → sJira projection: hyperplane register → WorkOrder row → delivery
 * fragment, with the typed repop-refusal mapping table.
 *
 * Sources cited per decision:
 * - WorkOrder contract: /Users/sac/xaas/lib/xaas/pack.ex:595-655 (admit/3).
 * - Hyperplane register: /Users/sac/repop/packages/abi/src/layout.ts:212-221.
 * - Delivery projection: /Users/sac/xaas/lib/xaas/sjira/engineer_workflow.ex:25-71
 *   (`project/2` adds `work_digest` + `idempotency_key = "sjira:" <> digest`).
 */

import type {
  HyperplaneRegisterAbi,
  ReceiptFrameAbi,
  ReceiptSealedFragment,
  SjiraRefusal,
  SjiraResult,
  WorkOrderRow,
} from "./types.ts";

/** Capability namespace for hyperplane-kind capabilities. `plane_kind` is a
 *  U16 (generated/layout.ts:53); the pack declares it as the string
 *  `hyperplane:<kind>` so `declared/2` (pack.ex:686) can match against the
 *  pack's declaration map keyed by string capability names. */
export function capabilityForPlaneKind(planeKind: number): string {
  return `hyperplane:${planeKind}`;
}

/** Lowercase hex of a byte array (deterministic, no allocations beyond the
 *  output string). */
function hex(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

/** All-zero check: a register without an evidence binding is never admitted
 *  (fail-closed law). */
function isAllZero(bytes: Uint8Array): boolean {
  let any = 0;
  for (const b of bytes) any |= b;
  return any === 0;
}

/**
 * Project a decoded hyperplane register into a WorkOrder row.
 *
 * Fail-closed: a register whose `binding` is all-zero carries no evidence —
 * typed refusal `binding_evidence_missing`, never a row (never admit without
 * evidence). plane_id = 0 is also refused: it is the ABI null plane
 * (hyperplane_id 0 is the unbound sentinel), and `work_subject/2`
 * (pack.ex:719-721) would otherwise cast "0" as a live primary key.
 *
 * Field decisions (each cites its source):
 * - `requires_capability` = `hyperplane:<plane_kind>` — capability names in
 *   the pack's declaration map are strings (pack.ex:686 `Map.get(pack.declarations,
 *   capability)`); plane_kind is a U16 field of the register
 *   (generated/layout.ts:53).
 * - `path_scope` = `resource:WorkOrder/<plane_id>` — single subject entry,
 *   exactly the shape `split_scope/2` (pack.ex:706-716) splits out and
 *   `work_subject/2` (pack.ex:719) casts the pk from.
 * - `authority_ceiling` = "DO" — the only accepted ceiling
 *   (pack.ex:703 `do_ceiling/1`: only "DO" passes; an ADMITTED binding is a
 *   DO, and the WorkOrder's own ceiling must say so).
 * - `graph_digest` = lowercase hex of the 8-byte binding — the caller-asserted
 *   digest judged by `SemanticDrive.anchor_from/2` (pack.ex:663).
 */
export function workOrderFromPlane(
  reg: HyperplaneRegisterAbi,
): SjiraResult<WorkOrderRow> {
  if (isAllZero(reg.binding)) {
    return {
      ok: false,
      refusal: {
        class: "binding_evidence_missing",
        planeId: reg.planeId.toString(),
      },
    };
  }
  if (reg.planeId === 0n) {
    return {
      ok: false,
      refusal: {
        class: "pack_refused",
        reason: { work_order_subject_invalid: "resource:WorkOrder/0" },
      },
    };
  }
  return {
    ok: true,
    value: {
      requires_capability: capabilityForPlaneKind(reg.planeKind),
      path_scope: `resource:WorkOrder/${reg.planeId}`,
      authority_ceiling: "DO",
      graph_digest: hex(reg.binding),
    },
  };
}

/**
 * Typed mapping from the repop kernel refusal union
 * (kernel/crates/repop-kernel/src/refuse.rs:11-58) into the sJira refusal
 * taxonomy.
 *
 * Mapping decisions (each cites its source):
 * - `VersionConflict{entity,expected,actual}` → `subject_concurrency_conflict`
 *   — a CAS version miss is by definition two writers racing on the same
 *   subject row (refuse.rs:12-19); the sJira projection surfaces it as the
 *   subject-concurrency class rather than swallowing it into a generic
 *   pack refusal, so the queue can re-dispose the losing writer.
 * - `ExhaustedLease{tick,tick_ceiling}` → `authority_ceiling_insufficient`
 *   shape — an exhausted lease means the claimed authority (tick) has reached
 *   its ceiling (refuse.rs:46-53), which is exactly the semantic of
 *   `do_ceiling/1`'s `{:refused, {:authority_ceiling_insufficient, ceiling}}`
 *   (pack.ex:703-704); the ceiling is rendered as `"<tick>/<tick_ceiling>"`.
 * - Everything else stays an unmapped passthrough `pack_refused` — the closed
 *   mapping table is exhaustive over the classes this projection consumes;
 *   unknown repop refusal classes arrive as `WORKER_REFUSED`/passthrough
 *   rather than being silently dropped.
 */
export const REPOP_REFUSAL_MAP = {
  VersionConflict: (
    entity: string | number | bigint,
    expected: string | number | bigint,
    actual: string | number | bigint,
  ): Extract<SjiraRefusal, { class: "subject_concurrency_conflict" }> => ({
    class: "subject_concurrency_conflict",
    entity: String(entity),
    expected: String(expected),
    actual: String(actual),
  }),
  ExhaustedLease: (
    tick: string | number | bigint,
    tickCeiling: string | number | bigint,
  ): Extract<SjiraRefusal, { class: "authority_ceiling_insufficient" }> => ({
    class: "authority_ceiling_insufficient",
    ceiling: `${tick}/${tickCeiling}`,
    detail:
      "repop lease exhausted (tick reached tick_ceiling) — mapped to the " +
      "authority_ceiling_insufficient shape per project.ts mapping decision",
  }),
} as const;

/** Build a ReceiptSealed OCEL event fragment from a sealed receipt frame
 *  plus the WorkOrder it seals (attributes alg_id/version/op_count;
 *  relationships: WorkOrder by plane_id, Receipt by digest).
 *
 * Fail-closed: an all-zero receipt binding is refused (NOT_SEALED-class
 * evidence law) — a receipt with no binding seals nothing. */
export function receiptSealedFragment(
  frame: ReceiptFrameAbi,
  planeId: bigint,
  opCount: number,
): SjiraResult<ReceiptSealedFragment> {
  if (isAllZero(frame.binding)) {
    return {
      ok: false,
      refusal: {
        class: "pack_refused",
        reason: { not_sealed: "receipt binding is all-zero" },
      },
    };
  }
  return {
    ok: true,
    value: {
      activity: "receipt_sealed",
      attributes: {
        alg_id: frame.algId,
        version: frame.version,
        op_count: opCount,
      },
      relationships: {
        work_order: `resource:WorkOrder/${planeId}`,
        receipt: `resource:Receipt/${frame.digest.toString(16)}`,
      },
    },
  };
}
