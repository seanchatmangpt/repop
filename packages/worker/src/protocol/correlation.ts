/**
 * CorrelationTable: outstanding corrId registry for the frame router.
 *
 * corrIds are minted by the request side, registered before the first
 * frame carrying them is sent, and retired when the exchange completes
 * (terminal INTENT_RESOLVED / REFUSE, or explicit cancel). An incoming
 * frame whose corrId is not outstanding refuses BAD_CORRELATION-unknown,
 * except the single unsolicited kind (KERNEL_READY with corrId 0), which
 * is the boot event and bypasses the table (dispatch contract; KERNEL_
 * READY bypass pinned by this lane — UNVERIFIED-vs-P9-plan).
 */

import type { FrameKind } from "./frameKind.ts";

/** Aligned with frameKind.ts KERNEL_READY (value import would cycle). */
const KERNEL_READY = 2;

/** Outstanding corrIds. */
export class CorrelationTable {
  #outstanding = new Map<number, "open" | "resolving">();

  /** Register a corrId before sending the request. */
  open(corrId: number): void {
    this.#outstanding.set(corrId >>> 0, "open");
  }

  /** Promote an open correlation to resolving (request written). */
  beginResolve(corrId: number): void {
    const cur = this.#outstanding.get(corrId >>> 0);
    if (cur === "open") this.#outstanding.set(corrId >>> 0, "resolving");
  }

  /** True iff corrId is currently outstanding. */
  has(corrId: number): boolean {
    return this.#outstanding.has(corrId >>> 0);
  }

  /** Retire a corrId (terminal frame observed or cancel). */
  close(corrId: number): void {
    this.#outstanding.delete(corrId >>> 0);
  }

  /** Outstanding count. */
  get size(): number {
    return this.#outstanding.size;
  }

  /** True iff kind may lawfully bypass the table with corrId 0. */
  mayBypass(kind: FrameKind, corrId: number): boolean {
    return kind === KERNEL_READY && corrId === 0;
  }
}
