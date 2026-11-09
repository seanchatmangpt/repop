/**
 * Frame codec: 32-byte router header + per-kind payload, zero-JSON,
 * little-endian, FNV-1a32 digest over [0x00, 0x1C).
 *
 * Header layout (P9 dispatch, pinned):
 *   [0..4)   magic   u32  0x46395052 ("RP9F")
 *   [4..6)   version u16  1
 *   [6]      kind    u8
 *   [7]      flags   u8   must be 0
 *   [8..12)  seq     u32  writer-owned monotonic, wrap-safe
 *   [12..16) corrId  u32
 *   [16..20) payloadLen u32
 *   [20..24) reserved0 u32 must be 0
 *   [24..28) reserved1 u32 must be 0
 *   [28..32) digest  u32  FNV-1a32 over bytes [0x00, 0x1C)
 *
 * Digest attribution: FNV-1a32 is @repop/abi's fnv1a32 (identical pinned
 * constants 2166136261 / 16777619); imported, not reimplemented — one
 * implementation per calculus (drift law).
 */

import { fnv1a32 } from "@repop/abi";
import { isFrameKind, PAYLOAD_WIDTH, type FrameKind } from "./frameKind.ts";
import {
  err,
  ok,
  type RouterError,
  type RouterOutcome,
} from "./routerError.ts";

/** Router-frame magic 0x46395052 ("RP9F" little-endian). */
export const MAGIC = 0x4639_5052;
/** Protocol version pinned at 1. */
export const VERSION = 1;
/** Header size in bytes. */
export const HEADER_SIZE = 32;
/** Digest coverage span: bytes [0x00, 0x1C). */
export const DIGEST_SPAN = 0x1c;
/** Digest field offset. */
export const DIGEST_OFFSET = 0x1c;

/** Field offsets into the 32B header. */
export const Field = {
  MAGIC: 0,
  VERSION: 4,
  KIND: 6,
  FLAGS: 7,
  SEQ: 8,
  CORR_ID: 12,
  PAYLOAD_LEN: 16,
  RESERVED0: 20,
  RESERVED1: 24,
  DIGEST: 28,
} as const;

/** True when `bytes` can even hold a router header. */
export function isFrameShaped(bytes: Uint8Array): boolean {
  return bytes.byteLength >= HEADER_SIZE;
}

/**
 * Encode a frame. payload width MUST equal PAYLOAD_WIDTH[kind] (checked,
 * typed refusal on mismatch). seq/corrId are supplied by the caller
 * (writer owns seq; the router's correlation table mints corrIds).
 */
export function encodeFrame(
  kind: FrameKind,
  seq: number,
  corrId: number,
  payload: Uint8Array = new Uint8Array(0),
): { ok: true; frame: Uint8Array } | { ok: false; error: RouterError } {
  const expected = PAYLOAD_WIDTH[kind];
  if (payload.byteLength !== expected) {
    return {
      ok: false,
      error: {
        code: "BAD_LENGTH",
        field: "payloadLen",
        expected,
        got: payload.byteLength,
      },
    };
  }
  const frame = new Uint8Array(HEADER_SIZE + expected);
  const dv = new DataView(frame.buffer);
  dv.setUint32(Field.MAGIC, MAGIC, true);
  dv.setUint16(Field.VERSION, VERSION, true);
  dv.setUint8(Field.KIND, kind);
  dv.setUint8(Field.FLAGS, 0);
  dv.setUint32(Field.SEQ, seq >>> 0, true);
  dv.setUint32(Field.CORR_ID, corrId >>> 0, true);
  dv.setUint32(Field.PAYLOAD_LEN, expected, true);
  dv.setUint32(Field.RESERVED0, 0, true);
  dv.setUint32(Field.RESERVED1, 0, true);
  const digest = fnv1a32(frame.subarray(0, DIGEST_SPAN));
  dv.setUint32(Field.DIGEST, digest, true);
  frame.set(payload, HEADER_SIZE);
  return { ok: true, frame };
}

/**
 * Decode + gate a frame in the pinned gate order:
 * magic -> version -> flags -> reserved -> digest -> kind -> len.
 * (seq and corrId gates are stateful; the Router owns those two.)
 * Pure: no tracker state, no table lookups.
 */
export function decodeFrame(bytes: Uint8Array): RouterOutcome {
  if (bytes.byteLength < HEADER_SIZE) {
    return err({
      code: "BAD_LENGTH",
      field: "totalBytes",
      expected: HEADER_SIZE,
      got: bytes.byteLength,
    });
  }
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // gate 1: magic
  const magic = dv.getUint32(Field.MAGIC, true);
  if (magic !== MAGIC) return err({ code: "BAD_MAGIC", got: magic });

  // gate 2: version
  const version = dv.getUint16(Field.VERSION, true);
  if (version !== VERSION) return err({ code: "BAD_VERSION", got: version });

  // gate 3: flags
  const flags = dv.getUint8(Field.FLAGS);
  if (flags !== 0) return err({ code: "BAD_FLAGS", got: flags });

  // gate 4: reserved0 / reserved1
  const r0 = dv.getUint32(Field.RESERVED0, true);
  if (r0 !== 0) return err({ code: "BAD_RESERVED", field: "reserved0", got: u32(r0) });
  const r1 = dv.getUint32(Field.RESERVED1, true);
  if (r1 !== 0) return err({ code: "BAD_RESERVED", field: "reserved1", got: u32(r1) });

  // gate 5: digest over [0x00, 0x1C)
  const stored = dv.getUint32(Field.DIGEST, true);
  const computed = fnv1a32(bytes.subarray(0, DIGEST_SPAN));
  if (stored !== computed) {
    return err({ code: "BAD_DIGEST", computed, stored, span: DIGEST_SPAN });
  }

  // gate 6: kind
  const kindByte = dv.getUint8(Field.KIND);
  if (!isFrameKind(kindByte)) return err({ code: "BAD_KIND", got: kindByte });

  // gate 7: payload length law (per-kind width + total length)
  const payloadLen = dv.getUint32(Field.PAYLOAD_LEN, true);
  const expected = PAYLOAD_WIDTH[kindByte];
  if (payloadLen !== expected) {
    return err({
      code: "BAD_LENGTH",
      field: "payloadLen",
      expected,
      got: payloadLen,
    });
  }
  if (bytes.byteLength !== HEADER_SIZE + expected) {
    return err({
      code: "BAD_LENGTH",
      field: "totalBytes",
      expected: HEADER_SIZE + expected,
      got: bytes.byteLength,
    });
  }

  return ok({
    kind: kindByte,
    version,
    seq: dv.getUint32(Field.SEQ, true),
    corrId: dv.getUint32(Field.CORR_ID, true),
    payload: bytes.subarray(HEADER_SIZE),
  });
}

function u32(v: number): number {
  return v >>> 0;
}
