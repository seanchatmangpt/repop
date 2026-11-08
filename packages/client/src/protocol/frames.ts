// UNVERIFIED-vs-C9: P9 (worker message protocol) had NOT landed when this file
// was written (packages/worker absent from the checkout at construct time).
// The union + binary layout below is the local provisional contract. When C9
// lands packages/worker/src/protocol, replace this file with a thin adapter
// re-exporting C9's types; the court in kernel-ready.test.ts pins the layout
// constants so a C9 divergence fails loudly, not silently.
//
// Zero-JSON law: all frames are fixed-width binary, big-endian.

export const FRAME_KIND = {
  /** Worker announces the cgap kernel is instantiated and ready. */
  KernelReady: 0x01,
  /** Settles a correlated request with an entity record + 64B UnsealedReceipt. */
  Receipt: 0x02,
  /** Typed refusal for a correlated request. */
  Refusal: 0x03,
  /** Unsolicited invariant breach reported by the worker. */
  Breach: 0x04,
} as const;

export type FrameKind = (typeof FRAME_KIND)[keyof typeof FRAME_KIND];

export const RECEIPT_BYTES = 64; // UnsealedReceipt tier (wave-1 R3)
export const CORR_ID_BYTES = 4;
export const LENGTH_BYTES = 4;
export const KIND_BYTES = 1;
export const HEADER_BYTES = KIND_BYTES + CORR_ID_BYTES + LENGTH_BYTES; // 9

export interface KernelReadyFrame {
  readonly kind: typeof FRAME_KIND.KernelReady;
  readonly corrId: number;
}

export interface ReceiptFrame {
  readonly kind: typeof FRAME_KIND.Receipt;
  readonly corrId: number;
  readonly entityKey: string;
  /** Monotonic entity version carried on the wire. */
  readonly version: number;
  /** 64B UnsealedReceipt summary (R3 receipt tiering). */
  readonly receipt: Uint8Array;
}

export interface RefusalFrame {
  readonly kind: typeof FRAME_KIND.Refusal;
  readonly corrId: number;
  readonly code: number;
  readonly message: string;
}

export interface BreachFrame {
  readonly kind: typeof FRAME_KIND.Breach;
  readonly corrId: number;
  readonly code: number;
  readonly message: string;
}

export type WireFrame =
  | KernelReadyFrame
  | ReceiptFrame
  | RefusalFrame
  | BreachFrame;

export const REFUSAL_CODE = {
  StaleVersion: 0x01,
  UnknownEntity: 0x02,
  WorkerBusy: 0x03,
} as const;

// ---------------------------------------------------------------------------
// Encode
// ---------------------------------------------------------------------------

function textEncoder(): TextEncoder {
  // Module-level encoder would be fine; per-call keeps this file side-effect-free.
  return new TextEncoder();
}

/** Encode a frame into the fixed-width binary layout. Header + payload. */
export function encodeFrame(frame: WireFrame): Uint8Array {
  const enc = textEncoder();
  switch (frame.kind) {
    case FRAME_KIND.KernelReady: {
      const out = new Uint8Array(HEADER_BYTES);
      writeHeader(out, frame.kind, frame.corrId, 0);
      return out;
    }
    case FRAME_KIND.Receipt: {
      const keyBytes = enc.encode(frame.entityKey);
      if (keyBytes.length > 0xffff) {
        throw new RangeError('entityKey too long for u16 length prefix');
      }
      const payloadLen = 2 + keyBytes.length + LENGTH_BYTES + RECEIPT_BYTES;
      const out = new Uint8Array(HEADER_BYTES + payloadLen);
      writeHeader(out, frame.kind, frame.corrId, payloadLen);
      const dv = new DataView(out.buffer);
      dv.setUint16(HEADER_BYTES, keyBytes.length, false);
      out.set(keyBytes, HEADER_BYTES + 2);
      dv.setUint32(HEADER_BYTES + 2 + keyBytes.length, frame.version >>> 0, false);
      if (frame.receipt.length !== RECEIPT_BYTES) {
        throw new RangeError(`receipt must be exactly ${RECEIPT_BYTES} bytes`);
      }
      out.set(frame.receipt, HEADER_BYTES + 2 + keyBytes.length + LENGTH_BYTES);
      return out;
    }
    case FRAME_KIND.Refusal:
    case FRAME_KIND.Breach: {
      const msgBytes = enc.encode(frame.message);
      if (msgBytes.length > 0xffff) {
        throw new RangeError('message too long for u16 length prefix');
      }
      const payloadLen = KIND_BYTES + 2 + msgBytes.length;
      const out = new Uint8Array(HEADER_BYTES + payloadLen);
      writeHeader(out, frame.kind, frame.corrId, payloadLen);
      const dv = new DataView(out.buffer);
      dv.setUint8(HEADER_BYTES, frame.code);
      dv.setUint16(HEADER_BYTES + 1, msgBytes.length, false);
      out.set(msgBytes, HEADER_BYTES + 3);
      return out;
    }
  }
}

function writeHeader(out: Uint8Array, kind: number, corrId: number, payloadLen: number): void {
  const dv = new DataView(out.buffer);
  dv.setUint8(0, kind);
  dv.setUint32(1, corrId >>> 0, false);
  dv.setUint32(5, payloadLen, false);
}
