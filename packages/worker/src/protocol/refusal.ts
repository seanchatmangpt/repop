/**
 * REFUSE payload codec (kind 4): 16 bytes, little-endian.
 *
 *   [0..2)  statusCode u16
 *   [2..4)  reserved   u16 must be 0
 *   [4..12) reasonBits u64 bitfield
 *   [12..16) corrId u32 — echo of the refused request's corrId
 *
 * The echo is gated by Router.accept (BAD_CORRELATION/echo-mismatch).
 */

import type { RouterError } from "./routerError.ts";

export const REFUSE_PAYLOAD_SIZE = 16;

export const Field = {
  STATUS_CODE: 0,
  RESERVED: 2,
  REASON_BITS: 4,
  CORR_ID: 12,
} as const;

/** reasonBits vocabulary (u64 bitfield). UNVERIFIED-vs-P9-plan: pinned by this lane. */
export const RefusalReason = {
  NOT_READY: 1n << 0n,
  UNKNOWN_OBJECT: 1n << 1n,
  BAD_FRAME_CLASS: 1n << 2n,
} as const;

/** Encode a REFUSE payload. Typed refusal on corrId overflow class. */
export function encodeRefusal(
  statusCode: number,
  reasonBits: bigint,
  corrId: number,
): { ok: true; payload: Uint8Array } | { ok: false; error: RouterError } {
  if (statusCode < 0 || statusCode > 0xffff) {
    return {
      ok: false,
      error: {
        code: "BAD_LENGTH",
        field: "payloadLen",
        expected: 0xffff,
        got: statusCode,
      },
    };
  }
  const p = new Uint8Array(REFUSE_PAYLOAD_SIZE);
  const dv = new DataView(p.buffer);
  dv.setUint16(Field.STATUS_CODE, statusCode, true);
  dv.setUint16(Field.RESERVED, 0, true);
  dv.setBigUint64(Field.REASON_BITS, reasonBits, true);
  dv.setUint32(Field.CORR_ID, corrId >>> 0, true);
  return { ok: true, payload: p };
}

/** Decode a REFUSE payload (already length-gated by the frame codec). */
export function decodeRefusal(
  payload: Uint8Array,
): { ok: true; refusal: DecodedRefusal } | { ok: false; error: RouterError } {
  if (payload.byteLength !== REFUSE_PAYLOAD_SIZE) {
    return {
      ok: false,
      error: {
        code: "BAD_LENGTH",
        field: "totalBytes",
        expected: REFUSE_PAYLOAD_SIZE,
        got: payload.byteLength,
      },
    };
  }
  const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const reserved = dv.getUint16(Field.RESERVED, true);
  if (reserved !== 0) {
    return {
      ok: false,
      error: { code: "BAD_RESERVED", field: "reserved1", got: reserved },
    };
  }
  return {
    ok: true,
    refusal: {
      statusCode: dv.getUint16(Field.STATUS_CODE, true),
      reasonBits: dv.getBigUint64(Field.REASON_BITS, true),
      corrId: dv.getUint32(Field.CORR_ID, true),
    },
  };
}

export interface DecodedRefusal {
  readonly statusCode: number;
  readonly reasonBits: bigint;
  readonly corrId: number;
}
