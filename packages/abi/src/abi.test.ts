/**
 * @repop/abi courts.
 *
 * Legs:
 *  1. Offset courts — a written field lands at exactly its pinned offset,
 *     proven by raw byte reads at the generated row-table offsets.
 *  2. Golden fixture leg — SplitMix64 seed 0xA20C_0FFE_E5A7_E000 derives
 *     deterministic field values; encode→decode round-trips byte-exact.
 *  3. Mutation legs — magic flip / version bump / reserved-nonzero / digest
 *     corruption / payload mutation / unknown alg_id each produce the typed
 *     refusal, never silent.
 */
import { describe, expect, it } from "vitest";

import {
  HyperplaneRegisterView,
  IntentFrameView,
  ReceiptFrameView,
  computeDigest,
  fnv1a32,
  isDecodeError,
} from "./index.ts";
import {
  ALG_ID_KEYED_BLAKE3,
  DIGEST_OFFSET,
  DIGEST_SPAN,
  FRAME_SIZE,
  HYPERPLANE_MAGIC,
  INTENT_MAGIC,
  RECEIPT_MAGIC,
} from "./generated/layout.ts";

/** SplitMix64 — deterministic field-value oracle (R4 seed law). */
class SplitMix64 {
  private state: bigint;
  constructor(seed: bigint) {
    this.state = seed;
  }
  next(): bigint {
    this.state = (this.state + 0x9e3779b97f4a7c15n) & 0xffffffffffffffffn;
    let z = this.state;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & 0xffffffffffffffffn;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & 0xffffffffffffffffn;
    z = z ^ (z >> 31n);
    return z & 0xffffffffffffffffn;
  }
}

const SEED = 0xa20c_0ffe_e5a7_e000n;

function goldenIntentFrame() {
  const r = new SplitMix64(SEED);
  const issuer = new Uint8Array(8);
  for (let i = 0; i < 8; i++) issuer[i] = Number(r.next() & 0xffn);
  const payloadBinding = new Uint8Array(16);
  for (let i = 0; i < 16; i++) payloadBinding[i] = Number(r.next() & 0xffn);
  return {
    intentKind: Number(r.next() & 0xffffn),
    flags: Number(r.next() & 0xffffn),
    hyperplaneId: r.next(),
    threshold: Number(r.next() & 0xffffffffn) / 4294967295,
    weight: Number(r.next() & 0xffffffffn) / 4294967295,
    issuer,
    payloadBinding,
    frameSeq: Number(r.next() & 0xffffn),
  };
}

function goldenHyperplane() {
  const r = new SplitMix64(SEED + 1n);
  const binding = new Uint8Array(8);
  for (let i = 0; i < 8; i++) binding[i] = Number(r.next() & 0xffn);
  return {
    planeKind: Number(r.next() & 0xffffn),
    flags: Number(r.next() & 0xffffn),
    planeId: r.next(),
    normalX: Number(r.next() & 0xffffffffn) / 4294967295,
    normalY: Number(r.next() & 0xffffffffn) / 4294967295,
    normalZ: Number(r.next() & 0xffffffffn) / 4294967295,
    planeOffset: Number(r.next() & 0xffffffffn) / 4294967295,
    binding,
    epoch: Number(r.next() & 0xffffn),
  };
}

