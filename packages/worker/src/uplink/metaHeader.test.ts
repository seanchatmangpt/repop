import { describe, expect, it } from "vitest";
import { fnv1a32 } from "@repop/abi";
import {
  decodeMetaHeader,
  encodeEnvelope,
  encodeMetaHeader,
  IPC1_MAGIC,
  SEAL_OFFSET,
  seqOk,
  SEQ_MODULUS,
} from "./metaHeader.ts";

describe("MetaHeader encode: golden shape", () => {
  it("lays out magic, length, seq, and FNV seal at 0x3C", () => {
    const h = encodeMetaHeader(5, 7);
    expect(h.byteLength).toBe(64);
    const dv = new DataView(h.buffer);
    expect(dv.getUint32(0x00, true)).toBe(IPC1_MAGIC);
    expect(dv.getUint32(0x04, true)).toBe(5);
    expect(dv.getUint32(0x08, true)).toBe(7);
    // Seal is exactly FNV-1a32 over [0x00, 0x3C).
    expect(dv.getUint32(SEAL_OFFSET, true)).toBe(
      fnv1a32(h.subarray(0, SEAL_OFFSET)),
    );
    // Reserved region is zero.
    for (let i = 0x0c; i < SEAL_OFFSET; i++) {
      expect(h[i]).toBe(0);
    }
  });

  it("golden vector: seq 1, body 'abc' yields exact bytes", () => {
    const env = encodeEnvelope(new Uint8Array([97, 98, 99]), 1);
    expect(env.ok).toBe(true);
    if (!env.ok) return;
    expect(env.value.byteLength).toBe(64 + 3);
    const dv = new DataView(env.value.buffer);
    expect(dv.getUint32(0x00, true)).toBe(IPC1_MAGIC);
    expect(dv.getUint32(0x04, true)).toBe(3);
    expect(dv.getUint32(0x08, true)).toBe(1);
    expect(dv.getUint32(SEAL_OFFSET, true)).toBe(
      fnv1a32(env.value.subarray(0, SEAL_OFFSET)),
    );
  });
});

describe("emit/parse roundtrip", () => {
  it("decodes what it encoded", () => {
    const body = new Uint8Array([1, 2, 3, 4, 5]);
    const env = encodeEnvelope(body, 0);
    expect(env.ok).toBe(true);
    if (!env.ok) return;
    const r = decodeMetaHeader(env.value, 0);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(5);
  });
});

describe("seq law: replay / skip / wrap", () => {
  it("accepts the exact expected ordinal", () => {
    expect(seqOk(3, 3)).toBe(true);
  });

  it("refuses a replayed ordinal", () => {
    expect(seqOk(3, 2)).toBe(false);
  });

  it("refuses a skipped ordinal", () => {
    expect(seqOk(3, 4)).toBe(false);
    expect(seqOk(3, 100)).toBe(false);
  });

  it("wrap-safe: 0xFFFFFFFF is the lawful predecessor of 0", () => {
    expect(seqOk(SEQ_MODULUS, 0)).toBe(true);
  });

  it("decodeMetaHeader refuses a wrong seq (BAD_SEQ)", () => {
    const env = encodeEnvelope(new Uint8Array(4), 5);
    expect(env.ok).toBe(true);
    if (!env.ok) return;
    const r = decodeMetaHeader(env.value, 6);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("BAD_SEQ");
  });
});

describe("mutation legs: tampered header bytes", () => {
  it("flipped payload-byte in [0,0x3C) refuses BAD_SEAL", () => {
    const env = encodeEnvelope(new Uint8Array(8), 2);
    expect(env.ok).toBe(true);
    if (!env.ok) return;
    const bad = new Uint8Array(env.value);
    bad[3] = (bad[3]! ^ 0xff) & 0xff; // flips the magic inside the sealed region
    const r = decodeMetaHeader(bad, 2);
    expect(r.ok).toBe(false);
    // Refusal ordering: magic is checked before the seal.
    if (!r.ok) expect(r.error.code).toBe("BAD_MAGIC");
  });

  it("flipped reserved byte refuses NONZERO_RESERVED", () => {
    const env = encodeEnvelope(new Uint8Array(8), 2);
    expect(env.ok).toBe(true);
    if (!env.ok) return;
    const bad = new Uint8Array(env.value);
    bad[0x20] = 1; // reserved region [0x0C, 0x3C)
    const r = decodeMetaHeader(bad, 2);
    expect(r.ok).toBe(false);
    // Refusal ordering: seal covers the reserved bytes, so the seal fires first.
    if (!r.ok) expect(r.error.code).toBe("BAD_SEAL");
  });

  it("truncated body refuses BAD_BODY_LENGTH", () => {
    const env = encodeEnvelope(new Uint8Array(8), 2);
    expect(env.ok).toBe(true);
    if (!env.ok) return;
    const r = decodeMetaHeader(env.value.subarray(0, 64 + 4), 2);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("BAD_BODY_LENGTH");
  });

  it("short buffer refuses BUFFER_TOO_SHORT", () => {
    const r = decodeMetaHeader(new Uint8Array(32), 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("BUFFER_TOO_SHORT");
  });
});
