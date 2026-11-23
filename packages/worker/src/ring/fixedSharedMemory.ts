/**
 * ECOSYSTEM-SPEC-27.1.1 risk R-02 — fixed-size shared memory for the
 * worker / FFB path.
 *
 * Law: SharedArrayBuffer is fixed at construction. WebAssembly.Memory with
 * `shared: true` is growable whenever `maximum > initial`. Prior tension
 * (measured elsewhere): a growable shared arena reached 64 MiB against a
 * ~32 MB mobile ceiling and OOMed under large row loads.
 *
 * This module is the sole admitted allocation site for shared
 * WebAssembly.Memory on the worker/FFB path. It refuses growable
 * descriptors (`initial !== maximum`) and caps total arena bytes at the
 * mobile ceiling. Kernel-side `memory.grow` in repop-kernel-wasm remains
 * a separate surface (not closed by R-02).
 */

import { CONTROL_BYTES, SLOT_SIZE } from "./constants.ts";
import { allocSab } from "./sabRing.ts";

/** Wasm page size in bytes (64 KiB). */
export const WASM_PAGE_BYTES = 64 * 1024;

/**
 * Mobile shared-memory ceiling witnessed in the R-02 tension
 * (64 MiB growable vs ~32 MB hard stop). 512 pages × 64 KiB = 32 MiB.
 */
export const MOBILE_SHARED_MEMORY_CEILING_BYTES = 32 * 1024 * 1024;

/** Ceiling expressed in wasm pages. */
export const MOBILE_SHARED_MEMORY_CEILING_PAGES =
  MOBILE_SHARED_MEMORY_CEILING_BYTES / WASM_PAGE_BYTES;

/** Default FFB scratch arena: full ceiling, fixed (initial === maximum). */
export const DEFAULT_FIXED_SCRATCH_PAGES = MOBILE_SHARED_MEMORY_CEILING_PAGES;

/** Closed refusal codes for the fixed-memory admit path. */
export type FixedMemoryErrorCode =
  | "GROWABLE_REFUSED"
  | "OVER_CEILING"
  | "BAD_PAGES"
  | "BAD_SLOT_COUNT"
  | "CONSTRUCT_FAILED"
  | "NOT_SHARED";

export interface FixedMemoryError {
  readonly code: FixedMemoryErrorCode;
  readonly message: string;
  readonly observed?: number;
  readonly expected?: number;
}

export type FixedMemoryResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: FixedMemoryError };

function refuse(
  code: FixedMemoryErrorCode,
  message: string,
  observed?: number,
  expected?: number,
): FixedMemoryResult<never> {
  return {
    ok: false,
    error: {
      code,
      message,
      ...(observed !== undefined ? { observed } : {}),
      ...(expected !== undefined ? { expected } : {}),
    },
  };
}

function admit<T>(value: T): FixedMemoryResult<T> {
  return { ok: true, value };
}

/** Descriptor shape for shared WebAssembly.Memory construction. */
export interface SharedMemoryDescriptor {
  readonly initial: number;
  readonly maximum?: number;
  readonly shared?: boolean;
}

/**
 * Admit a shared-memory descriptor under R-02.
 * Refuse when growable (`maximum` missing or `initial !== maximum`),
 * when pages are non-integral / out of range, or when over the mobile ceiling.
 */
