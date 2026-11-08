/**
 * WIR0 pure slot codec: header stamping, validation, payload extraction.
 * No I/O, no atomics — pure functions over byte arrays so every refusal
 * path is court-testable without a SharedArrayBuffer.
 */

import { crc32 } from "./crc32.ts";
import { HEADER_SIZE, MAX_PAYLOAD, SLOT_SIZE, WIRE_MAGIC } from "./constants.ts";
import { err, ok, type RingResult } from "./errors.ts";

/**
 * Stamp a WIR0 frame into `slot`: 16B BE header (magic, payload length,
 * CRC32 over payload, ordinal) followed by the payload bytes.
 */
export function stampHeader(
  slot: Uint8Array,
  payload: Uint8Array,
  ordinal: number,
): RingResult<number> {
  if (slot.byteLength < SLOT_SIZE) {
    return err("BAD_STATE", `slot buffer smaller than SLOT_SIZE (${slot.byteLength})`);
  }
  if (payload.byteLength > MAX_PAYLOAD) {
    return err("OVERSIZE", `payload ${payload.byteLength} exceeds MAX_PAYLOAD ${MAX_PAYLOAD}`, payload.byteLength, MAX_PAYLOAD);
  }
  const view = new DataView(slot.buffer, slot.byteOffset, slot.byteLength);
  const crc = crc32(payload);
  view.setUint32(0, WIRE_MAGIC, false);
  view.setUint32(4, payload.byteLength, false);
  view.setUint32(8, crc, false);
  view.setUint32(12, ordinal >>> 0, false);
  slot.set(payload, HEADER_SIZE);
  return ok(HEADER_SIZE + payload.byteLength);
}

/**
 * Validate the WIR0 header of `slot` against the expected ordinal and
 * return the payload length. Typed refusal on any mismatch.
 */
export function validateHeader(
  slot: Uint8Array,
  expectedOrdinal: number,
): RingResult<number> {
  if (slot.byteLength < SLOT_SIZE) {
    return err("BAD_STATE", `slot buffer smaller than SLOT_SIZE (${slot.byteLength})`);
  }
  const view = new DataView(slot.buffer, slot.byteOffset, slot.byteLength);
  const magic = view.getUint32(0, false);
  if (magic !== WIRE_MAGIC) {
    return err("BAD_MAGIC", `magic mismatch`, magic, WIRE_MAGIC);
  }
  const payloadLen = view.getUint32(4, false);
  if (payloadLen > MAX_PAYLOAD) {
    return err("OVERSIZE", `header payload length ${payloadLen} exceeds MAX_PAYLOAD ${MAX_PAYLOAD}`, payloadLen, MAX_PAYLOAD);
  }
  const crc = view.getUint32(8, false);
  const actual = crc32(slot, HEADER_SIZE, HEADER_SIZE + payloadLen);
  if (actual !== crc) {
    return err("BAD_CRC", `crc mismatch`, actual, crc);
  }
  const ordinal = view.getUint32(12, false);
  if (ordinal !== (expectedOrdinal >>> 0)) {
    return err("BAD_ORDINAL", `ordinal mismatch`, ordinal, expectedOrdinal >>> 0);
  }
  return ok(payloadLen);
}

/**
 * Validate `slot` and copy its payload into `dest`. Returns the number of
 * payload bytes copied. Typed refusal on any validation failure; `dest`
 * is never written on refusal.
 */
export function readFrameInto(
  dest: Uint8Array,
  slot: Uint8Array,
  expectedOrdinal: number,
): RingResult<number> {
  const len = validateHeader(slot, expectedOrdinal);
  if (!len.ok) return len;
  if (dest.byteLength < len.value) {
    return err("OVERSIZE", `dest ${dest.byteLength} smaller than payload ${len.value}`, dest.byteLength, len.value);
  }
  dest.set(slot.subarray(HEADER_SIZE, HEADER_SIZE + len.value));
  return ok(len.value);
}
