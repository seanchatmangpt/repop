/**
 * ECOSYSTEM-SPEC-27.1.1 R-02 court — fixed-size shared Memory invariant.
 *
 * Chicago law: real WebAssembly.Memory / SharedArrayBuffer constructs and
 * byte/state asserts. No mocks. Proves:
 *   1. Growable descriptors (initial !== maximum) are typed-refused.
 *   2. Fixed alloc (initial === maximum) yields SharedArrayBuffer of exact
 *      page×64KiB bytes and refuses memory.grow(1).
 *   3. Hazard witness: raw growable shared Memory CAN grow (documents why
 *      the admit gate exists) — then our allocator refuses that shape.
 *   4. Arena partition stays under the 32 MiB mobile ceiling.
 *
 * Does NOT prove 250k-row soak EXIT 0 — that is the exact next verifier
 * (see docs/jira/v26.11.8/receipts/r02-fixed-shared-memory.md).
 */

import { describe, expect, it } from "vitest";
import {
  admitSharedMemoryDescriptor,
  allocFixedSharedMemory,
  allocFixedWorkerArena,
  isGrowableMemory,
  MOBILE_SHARED_MEMORY_CEILING_BYTES,
  MOBILE_SHARED_MEMORY_CEILING_PAGES,
  planFixedArenaPartition,
  WASM_PAGE_BYTES,
} from "./fixedSharedMemory.ts";
import { CONTROL_BYTES, SLOT_SIZE } from "./constants.ts";

describe("R-02 fixed shared Memory admit (descriptor court)", () => {
  it("refuses growable shared descriptor when initial !== maximum", () => {
    const v = admitSharedMemoryDescriptor({
      initial: 1,
      maximum: 2,
      shared: true,
    });
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.error.code).toBe("GROWABLE_REFUSED");
      expect(v.error.observed).toBe(1);
      expect(v.error.expected).toBe(2);
    }
  });

  it("refuses shared descriptor with no maximum (unbounded growable)", () => {
    const v = admitSharedMemoryDescriptor({ initial: 4, shared: true });
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.error.code).toBe("GROWABLE_REFUSED");
    }
  });

  it("refuses pages over the 32 MiB mobile ceiling", () => {
    const pages = MOBILE_SHARED_MEMORY_CEILING_PAGES + 1;
    const v = admitSharedMemoryDescriptor({
      initial: pages,
      maximum: pages,
      shared: true,
    });
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.error.code).toBe("OVER_CEILING");
      expect(v.error.observed).toBe(pages);
      expect(v.error.expected).toBe(MOBILE_SHARED_MEMORY_CEILING_PAGES);
    }
  });

  it("admits initial === maximum under the ceiling", () => {
    const v = admitSharedMemoryDescriptor({
      initial: 4,
      maximum: 4,
      shared: true,
    });
    expect(v).toEqual({ ok: true, value: { initial: 4, maximum: 4 } });
  });
});

