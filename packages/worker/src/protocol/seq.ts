/**
 * Wrap-safe u32 sequence law (P9 dispatch: "writer-owned monotonic,
 * wrap-safe").
 *
 * seq is owned by the frame writer; the reader never assigns or rewrites
 * it. The reader's only law: seq must be wrap-safe-strictly-greater than
 * the last observed value in the same stream.
 *
 * wrapSafeLt(a, b): b is *after* a on the u32 ring when the modular
 * forward distance (b - a) mod 2^32 is in [1, 2^31). Distance 0 (replay)
 * and distance >= 2^31 (far-past under reordering) both refuse.
 */

export const SEQ_MODULUS = 0x1_0000_0000;
const SEQ_HALF = 0x8000_0000;

/** True iff `b` is strictly after `a` on the u32 ring (distance in [1, 2^31)). */
export function wrapSafeLt(a: number, b: number): boolean {
  const d = toU32(b - a);
  return d >= 1 && d < SEQ_HALF;
}

/** True iff a === b on the u32 ring (replay class). */
export function isReplay(a: number, b: number): boolean {
  return a === b;
}

/** ToUint32 of any finite number. */
export function toU32(v: number): number {
  return v >>> 0;
}

/** Next seq in the stream: +1 mod 2^32 (writer side). */
export function seqNext(current: number): number {
  return (current + 1) >>> 0;
}

/**
 * Reader-side tracker: one per stream (writer direction). Accepts the
 * first observation unconditionally, then only wrap-safe-strictly-greater.
 */
export class SeqTracker {
  #last: number | undefined;

  get last(): number | undefined {
    return this.#last;
  }

  /** Observe a seq; true when lawful (strictly after last, wrap-safe). */
  observe(seq: number): boolean {
    if (this.#last === undefined || wrapSafeLt(this.#last, seq)) {
      this.#last = seq;
      return true;
    }
    return false;
  }
}