function goldenReceipt() {
  const r = new SplitMix64(SEED + 2n);
  const binding = new Uint8Array(32);
  for (let i = 0; i < 32; i++) binding[i] = Number(r.next() & 0xffn);
  const admissionsRootPrefix = new Uint8Array(16);
  for (let i = 0; i < 16; i++) admissionsRootPrefix[i] = Number(r.next() & 0xffn);
  return {
    algId: ALG_ID_KEYED_BLAKE3,
    binding,
    admissionsRootPrefix,
    frameSeq: Number(r.next() & 0xffffn),
  };
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

describe("offset courts (raw bytes at generated-table offsets)", () => {
  it("IntentFrame: every field lands at its pinned offset", () => {
    const buf = new ArrayBuffer(FRAME_SIZE);
    new IntentFrameView(buf).write(goldenIntentFrame());
    const raw = new DataView(buf);
    expect(raw.getUint16(0, true)).toBe(INTENT_MAGIC);
    expect(raw.getUint16(2, true)).toBe(1); // LAYOUT_VERSION
    expect(raw.getUint16(4, true)).toBe(goldenIntentFrame().intentKind);
    expect(raw.getBigUint64(8, true)).toBe(goldenIntentFrame().hyperplaneId);
    expect(raw.getFloat64(16, true)).toBeCloseTo(goldenIntentFrame().threshold, 12);
    expect(raw.getFloat64(24, true)).toBeCloseTo(goldenIntentFrame().weight, 12);
    for (let i = 0; i < 8; i++) {
      expect(raw.getUint8(32 + i)).toBe(goldenIntentFrame().issuer[i]);
    }
    for (let i = 0; i < 16; i++) {
      expect(raw.getUint8(40 + i)).toBe(goldenIntentFrame().payloadBinding[i]);
    }
    expect(raw.getUint16(56, true)).toBe(goldenIntentFrame().frameSeq);
    expect(raw.getUint16(58, true)).toBe(0); // reserved zero on write
    expect(raw.getUint32(60, true)).toBe(
      fnv1a32(new Uint8Array(buf, 0, DIGEST_SPAN)),
    );
  });

  it("frame buffers are exactly 64 bytes", () => {
    expect(FRAME_SIZE).toBe(64);
    const buf = new ArrayBuffer(FRAME_SIZE);
    new IntentFrameView(buf).write(goldenIntentFrame());
    expect(buf.byteLength).toBe(64);
  });
});

describe("golden fixture leg (SplitMix64 seed 0xA20C_0FFE_E5A7_E000)", () => {
  it("IntentFrame encode→decode round-trips field-exact", () => {
    const buf = new ArrayBuffer(FRAME_SIZE);
    const f = goldenIntentFrame();
    new IntentFrameView(buf).write(f);
    const decoded = IntentFrameView.fromBytes(new Uint8Array(buf));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.value.intentKind).toBe(f.intentKind);
    expect(decoded.value.flags).toBe(f.flags);
    expect(decoded.value.hyperplaneId).toBe(f.hyperplaneId);
    expect(decoded.value.threshold).toBe(f.threshold);
    expect(decoded.value.weight).toBe(f.weight);
    expect(bytesEqual(decoded.value.issuer, f.issuer)).toBe(true);
    expect(bytesEqual(decoded.value.payloadBinding, f.payloadBinding)).toBe(true);
    expect(decoded.value.frameSeq).toBe(f.frameSeq);
  });

  it("golden bytes are deterministic across encodes", () => {
    const a = new ArrayBuffer(FRAME_SIZE);
    const b = new ArrayBuffer(FRAME_SIZE);
    new IntentFrameView(a).write(goldenIntentFrame());
    new IntentFrameView(b).write(goldenIntentFrame());
    expect(bytesEqual(new Uint8Array(a), new Uint8Array(b))).toBe(true);
  });

  it("HyperplaneRegister encode→decode round-trips field-exact", () => {
    const buf = new ArrayBuffer(FRAME_SIZE);
    const reg = goldenHyperplane();
    new HyperplaneRegisterView(buf).write(reg);
    const raw = new DataView(buf);
    expect(raw.getUint16(0, true)).toBe(HYPERPLANE_MAGIC);
    const decoded = HyperplaneRegisterView.fromBytes(new Uint8Array(buf));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.value.planeKind).toBe(reg.planeKind);
    expect(decoded.value.flags).toBe(reg.flags);
    expect(decoded.value.planeId).toBe(reg.planeId);
    expect(decoded.value.normalX).toBe(reg.normalX);
    expect(decoded.value.normalY).toBe(reg.normalY);
    expect(decoded.value.normalZ).toBe(reg.normalZ);
    expect(decoded.value.planeOffset).toBe(reg.planeOffset);
    expect(bytesEqual(decoded.value.binding, reg.binding)).toBe(true);
    expect(decoded.value.epoch).toBe(reg.epoch);
  });

  it("ReceiptFrame encode→decode round-trips field-exact with alg_id seam", () => {
    const buf = new ArrayBuffer(FRAME_SIZE);
    const frame = goldenReceipt();
    new ReceiptFrameView(buf).write(frame);
    const raw = new DataView(buf);
    expect(raw.getUint16(0, true)).toBe(RECEIPT_MAGIC);
    expect(raw.getUint16(4, true)).toBe(ALG_ID_KEYED_BLAKE3);
    const decoded = ReceiptFrameView.fromBytes(new Uint8Array(buf));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.value.algId).toBe(frame.algId);
    expect(bytesEqual(decoded.value.binding, frame.binding)).toBe(true);
    expect(bytesEqual(decoded.value.admissionsRootPrefix, frame.admissionsRootPrefix)).toBe(true);
    expect(decoded.value.frameSeq).toBe(frame.frameSeq);
  });
});

