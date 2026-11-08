import { describe, expect, it } from "vitest";
import { MAX_PAYLOAD, SLOT_SIZE, WIRE_MAGIC } from "./constants.ts";
import { crc32 } from "./crc32.ts";
import { stampHeader, validateHeader, readFrameInto } from "./wireRing.ts";

const enc = new TextEncoder();

describe("stampHeader", () => {
  it("stamps magic/len/crc/ordinal BE and copies payload", () => {
    const slot = new Uint8Array(SLOT_SIZE);
    const payload = enc.encode("hello wir0");
    const r = stampHeader(slot, payload, 7);
    expect(r.ok).toBe(true);
    const v = new DataView(slot.buffer);
    expect(v.getUint32(0, false)).toBe(WIRE_MAGIC);
    expect(v.getUint32(4, false)).toBe(payload.byteLength);
    expect(v.getUint32(8, false)).toBe(crc32(payload));
    expect(v.getUint32(12, false)).toBe(7);
  });

  it("refuses oversize payload (typed OVERSIZE)", () => {
    const slot = new Uint8Array(SLOT_SIZE);
    const r = stampHeader(slot, new Uint8Array(MAX_PAYLOAD + 1), 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("OVERSIZE");
  });

  it("refuses undersized slot buffer (BAD_STATE)", () => {
    const r = stampHeader(new Uint8Array(32), new Uint8Array(4), 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("BAD_STATE");
  });
});

describe("validateHeader refusal paths", () => {
  function frameOf(payload: Uint8Array, ordinal: number): Uint8Array {
    const slot = new Uint8Array(SLOT_SIZE);
    const r = stampHeader(slot, payload, ordinal);
    if (!r.ok) throw new Error("fixture failed");
    return slot;
  }

  it("accepts a well-formed frame", () => {
    const slot = frameOf(enc.encode("ok"), 3);
    const r = validateHeader(slot, 3);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(2);
  });

  it("refuses flipped magic (BAD_MAGIC)", () => {
    const slot = frameOf(enc.encode("x"), 0);
    const v = new DataView(slot.buffer);
    v.setUint32(0, WIRE_MAGIC ^ 1, false);
    const r = validateHeader(slot, 0);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("BAD_MAGIC");
      expect(r.error.observed).toBe(WIRE_MAGIC ^ 1);
    }
  });

  it("refuses dropped/wrong CRC (BAD_CRC)", () => {
    const slot = frameOf(enc.encode("x"), 0);
    const v = new DataView(slot.buffer);
    v.setUint32(8, (v.getUint32(8, false) ^ 0xffff_ffff) >>> 0);
    const r = validateHeader(slot, 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("BAD_CRC");
  });

  it("refuses off-by-one ordinal (BAD_ORDINAL)", () => {
    const slot = frameOf(enc.encode("x"), 5);
    const r = validateHeader(slot, 6);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("BAD_ORDINAL");
      expect(r.error.observed).toBe(5);
      expect(r.error.expected).toBe(6);
    }
  });

  it("refuses header len beyond MAX_PAYLOAD (OVERSIZE)", () => {
    const slot = frameOf(enc.encode("x"), 0);
    const v = new DataView(slot.buffer);
    v.setUint32(4, MAX_PAYLOAD + 1, false);
    const r = validateHeader(slot, 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("OVERSIZE");
  });
});

describe("readFrameInto", () => {
  it("copies payload and returns its length", () => {
    const slot = new Uint8Array(SLOT_SIZE);
    const payload = enc.encode("round trip");
    stampHeader(slot, payload, 1);
    const dest = new Uint8Array(MAX_PAYLOAD);
    const r = readFrameInto(dest, slot, 1);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toBe(payload.byteLength);
      expect(dest.subarray(0, r.value)).toEqual(payload);
    }
  });

  it("never writes dest on refusal", () => {
    const slot = new Uint8Array(SLOT_SIZE);
    stampHeader(slot, enc.encode("secret"), 1);
    const dest = new Uint8Array(MAX_PAYLOAD);
    const v = new DataView(slot.buffer);
    v.setUint32(12, 99, false); // ordinal mismatch
    const r = readFrameInto(dest, slot, 1);
    expect(r.ok).toBe(false);
    expect(dest.every((b) => b === 0)).toBe(true);
  });
});
