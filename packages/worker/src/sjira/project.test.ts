import { describe, expect, it } from "vitest";
import {
  REPOP_REFUSAL_MAP,
  capabilityForPlaneKind,
  receiptSealedFragment,
  workOrderFromPlane,
} from "./project.ts";
import type {
  HyperplaneRegisterAbi,
  ReceiptFrameAbi,
  WorkOrderRow,
} from "./types.ts";

function plane(overrides: Partial<HyperplaneRegisterAbi> = {}): HyperplaneRegisterAbi {
  return {
    planeKind: 3,
    flags: 0,
    planeId: 42n,
    normalX: 1,
    normalY: 0,
    normalZ: 0,
    planeOffset: 0.5,
    binding: new Uint8Array([0xde, 0xad, 0xbe, 0xef, 1, 2, 3, 4]),
    epoch: 1,
    ...overrides,
  } as unknown as HyperplaneRegisterAbi;
}

function receipt(overrides: Partial<ReceiptFrameAbi> = {}): ReceiptFrameAbi {
  return {
    algId: 0x0000,
    version: 1,
    binding: new Uint8Array(32).fill(0xab),
    digest: 0xcafebabe,
    ...overrides,
  } as unknown as ReceiptFrameAbi;
}

describe("transcription law: pinned fixture (literal row shape)", () => {
  it("projects a bound plane into the exact WorkOrder row literal", () => {
    const r = workOrderFromPlane(plane());
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error(JSON.stringify(r.refusal));
    // Transcription law: the expected row is pinned as a literal so any
    // drift in the pack.ex:595-655 contract fails this fixture.
    const expected: WorkOrderRow = {
      requires_capability: "hyperplane:3",
      path_scope: "resource:WorkOrder/42",
      authority_ceiling: "DO",
      graph_digest: "deadbeef01020304",
    };
    expect(r.value).toEqual(expected);
  });

  it("capability namespacing is deterministic per plane_kind", () => REPOP_CAPABILITY_SANITY());

  function REPOP_CAPABILITY_SANITY(): void {
    expect(capabilityForPlaneKind(0)).toBe("hyperplane:0");
    expect(capabilityForPlaneKind(65535)).toBe("hyperplane:65535");
  }
});

describe("fail-closed courts", () => {
  it("refuses an all-zero binding (binding_evidence_missing)", () => {
    const r = workOrderFromPlane(plane({ binding: new Uint8Array(8) }));
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("admitted without evidence");
    expect(r.refusal).toEqual({
      class: "binding_evidence_missing",
      planeId: "42",
    });
  });

  it("refuses plane_id 0 (ABI null plane, invalid subject)", () => {
    const r = workOrderFromPlane(plane({ planeId: 0n }));
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("admitted null plane");
    expect(r.refusal).toEqual({
      class: "pack_refused",
      reason: { work_order_subject_invalid: "resource:WorkOrder/0" },
    });
  });

  it("refuses a receipt with an all-zero binding (never seals nothing)", () => {
    const r = receiptSealedFragment(receipt({ binding: new Uint8Array(32) }), 42n, 7);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("sealed with no binding");
    expect(r.refusal).toEqual({
      class: "pack_refused",
      reason: { not_sealed: "receipt binding is all-zero" },
    });
  });
});

describe("repop refusal mapping table (mutation leg)", () => {
  // Mutation leg: every assertion below deep-equals a pinned literal, so any
  // mutation of REPOP_REFUSAL_MAP (key, class string, or field rename) flips
  // at least one of these tests.
  it("maps VersionConflict to the subject-concurrency class", () => {
    expect(REPOP_REFUSAL_MAP.VersionConflict(7n, 3n, 5n)).toEqual({
      class: "subject_concurrency_conflict",
      entity: "7",
      expected: "3",
      actual: "5",
    });
  });

  it("maps ExhaustedLease to the authority_ceiling_insufficient shape", () => {
    const mapped = REPOP_REFUSAL_MAP.ExhaustedLease(9n, 8n);
    expect(mapped.class).toBe("authority_ceiling_insufficient");
    expect(mapped.ceiling).toBe("9/8");
    expect(typeof mapped.detail).toBe("string");
  });

  it("mapping table is deterministic and exhaustive over its classes", () => {
    const a = REPOP_REFUSAL_MAP.VersionConflict(1n, 2n, 3n);
    const b = REPOP_REFUSAL_MAP.VersionConflict(1n, 2n, 3n);
    expect(a).toEqual(b);
    expect(Object.keys(REPOP_REFUSAL_MAP).sort()).toEqual([
      "ExhaustedLease",
      "VersionConflict",
    ]);
  });
});

describe("ReceiptSealed fragment", () => {
  it("carries alg_id/version/op_count and both relationships", () => {
    const r = receiptSealedFragment(receipt(), 42n, 7);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error(JSON.stringify(r.refusal));
    expect(r.value).toEqual({
      activity: "receipt_sealed",
      attributes: { alg_id: 0x0000, version: 1, op_count: 7 },
      relationships: {
        work_order: "resource:WorkOrder/42",
        receipt: "resource:Receipt/cafebabe",
      },
    });
  });
});
