/**
 * sJira WorkOrder row + refusal taxonomy mirrored from the xaas admission
 * seam (READ-ONLY mirror; xaas is the source of truth).
 *
 * Sources:
 * - WorkOrder row contract: /Users/sac/xaas/lib/xaas/pack.ex:595-655
 *   (`Xaas.Pack.admit/3` consumes a snake_case row with keys
 *   `requires_capability`, `path_scope`, `authority_ceiling`, `graph_digest`).
 * - Refusal taxonomy: pack.ex:610-624 (@doc block enumerating every refusal
 *   `admit/3` may return) and pack.ex:706-722 (`declared/1`, `do_ceiling/1`).
 * - repop kernel refusal union: kernel/crates/repop-kernel/src/refuse.rs:11-58
 *   (`Refusal::VersionConflict{entity,expected,actual}`,
 *   `Refusal::ExhaustedLease{tick,tick_ceiling}`).
 * - Delivery projection schema: /Users/sac/xaas/lib/xaas/sjira/engineer_workflow.ex:12
 *   (`@schema "xaas.sjira.engineer-work/v1"`); standing vocabulary
 *   engineer_workflow.ex:13-19; idempotency key
 *   `"sjira:" <> work_digest` engineer_workflow.ex:67.
 */

/** A repop 64-byte hyperplane register, decoded per @repop/abi
 *  (packages/abi/src/layout.ts:212-221; binding is [u8;8] at offset 48,
 *  generated/layout.ts:60). */
export interface HyperplaneRegisterAbi {
  readonly planeKind: number;
  readonly flags: number;
  readonly planeId: bigint;
  readonly normalX: number;
  readonly normalY: number;
  readonly normalZ: number;
  readonly planeOffset: number;
  /** [u8;8] — the evidence binding. All-zero = no evidence (fail-closed). */
  readonly binding: Uint8Array;
  readonly epoch: number;
}

/**
 * The WorkOrder row exactly as `Xaas.Pack.admit/3` reads it
 * (pack.ex:595-655): snake_case keys, string values where xaas expects
 * strings. `path_scope` is the single subject entry
 * `"resource:<Resource>/<pk>"` (pack.ex:706-716 `split_scope/2` requires
 * exactly one subject of the bound resource; the class entry is derived, so
 * the caller supplies only the subject entry).
 */
export interface WorkOrderRow {
  /** Pack capability name; must be ADMITTED standing in the pinned pack
   *  (pack.ex:686-698 `declared/2`). */
  readonly requires_capability: string;
  /** Exactly one subject entry "resource:<Resource>/<pk>"
   *  (pack.ex:719-721 `work_subject/2`: [] -> missing, >1 -> ambiguous). */
  readonly path_scope: string;
  /** Must be the literal "DO" (pack.ex:703-704 `do_ceiling/1`). */
  readonly authority_ceiling: "DO";
  /** Caller-asserted graph digest; judged via SemanticDrive.anchor_from/2. */
  readonly graph_digest: string;
}

/** Receipt frame fields per @repop/abi (generated/layout.ts:66-75): alg_id
 *  U16@4, version U16@2, 32B binding@8, FNV-1a32 digest@60. */
export interface ReceiptFrameAbi {
  readonly algId: number;
  readonly version: number;
  readonly binding: Uint8Array; // [u8;32]
  readonly digest: number;
}

/** Standing vocabulary of the engineer-work delivery projection
 *  (engineer_workflow.ex:13-19, closed set). */
export const ENGINEER_WORK_STANDING = [
  "READY_FOR_ENGINEER_DISPOSITION",
  "NOVEL_INVESTIGATION_REQUIRED",
  "BLOCKED_ON_EVIDENCE",
  "UNKNOWN",
  "UNSUPPORTED(provider_capability)",
] as const;

export type EngineerWorkStanding = (typeof ENGINEER_WORK_STANDING)[number];

/** sJira-side typed refusal, mirroring the pack.ex:610-624 taxonomy classes
 *  this projection can produce, plus the repop-kernel mapping classes.
 *  Closed union; never a string. */
export type SjiraRefusal =
  | {
      /** plane register carries no evidence binding (all-zero [u8;8]).
       *  Fail-closed: never admit without evidence. */
      readonly class: "binding_evidence_missing";
      readonly planeId: string;
    }
  | {
      /** `Xaas.Pack.admit/3` refusal passed through verbatim
       *  (pack.ex:610-624 `refusal()` taxonomy). */
      readonly class: "pack_refused";
      readonly reason: unknown;
    }
  | {
      /** Repop `Refusal::VersionConflict` mapped to the sJira
       *  subject-concurrency class (see project.ts REPOP_REFUSAL_MAP). */
      readonly class: "subject_concurrency_conflict";
      readonly entity: string;
      readonly expected: string;
      readonly actual: string;
    }
  | {
      /** Repop `Refusal::ExhaustedLease` mapped to the
       *  authority-ceiling-insufficient shape (see REPOP_REFUSAL_MAP). */
      readonly class: "authority_ceiling_insufficient";
      readonly ceiling: string;
      readonly detail: string;
    };

/** Closed result type (ring/ocel pattern: never throws for refusals). */
export type SjiraResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly refusal: SjiraRefusal };

/** ReceiptSealed OCEL event fragment (event class already exists on the xaas
 *  side). Attributes mirror the receipt frame fields; relationships key the
 *  WorkOrder by plane_id and the Receipt by its digest. */
export interface ReceiptSealedFragment {
  readonly activity: "receipt_sealed";
  readonly attributes: {
    readonly alg_id: number;
    readonly version: number;
    readonly op_count: number;
  };
  readonly relationships: {
    readonly work_order: string; // "resource:WorkOrder/<plane_id>"
    readonly receipt: string; // "resource:Receipt/<digest-hex>"
  };
}
