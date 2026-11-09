import { describe, expect, it } from "vitest";
import { FRAME_SIZE, fnv1a32 } from "@repop/abi";
import {
  DIGEST_SPAN,
  Field,
  HEADER_SIZE,
  MAGIC,
  encodeFrame,
  decodeFrame,
  isFrameShaped,
} from "./frame.ts";
import { FrameKind } from "./frameKind.ts";
import {
  RefusalReason,
  encodeRefusal,
  decodeRefusal,
  REFUSE_PAYLOAD_SIZE,
} from "./refusal.ts";

/** Lawful 64B all-zero payload. */
function payload64(): Uint8Array {
  return new Uint8Array(FRAME_SIZE);
}

/** Encode helper: throws on refusal (tests only feed lawful shapes). */
function mustEncode(
  kind: FrameKind,
  seq: number,
  corrId: number,
  payload: Uint8Array,
): Uint8Array {
  const r = encodeFrame(kind, seq, corrId, payload);
  if (!r.ok) throw new Error(`encode refused: ${r.error.code}`);
  return r.frame;
}

describe("golden byte windows", () => {
  it("SUBMIT_INTENT header bytes are exact", () => {
    const f = mustEncode(FrameKind.SUBMIT_INTENT, 5, 7, payload64());
    const dv = new DataView(f.buffer);
    // magic 0x46395052 LE => bytes 52 50 39 46 = "RP9F"
    expect(Array.from(f.subarray(0, 4))).toEqual([0x52, 0x50, 0x39, 0x46]);
    expect(dv.getUint32(Field.MAGIC, true)).toBe(MAGIC);
    expect(dv.getUint16(Field.VERSION, true)).toBe(1);
    expect(dv.getUint8(Field.KIND)).toBe(0);
    expect(dv.getUint8(Field.FLAGS)).toBe(0);
    expect(dv.getUint32(Field.SEQ, true)).toBe(5);
    expect(dv.getUint32(Field.CORR_ID, true)).toBe(7);
    expect(dv.getUint32(Field.PAYLOAD_LEN, true)).toBe(FRAME_SIZE);
    expect(dv.getUint32(Field.RESERVED0, true)).toBe(0);
    expect(dv.getUint32(Field.RESERVED1, true)).toBe(0);
    // digest field equals FNV-1a32 over [0, 0x1C)
    expect(dv.getUint32(Field.DIGEST, true)).toBe(
      fnv1a32(f.subarray(0, DIGEST_SPAN)),
    );
  });

  it("frame length is exactly header + payload", () => {
    const f = mustEncode(FrameKind.SUBMIT_INTENT, 0, 1, payload64());
    expect(f.byteLength).toBe(HEADER_SIZE + FRAME_SIZE);
    expect(isFrameShaped(f)).toBe(true);
  });

  it("REFUSE payload layout: statusCode/reserved/reasonBits/corrId echo", () => {
    const r = encodeRefusal(
      42,
      RefusalReason.NOT_READY | RefusalReason.UNKNOWN_OBJECT,
      0xdeadbeef,
    );
    if (!r.ok) throw new Error("refusal encode refused");
    const p = r.payload;
    expect(p.byteLength).toBe(REFUSE_PAYLOAD_SIZE);
    const dv = new DataView(p.buffer);
    expect(dv.getUint16(0, true)).toBe(42);
    expect(dv.getUint16(2, true)).toBe(0);
    expect(dv.getBigUint64(4, true)).toBe(
      RefusalReason.NOT_READY | RefusalReason.UNKNOWN_OBJECT,
    );
    expect(dv.getUint32(12, true)).toBe(0xdeadbeef);
  });

  it("decodeRefusal round-trips and enforces reserved==0", () => {
    const r = encodeRefusal(7, RefusalReason.BAD_FRAME_CLASS, 9);
    if (!r.ok) throw new Error("encode refused");
    const d = decodeRefusal(r.payload);
    if (!d.ok) throw new Error("decode refused");
    expect(d.refusal.statusCode).toBe(7);
    expect(d.refusal.reasonBits).toBe(RefusalReason.BAD_FRAME_CLASS);
    expect(d.refusal.corrId).toBe(9);
    // corruption: reserved word != 0 -> BAD_RESERVED
    r.payload[2] = 1;
    const bad = decodeRefusal(r.payload);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.code).toBe("BAD_RESERVED");
  });
});