export function admitSharedMemoryDescriptor(
  desc: SharedMemoryDescriptor,
): FixedMemoryResult<{ readonly initial: number; readonly maximum: number }> {
  const { initial, maximum, shared } = desc;
  if (shared === false) {
    return refuse("NOT_SHARED", "R-02 admits shared memory only on this path");
  }
  if (!Number.isInteger(initial) || initial < 1) {
    return refuse("BAD_PAGES", "initial pages must be an integer >= 1", initial, 1);
  }
  if (maximum === undefined) {
    return refuse(
      "GROWABLE_REFUSED",
      "shared memory without maximum is growable; require initial === maximum",
      initial,
    );
  }
  if (!Number.isInteger(maximum) || maximum < 1) {
    return refuse("BAD_PAGES", "maximum pages must be an integer >= 1", maximum, 1);
  }
  if (initial !== maximum) {
    return refuse(
      "GROWABLE_REFUSED",
      "initial !== maximum — growable shared memory refused (R-02)",
      initial,
      maximum,
    );
  }
  if (initial > MOBILE_SHARED_MEMORY_CEILING_PAGES) {
    return refuse(
      "OVER_CEILING",
      "pages exceed 32 MiB mobile shared-memory ceiling",
      initial,
      MOBILE_SHARED_MEMORY_CEILING_PAGES,
    );
  }
  return admit({ initial, maximum });
}

export interface FixedSharedMemory {
  readonly memory: WebAssembly.Memory;
  readonly pages: number;
  readonly byteLength: number;
  readonly buffer: SharedArrayBuffer;
}

/**
 * Allocate fixed-size shared WebAssembly.Memory with `initial === maximum`.
 * Typed refuse on growable descriptors, ceiling breach, or construct failure.
 */
export function allocFixedSharedMemory(
  pages: number = DEFAULT_FIXED_SCRATCH_PAGES,
): FixedMemoryResult<FixedSharedMemory> {
  const verdict = admitSharedMemoryDescriptor({
    initial: pages,
    maximum: pages,
    shared: true,
  });
  if (!verdict.ok) return verdict;

  let memory: WebAssembly.Memory;
  try {
    memory = new WebAssembly.Memory({
      initial: verdict.value.initial,
      maximum: verdict.value.maximum,
      shared: true,
    });
  } catch (err) {
    return refuse(
      "CONSTRUCT_FAILED",
      "WebAssembly.Memory(shared, fixed) construct failed: " + String(err),
      pages,
    );
  }

  // TS lib types `Memory.buffer` as ArrayBuffer even for shared:true;
  // ground truth is the runtime instanceof check.
  const rawBuffer: ArrayBufferLike = memory.buffer;
  if (!(rawBuffer instanceof SharedArrayBuffer)) {
    return refuse(
      "NOT_SHARED",
      "constructed Memory.buffer is not a SharedArrayBuffer",
      rawBuffer.byteLength,
    );
  }
  const buffer: SharedArrayBuffer = rawBuffer;

  const byteLength = buffer.byteLength;
  const expected = pages * WASM_PAGE_BYTES;
  if (byteLength !== expected) {
    return refuse(
      "CONSTRUCT_FAILED",
      "fixed Memory byteLength mismatch",
      byteLength,
      expected,
    );
  }

  return admit({ memory, pages, byteLength, buffer });
}

/**
 * Probe whether a live Memory can still grow. Fixed-size memories must
 * refuse growth (throw or return -1). Returns true when growth succeeds.
 */
export function isGrowableMemory(memory: WebAssembly.Memory): boolean {
  const before = memory.buffer.byteLength;
  try {
    const prev = memory.grow(1);
    if (prev === -1) return false;
    // Growth succeeded — restore is impossible; caller must treat as growable.
    return memory.buffer.byteLength > before || prev >= 0;
  } catch {
    return false;
  }
}

/** Planned partition of the worker/FFB arena under the 32 MiB ceiling. */
export interface ArenaPartitionPlan {
  /** SAB ring bytes (control page + slots). */
  readonly ringBytes: number;
  readonly ringSlotCount: number;
  /** Fixed shared Memory pages for FFB scratch (initial === maximum). */
  readonly scratchPages: number;
  readonly scratchBytes: number;
  /** ringBytes + scratchBytes — must be <= mobile ceiling. */
  readonly totalBytes: number;
}

/**
 * Plan ring SAB + fixed scratch Memory so the combined arena stays under
 * the 32 MiB mobile ceiling. Does not allocate.
 *
 * When `scratchPages` is omitted, uses the largest page count that still
 * fits beside the ring under the ceiling (never a growable remainder).
 */
