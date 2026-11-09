/**
 * Router: stateful frame router over the pure codec.
 *
 * Owns the two stateful gates in the pinned order after the codec's
 * seven pure gates:
 *   gate 8 (seq):      per-writer wrap-safe monotonic law (SeqTracker)
 *   gate 9 (corrId):   CorrelationTable membership / REFUSE echo law
 * then dispatches to the registered per-kind handler.
 *
 * A frame refused by any gate never reaches a handler, and handlers of
 * other kinds never observe it.
 */

import type { FrameKind } from "./frameKind.ts";
import { decodeFrame, encodeFrame } from "./frame.ts";
import { CorrelationTable } from "./correlation.ts";
import { SeqTracker } from "./seq.ts";
import { err, type DecodedFrame, type RouterError, type RouterOutcome } from "./routerError.ts";

export type FrameHandler = (frame: DecodedFrame) => void;

export interface RouterIo {
  /** Write a frame to the peer. Payload width is checked by the codec. */
  send: (frame: Uint8Array) => void;
}

export class Router {
  readonly #handlers = new Map<FrameKind, FrameHandler>();
  readonly #seq = new SeqTracker();
  readonly #corr = new CorrelationTable();
  readonly #io: RouterIo;
  #nextSeq = 0;
  #nextCorrId = 1;

  constructor(io: RouterIo) {
    this.#io = io;
  }

  /* ---------- writer side ---------- */

  /** Current writer seq (monotonic; last value handed to encodeFrame). */
  get seq(): number {
    return this.#nextSeq;
  }

  /** Register a fresh corrId; returns it. Ids are never reused. */
  mintCorrId(): number {
    const id = this.#nextCorrId++;
    this.#corr.open(id);
    return id;
  }

  /** Retire a corrId explicitly (cancel path). */
  cancelCorrId(corrId: number): void {
    this.#corr.close(corrId);
  }

  /**
   * Encode + send one frame. Payload width is checked (typed refusal).
   * Writer-side seq advances only on successful encode.
   */
  send(
    kind: FrameKind,
    payload: Uint8Array,
    corrId: number,
  ): { ok: true; seq: number } | { ok: false; error: RouterError } {
    const res = encodeFrame(kind, this.#nextSeq, corrId, payload);
    if (!res.ok) return res;
    const used = this.#nextSeq;
    this.#nextSeq = (this.#nextSeq + 1) >>> 0;
    this.#io.send(res.frame);
    return { ok: true, seq: used };
  }

  /* ---------- reader side ---------- */

  /** Register (or replace) the handler for one kind. */
  on(kind: FrameKind, handler: FrameHandler): void {
    this.#handlers.set(kind, handler);
  }

  /**
   * Feed one wire buffer through the full gate order. First failing
   * gate's typed refusal is returned; on success the per-kind handler
   * runs and the outcome is `ok`.
   */
  accept(bytes: Uint8Array): RouterOutcome {
    const pure = decodeFrame(bytes);
    if (!pure.ok) return pure;

    const frame = pure.frame;

    // gate 8: wrap-safe monotonic seq
    if (!this.#seq.observe(frame.seq)) {
      return err({
        code: "BAD_SEQ",
        last: this.#seq.last ?? 0,
        got: frame.seq,
      });
    }

    // gate 9: correlation
    if (!this.#corr.mayBypass(frame.kind, frame.corrId) && !this.#corr.has(frame.corrId)) {
      return err({
        code: "BAD_CORRELATION",
        corrId: frame.corrId,
        why: "unknown",
      });
    }

    // REFUSE payload echo law: payload corrId must equal header corrId
    if (frame.kind === 4 /* REFUSE */) {
      const echo = new DataView(
        frame.payload.buffer,
        frame.payload.byteOffset,
        frame.payload.byteLength,
      ).getUint32(12, true);
      if (echo !== frame.corrId) {
        return err({
          code: "BAD_CORRELATION",
          corrId: frame.corrId,
          why: "echo-mismatch",
        });
      }
    }

    const handler = this.#handlers.get(frame.kind);
    if (handler) handler(frame);

    return { ok: true, frame };
  }
}