describe("corruption classes (mutation legs)", () => {
  /** Clone, flip one byte, decode: each class must refuse with its exact variant. */
  function flipMustRefuse(
    f: Uint8Array,
    index: number,
    value: number,
    code: string,
    label: string,
  ): void {
    const m = f.slice();
    m[index] = value;
    const r = decodeFrame(m);
    expect(r.ok, label).toBe(false);
    if (!r.ok) expect(r.error.code, label).toBe(code);
  }

  it("golden frame decodes clean before any mutation", () => {
    const f = mustEncode(FrameKind.SUBMIT_INTENT, 0, 1, payload64());
    const r = decodeFrame(f);
    expect(r.ok).toBe(true);
  });

  it("flipping one byte per corruption class refuses with the typed variant", () => {
    const f = mustEncode(FrameKind.SUBMIT_INTENT, 0, 1, payload64());

    flipMustRefuse(f, 0, 0x53, "BAD_MAGIC", "magic"); // 'S' != 'R'
    flipMustRefuse(f, 4, 2, "BAD_VERSION", "version");
    flipMustRefuse(f, 7, 1, "BAD_FLAGS", "flags");
    flipMustRefuse(f, 20, 1, "BAD_RESERVED", "reserved0");
    flipMustRefuse(f, 24, 1, "BAD_RESERVED", "reserved1");
    // kind sits inside the digest window: a digest-consistent writer
    // mutation re-stamps, so the kind gate itself must refuse.
    const mk = f.slice();
    mk[6] = 99;
    new DataView(mk.buffer).setUint32(28, fnv1a32(mk.subarray(0, DIGEST_SPAN)), true);
    const rk = decodeFrame(mk);
    expect(rk.ok, "kind").toBe(false);
    if (!rk.ok) expect(rk.error.code, "kind").toBe("BAD_KIND");
  });

  it("digest mutation leg actually flips a digest byte", () => {
    const f = mustEncode(FrameKind.SUBMIT_INTENT, 0, 1, payload64());
    const m = f.slice();
    const dv = new DataView(m.buffer);
    const cur = dv.getUint32(28, true);
    dv.setUint32(28, (cur + 1) >>> 0, true); // any != stored refuses
    const r = decodeFrame(m);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("BAD_DIGEST");
  });

  it("length class: truncation and payloadLen field both refuse", () => {
    const f = mustEncode(FrameKind.SUBMIT_INTENT, 0, 1, payload64());
    const trunc = f.slice(0, f.byteLength - 1);
    const r1 = decodeFrame(trunc);
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.error.code).toBe("BAD_LENGTH");

    const m = f.slice();
    const mdv = new DataView(m.buffer);
    mdv.setUint32(16, 63, true); // payloadLen 63 != 64
    // digest covers [0,0x1C) incl. payloadLen: a digest-consistent writer
    // mutation re-stamps, so the length gate itself must refuse.
    mdv.setUint32(28, fnv1a32(m.subarray(0, DIGEST_SPAN)), true);
    const r2 = decodeFrame(m);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error.code).toBe("BAD_LENGTH");
  });

  it("gate order: first failing gate wins (magic reported before digest)", () => {
    const f = mustEncode(FrameKind.SUBMIT_INTENT, 0, 1, payload64());
    const m = f.slice();
    m[0] = 0x53; // bad magic
    m[28] = (m[28]! ^ 0xff) & 0xff; // bad digest too
    const r = decodeFrame(m);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("BAD_MAGIC");
  });

  it("gate order: bad kind reported before bad length", () => {
    const f = mustEncode(FrameKind.SUBMIT_INTENT, 0, 1, payload64());
    const m = f.slice();
    m[6] = 200; // unknown kind
    new DataView(m.buffer).setUint32(
      28,
      fnv1a32(m.subarray(0, DIGEST_SPAN)),
      true,
    ); // digest-consistent: kind gate itself must refuse
    const r = decodeFrame(m);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("BAD_KIND");
  });

  it("payload width law: wrong-width payload refuses at encode", () => {
    const r = encodeFrame(FrameKind.SUBMIT_INTENT, 0, 1, new Uint8Array(16));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("BAD_LENGTH");
    const r2 = encodeFrame(FrameKind.KERNEL_READY, 0, 0, new Uint8Array(1));
    expect(r2.ok).toBe(false);
  });
});