export function planFixedArenaPartition(opts: {
  readonly ringSlotCount: number;
  readonly scratchPages?: number;
}): FixedMemoryResult<ArenaPartitionPlan> {
  const { ringSlotCount } = opts;
  if (!Number.isInteger(ringSlotCount) || ringSlotCount < 2) {
    return refuse(
      "BAD_SLOT_COUNT",
      "ringSlotCount must be an integer >= 2",
      ringSlotCount,
      2,
    );
  }

  const ringBytes = CONTROL_BYTES + ringSlotCount * SLOT_SIZE;
  if (ringBytes > MOBILE_SHARED_MEMORY_CEILING_BYTES) {
    return refuse(
      "OVER_CEILING",
      "ring SAB alone exceeds 32 MiB mobile ceiling",
      ringBytes,
      MOBILE_SHARED_MEMORY_CEILING_BYTES,
    );
  }

  const maxScratchPages = Math.floor(
    (MOBILE_SHARED_MEMORY_CEILING_BYTES - ringBytes) / WASM_PAGE_BYTES,
  );
  const scratchPages = opts.scratchPages ?? maxScratchPages;
  if (!Number.isInteger(scratchPages) || scratchPages < 1) {
    return refuse(
      "BAD_PAGES",
      "scratchPages must be an integer >= 1 (no room under ceiling?)",
      scratchPages,
      1,
    );
  }
  if (scratchPages > MOBILE_SHARED_MEMORY_CEILING_PAGES) {
    return refuse(
      "OVER_CEILING",
      "scratch pages exceed 32 MiB mobile ceiling",
      scratchPages,
      MOBILE_SHARED_MEMORY_CEILING_PAGES,
    );
  }

  const scratchBytes = scratchPages * WASM_PAGE_BYTES;
  const totalBytes = ringBytes + scratchBytes;
  if (totalBytes > MOBILE_SHARED_MEMORY_CEILING_BYTES) {
    return refuse(
      "OVER_CEILING",
      "ring SAB + scratch Memory exceed 32 MiB mobile ceiling",
      totalBytes,
      MOBILE_SHARED_MEMORY_CEILING_BYTES,
    );
  }

  return admit({
    ringBytes,
    ringSlotCount,
    scratchPages,
    scratchBytes,
    totalBytes,
  });
}

export interface FixedWorkerArena {
  readonly plan: ArenaPartitionPlan;
  /** Fixed-size SharedArrayBuffer ring backing (SAB is fixed at construct). */
  readonly ringSab: SharedArrayBuffer;
  /** Fixed-size shared WebAssembly.Memory scratch (initial === maximum). */
  readonly scratch: FixedSharedMemory;
}

/**
 * Allocate the worker/FFB arena: fixed SAB ring + fixed shared Memory
 * scratch, both under the mobile ceiling. Refuses growable Memory.
 */
export function allocFixedWorkerArena(opts: {
  readonly ringSlotCount: number;
  readonly scratchPages?: number;
}): FixedMemoryResult<FixedWorkerArena> {
  const plan = planFixedArenaPartition(opts);
  if (!plan.ok) return plan;

  let ringSab: SharedArrayBuffer;
  try {
    ringSab = allocSab(plan.value.ringSlotCount);
  } catch (err) {
    return refuse(
      "CONSTRUCT_FAILED",
      "allocSab failed: " + String(err),
      plan.value.ringSlotCount,
    );
  }
  if (ringSab.byteLength !== plan.value.ringBytes) {
    return refuse(
      "CONSTRUCT_FAILED",
      "ring SAB byteLength mismatch",
      ringSab.byteLength,
      plan.value.ringBytes,
    );
  }

  const scratch = allocFixedSharedMemory(plan.value.scratchPages);
  if (!scratch.ok) return scratch;

  return admit({
    plan: plan.value,
    ringSab,
    scratch: scratch.value,
  });
}