describe("mutation legs (fail-closed typed refusals)", () => {
  function sealedIntentBytes(): Uint8Array {
    const buf = new ArrayBuffer(FRAME_SIZE);
    new IntentFrameView(buf).write(goldenIntentFrame());
    return new Uint8Array(buf.slice(0));
  }

  it("magic flip -> BadMagic", () => {
    const bytes = sealedIntentBytes();
    bytes[0] = (bytes[0]! + 1) & 0xff;
    const r = IntentFrameView.fromBytes(bytes);
    expect(isDecodeError(r)).toBe(true);
    if (r.ok) throw new Error("magic flip passed — fail-closed violated");
    expect(r.error.kind).toBe("BadMagic");
  });

  it("version bump -> BadVersion", () => {
    const bytes = sealedIntentBytes();
    bytes[2] = 2;
    const r = IntentFrameView.fromBytes(bytes);
    if (r.ok) throw new Error("version bump passed — fail-closed violated");
    expect(r.error.kind).toBe("BadVersion");
  });

  it("reserved-nonzero -> NonZeroReserved", () => {
    const bytes = sealedIntentBytes();
    bytes[58] = 1;
    // re-seal so ONLY the reserved mutation is under test
    const view = new DataView(bytes.buffer);
    view.setUint32(DIGEST_OFFSET, computeDigest(view), true);
    const r = IntentFrameView.fromBytes(bytes);
    if (r.ok) throw new Error("reserved-nonzero passed — fail-closed violated");
    expect(r.error.kind).toBe("NonZeroReserved");
  });

  it("digest corruption -> DigestMismatch", () => {
    const bytes = sealedIntentBytes();
    bytes[DIGEST_OFFSET] = (bytes[DIGEST_OFFSET]! + 1) & 0xff;
    const r = IntentFrameView.fromBytes(bytes);
    if (r.ok) throw new Error("digest corruption passed — fail-closed violated");
    expect(r.error.kind).toBe("DigestMismatch");
  });

  it("payload mutation inside [0x00,0x3C) -> DigestMismatch", () => {
    const bytes = sealedIntentBytes();
    bytes[10] = (bytes[10]! + 1) & 0xff; // inside hyperplane_id u64 @8
    const r = IntentFrameView.fromBytes(bytes);
    if (r.ok) throw new Error("payload mutation passed — fail-closed violated");
    expect(r.error.kind).toBe("DigestMismatch");
  });

  it("unknown alg_id 0xFFFF -> UnsupportedAlgorithm (never pass-through)", () => {
    const buf = new ArrayBuffer(FRAME_SIZE);
    new ReceiptFrameView(buf).write(goldenReceipt());
    const bytes = new Uint8Array(buf.slice(0));
    const view = new DataView(bytes.buffer);
    view.setUint16(4, 0xffff, true);
    // re-seal so ONLY the alg_id mutation is under test
    view.setUint32(DIGEST_OFFSET, computeDigest(view), true);
    const r = ReceiptFrameView.fromBytes(bytes);
    if (r.ok) throw new Error("alg_id 0xFFFF passed — silent pass-through violated");
    expect(r.error.kind).toBe("UnsupportedAlgorithm");
    expect(r.error).toMatchObject({ kind: "UnsupportedAlgorithm", algId: 0xffff });
  });
});