describe("R-02 fixed shared Memory allocation (real byte court)", () => {
  it("hazard witness: raw growable shared Memory can grow past initial", () => {
    // Documents the prior tension shape (growable shared Memory). If this
    // ever stops growing, the GROWABLE_REFUSED gate is still required —
    // but the hazard leg would need re-pinning.
    const hazard = new WebAssembly.Memory({
      initial: 1,
      maximum: 2,
      shared: true,
    });
    expect(hazard.buffer).toBeInstanceOf(SharedArrayBuffer);
    expect(hazard.buffer.byteLength).toBe(WASM_PAGE_BYTES);
    const prev = hazard.grow(1);
    expect(prev).toBe(1);
    expect(hazard.buffer.byteLength).toBe(2 * WASM_PAGE_BYTES);
  });

  it("allocFixedSharedMemory locks initial === maximum and refuses grow", () => {
    const pages = 4;
    const v = allocFixedSharedMemory(pages);
    expect(v.ok, v.ok ? "" : v.error.message).toBe(true);
    if (!v.ok) return;

    expect(v.value.pages).toBe(pages);
    expect(v.value.byteLength).toBe(pages * WASM_PAGE_BYTES);
    expect(v.value.buffer).toBeInstanceOf(SharedArrayBuffer);
    expect(v.value.buffer.byteLength).toBe(pages * WASM_PAGE_BYTES);
    expect(v.value.memory.buffer).toBe(v.value.buffer);

    // Fixed-size: grow must throw (Maximum memory size exceeded).
    expect(() => v.value.memory.grow(1)).toThrow(/Maximum memory size exceeded/i);
    expect(isGrowableMemory(v.value.memory)).toBe(false);
    // Buffer length unchanged after refused grow.
    expect(v.value.memory.buffer.byteLength).toBe(pages * WASM_PAGE_BYTES);
  });

  it("allocFixedSharedMemory refuses an over-ceiling page count", () => {
    const v = allocFixedSharedMemory(MOBILE_SHARED_MEMORY_CEILING_PAGES + 1);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.error.code).toBe("OVER_CEILING");
    }
  });
});

describe("R-02 arena partition under 32 MiB ceiling", () => {
  it("plans ring SAB + scratch Memory under the mobile ceiling", () => {
    const ringSlotCount = 8;
    const scratchPages = 2;
    const plan = planFixedArenaPartition({ ringSlotCount, scratchPages });
    expect(plan.ok, plan.ok ? "" : plan.error.message).toBe(true);
    if (!plan.ok) return;

    const expectedRing = CONTROL_BYTES + ringSlotCount * SLOT_SIZE;
    expect(plan.value.ringBytes).toBe(expectedRing);
    expect(plan.value.scratchBytes).toBe(scratchPages * WASM_PAGE_BYTES);
    expect(plan.value.totalBytes).toBe(expectedRing + scratchPages * WASM_PAGE_BYTES);
    expect(plan.value.totalBytes).toBeLessThanOrEqual(MOBILE_SHARED_MEMORY_CEILING_BYTES);
  });

  it("refuses a partition that would exceed the 32 MiB ceiling", () => {
    // Max scratch pages leave no room for a non-trivial ring once combined.
    const scratchPages = MOBILE_SHARED_MEMORY_CEILING_PAGES;
    const plan = planFixedArenaPartition({ ringSlotCount: 8, scratchPages });
    expect(plan.ok).toBe(false);
    if (!plan.ok) {
      expect(plan.error.code).toBe("OVER_CEILING");
      expect(plan.error.observed).toBeGreaterThan(MOBILE_SHARED_MEMORY_CEILING_BYTES);
    }
  });

  it("allocFixedWorkerArena yields fixed SAB + fixed Memory under ceiling", () => {
    const ringSlotCount = 8;
    const scratchPages = 2;
    const arena = allocFixedWorkerArena({ ringSlotCount, scratchPages });
    expect(arena.ok, arena.ok ? "" : arena.error.message).toBe(true);
    if (!arena.ok) return;

    expect(arena.value.ringSab).toBeInstanceOf(SharedArrayBuffer);
    expect(arena.value.ringSab.byteLength).toBe(CONTROL_BYTES + ringSlotCount * SLOT_SIZE);
    expect(arena.value.scratch.buffer).toBeInstanceOf(SharedArrayBuffer);
    expect(arena.value.scratch.byteLength).toBe(scratchPages * WASM_PAGE_BYTES);
    expect(arena.value.plan.totalBytes).toBe(
      arena.value.ringSab.byteLength + arena.value.scratch.byteLength,
    );
    expect(arena.value.plan.totalBytes).toBeLessThanOrEqual(
      MOBILE_SHARED_MEMORY_CEILING_BYTES,
    );
    expect(() => arena.value.scratch.memory.grow(1)).toThrow(
      /Maximum memory size exceeded/i,
    );
  });
});
