/**
 * ECOSYSTEM-SPEC-27.1.1 R-02 soak — 250k-row-equivalent byte pressure
 * against `allocFixedWorkerArena` / fixed scratch Memory.
 *
 * Chicago law: real WebAssembly.Memory + SharedArrayBuffer. No mocks.
 *
 * Honesty: a product FFB 250k-row ingest path does not exist on disk yet.
 * This court streams SOAK_ROW_COUNT synthetic rows of SOAK_ROW_BYTES through
 * the fixed scratch (circular overwrite) and the ring SAB (publish/drain),
 * which is the closest Chicago-real load that exercises the R-02 arena
 * under 250k-row-equivalent cumulative write pressure.
 *
 * Asserts:
 *   1. Arena stays fixed (`isGrowableMemory === false`; grow throws)
 *   2. Peak ring+scratch byteLength never exceeds 32 MiB ceiling
 *   3. Process completes (vitest EXIT 0 ⇒ no OOM)
 */

import { describe, expect, it } from "vitest";
import {
  allocFixedWorkerArena,
  isGrowableMemory,
  MOBILE_SHARED_MEMORY_CEILING_BYTES,
} from "./fixedSharedMemory.ts";
import { SabRing } from "./sabRing.ts";
import { MAX_PAYLOAD } from "./constants.ts";

/** Risk-named load size from ECOSYSTEM-SPEC-27.1.1 R-02. */
const SOAK_ROW_COUNT = 250_000;

/**
 * Packed synthetic row width. 250_000 × 128 = 32_000_000 bytes of cumulative
 * write traffic (~30.52 MiB) — at the mobile ceiling class that previously
 * OOMed under growable shared Memory.
 */
const SOAK_ROW_BYTES = 128;

describe("R-02 fixed arena 250k-row soak", () => {
  it(
    "streams 250k-row-equivalent pressure under 32 MiB without grow or OOM",
    () => {
      const ringSlotCount = 64;
      const arena = allocFixedWorkerArena({ ringSlotCount });
      expect(arena.ok, arena.ok ? "" : arena.error.message).toBe(true);
      if (!arena.ok) return;

      const { ringSab, scratch, plan } = arena.value;
      expect(plan.totalBytes).toBeLessThanOrEqual(MOBILE_SHARED_MEMORY_CEILING_BYTES);
      expect(plan.totalBytes).toBe(ringSab.byteLength + scratch.byteLength);
      expect(scratch.buffer).toBeInstanceOf(SharedArrayBuffer);
      expect(ringSab).toBeInstanceOf(SharedArrayBuffer);

      // Fixed at construct: grow refused before any load.
      expect(isGrowableMemory(scratch.memory)).toBe(false);
      expect(() => scratch.memory.grow(1)).toThrow(/Maximum memory size exceeded/i);

      const ring = new SabRing(ringSab, { init: true });
      const scratchView = new Uint8Array(scratch.buffer);
      expect(scratchView.byteLength).toBeGreaterThan(SOAK_ROW_BYTES);

      const row = new Uint8Array(SOAK_ROW_BYTES);
      const ringPayload = new Uint8Array(Math.min(SOAK_ROW_BYTES, MAX_PAYLOAD));
      const dest = new Uint8Array(MAX_PAYLOAD);

      let peakArenaBytes = ringSab.byteLength + scratch.memory.buffer.byteLength;
      let rowsWritten = 0;
      let growProbes = 0;

      const samplePeakAndFixedness = () => {
        const now = ringSab.byteLength + scratch.memory.buffer.byteLength;
        if (now > peakArenaBytes) peakArenaBytes = now;
        expect(now).toBeLessThanOrEqual(MOBILE_SHARED_MEMORY_CEILING_BYTES);
        expect(scratch.memory.buffer.byteLength).toBe(scratch.byteLength);
        expect(isGrowableMemory(scratch.memory)).toBe(false);
        expect(() => scratch.memory.grow(1)).toThrow(/Maximum memory size exceeded/i);
        growProbes += 1;
      };

      const wrapSpan = scratchView.byteLength - SOAK_ROW_BYTES;

      for (let i = 0; i < SOAK_ROW_COUNT; i++) {
        row[0] = i & 0xff;
        row[1] = (i >>> 8) & 0xff;
        row[2] = (i >>> 16) & 0xff;
        row[3] = (i >>> 24) & 0xff;
        for (let b = 4; b < SOAK_ROW_BYTES; b++) {
          row[b] = (i + b) & 0xff;
        }

        // Circular write into fixed scratch — must never grow Memory.
        const offset = (i * SOAK_ROW_BYTES) % wrapSpan;
        scratchView.set(row, offset);

        ringPayload.set(row.subarray(0, ringPayload.byteLength));
        let pub = ring.publish(ringPayload, i);
        if (!pub.ok && pub.error.code === "FULL") {
          const drained = ring.read(dest);
          expect(drained.ok, drained.ok ? "" : drained.error.message).toBe(true);
          pub = ring.publish(ringPayload, i);
        }
        expect(pub.ok, pub.ok ? "" : pub.error.message).toBe(true);

        rowsWritten += 1;

        if (i % 50_000 === 0) {
          samplePeakAndFixedness();
        }
      }

      samplePeakAndFixedness();

      expect(rowsWritten).toBe(SOAK_ROW_COUNT);
      expect(peakArenaBytes).toBe(plan.totalBytes);
      expect(peakArenaBytes).toBeLessThanOrEqual(MOBILE_SHARED_MEMORY_CEILING_BYTES);
      expect(growProbes).toBeGreaterThanOrEqual(2);

      // Cumulative pressure metric: 250k × 128 B of scratch writes.
      expect(SOAK_ROW_COUNT * SOAK_ROW_BYTES).toBe(32_000_000);
    },
    120_000,
  );
});
