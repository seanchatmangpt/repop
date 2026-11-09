/**
 * IPC1-style MetaHeader envelope — 64B, mirroring the vendored cgap-arrow
 * framing contract (wave-1 R2/E2/E19; landed P20 plan).
 *
 * Layout (all u32 LE):
 *   [0x00..0x04) magic 0x49504331 ("IPC1")
 *   [0x04..0x08) payload (body) length in bytes
 *   [0x08..0x0C) sequence ordinal (wrap-safe monotonic)
 *   [0x0C..0x3C) reserved, must be zero
 *   [0x3C..0x40) FNV-1a32 seal over [0x00, 0x3C)
 *
 * Tamper tier (FNV seal) vs transport tier (ring CRC32) are never conflated:
 * the seal lives here, CRC stays in the ring slot header.
 */

import { fnv1a32, FRAME_SIZE } from "@repop/abi";

/** Magic word 0x49504331 = "IPC1" (ASCII LE). */
export const IPC1_MAGIC = 0x4950_4331;

/** Seal offset: FNV-1a32 over [0x00, SEAL_OFFSET) stored at SEAL_OFFSET. */
export const SEAL_OFFSET = 0x3c;

/** Sequence modulus for the wrap-safe ordinal space. */
export const SEQ_MODULUS = 0x1_0000_0000;

/** Reserved region size in bytes. */
export const META_RESERVED_BYTES = SEAL_OFFSET - 12;

/** Encode a 64B MetaHeader with `bodyLength` payload bytes. */
export function encodeMetaHeader(
  bodyLength: number,
  seq: number,
): Uint8Array {
  const buf = new Uint8Array(FRAME_SIZE);
  const dv = new DataView(buf.buffer);
  dv.setUint32(0x00, IPC1_MAGIC, true);
  dv.setUint32(0x04, bodyLength, true);
  dv.setUint32(0x08, seq >>> 0, true);
  // [0x0C..0x3C) reserved stays zero.
  dv.setUint32(SEAL_OFFSET, fnv1a32(buf.subarray(0, SEAL_OFFSET)), true);
  return buf;
}

/** Encode one envelope: 64B MetaHeader + body, single contiguous buffer. */
export function encodeEnvelope(
  body: Uint8Array,
  seq: number,
): UplinkResult<Uint8Array> {
  if (body.byteLength > 0xffff_ffff) {
    return { ok: false, error: { code: "BUFFER_TOO_SHORT", message: "body length exceeds u32", observed: body.byteLength } };
  }
  const buf = new Uint8Array(FRAME_SIZE + body.byteLength);
  buf.set(encodeMetaHeader(body.byteLength, seq), 0);
  buf.set(body, FRAME_SIZE);
  return upOk(buf);
}

export type UplinkErrorCode =
  | "BAD_MAGIC"
  | "BAD_SEAL"
  | "BAD_SEQ"
  | "BAD_BODY_LENGTH"
  | "BUFFER_TOO_SHORT"
  | "NONZERO_RESERVED"
  | "ZERO_PROGRESS";

export interface UplinkError {
  readonly code: UplinkErrorCode;
  readonly message: string;
  readonly observed?: number;
  readonly expected?: number;
}

export type UplinkResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: UplinkError };

function up(
  code: UplinkErrorCode,
  message: string,
  observed?: number,
  expected?: number,
): UplinkResult<never> {
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

/** Decode + verify a MetaHeader from `buf` at offset 0. */
export function decodeMetaHeader(
  buf: Uint8Array,
  expectSeq: number,
): UplinkResult<number> {
  if (buf.byteLength < FRAME_SIZE) {
    return up("BUFFER_TOO_SHORT", "envelope shorter than 64B header", buf.byteLength, FRAME_SIZE);
  }
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const magic = dv.getUint32(0x00, true);
  if (magic !== IPC1_MAGIC) {
    return up("BAD_MAGIC", "bad IPC1 magic", magic, IPC1_MAGIC);
  }
  const seal = dv.getUint32(SEAL_OFFSET, true);
  const recomputed = fnv1a32(buf.subarray(0, SEAL_OFFSET));
  if (seal !== recomputed) {
    return up("BAD_SEAL", "meta seal mismatch", recomputed, seal);
  }
  for (let i = 0x0c; i < SEAL_OFFSET; i++) {
    if (buf[i] !== 0) {
      return up("NONZERO_RESERVED", "reserved byte non-zero", i);
    }
  }
  const seq = dv.getUint32(0x08, true);
  if (!seqOk(expectSeq, seq)) {
    return up("BAD_SEQ", "sequence replay or skip", seq, expectSeq);
  }
  const bodyLength = dv.getUint32(0x04, true);
  if (buf.byteLength < FRAME_SIZE + bodyLength) {
    return up("BAD_BODY_LENGTH", "body truncated", buf.byteLength - FRAME_SIZE, bodyLength);
  }
  return upOk(bodyLength);
}

/** Uplink-flavored ok wrapper (OcelResult value shape, UplinkResult error). */
function upOk<T>(value: T): UplinkResult<T> {
  return { ok: true, value };
}

/**
 * Wrap-safe sequence law: `seq` is accepted iff it is the expected next
 * ordinal under u32 wraparound — replays (seq < expect in the non-wrapped
 * window) and skips (> 1 forward) are refused.
 */
export function seqOk(expectSeq: number, seq: number): boolean {
  // Wrap-safe: the expected counter is reduced modulo the u32 ordinal
  // space, so 0xFFFFFFFF -> 0 is the lawful next step, while replays
  // (any earlier ordinal) and skips (> 1 forward) compare unequal.
  return seq >>> 0 === expectSeq % SEQ_MODULUS;
}

export type { OcelError as UplinkOcelError } from "../ocel/errors.ts";
