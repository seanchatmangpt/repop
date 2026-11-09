/**
 * DataView codecs for the repop 64-byte frames — hand-written codec layer
 * consuming ONLY the generated row tables from ./generated/layout.ts.
 *
 * Mirrors kernel/crates/repop-abi (lane C1): every frame 64B, LE, digest
 * FNV-1a32 over [0x00, 0x3C). Decode failures are typed refusals mirroring
 * AbiError: BadMagic | BadVersion | UnsupportedAlgorithm | DigestMismatch |
 * NonZeroReserved | BufferTooShort.
 *
 * Offsets are never hard-coded: every access derives its offset via
 * rowOffset(name, table) — the same derivation law as the Rust codecs.
 */

import {
  ALG_ID_KEYED_BLAKE3,
  ALG_ID_ML_DSA_65,
  DIGEST_OFFSET,
  DIGEST_SPAN,
  FRAME_SIZE,
  FNV_OFFSET_BASIS,
  FNV_PRIME,
  HYPERPLANE_FIELDS,
  INTENT_FIELDS,
  LAYOUT_VERSION,
  INTENT_MAGIC,
  HYPERPLANE_MAGIC,
  RECEIPT_MAGIC,
} from "./generated/layout.ts";
import { getU64, setU64 } from "./u64.ts";

/* ---------- typed decode errors (mirror of AbiError) ---------- */

export type DecodeError =
  | { readonly kind: "BadMagic"; readonly expected: number; readonly actual: number }
  | { readonly kind: "BadVersion"; readonly expected: number; readonly actual: number }
  | { readonly kind: "UnsupportedAlgorithm"; readonly algId: number }
  | { readonly kind: "DigestMismatch"; readonly expected: number; readonly actual: number }
  | { readonly kind: "NonZeroReserved"; readonly offset: number }
  | { readonly kind: "BufferTooShort"; readonly expected: number; readonly actual: number };

export type DecodeResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: DecodeError };

export function isDecodeError(
  r: DecodeResult<unknown>,
): r is { readonly ok: false; readonly error: DecodeError } {
  return r.ok === false;
}

/* ---------- FNV-1a32 ---------- */

export function fnv1a32(bytes: Uint8Array): number {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i]!;
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}

/** Compute the frame digest: FNV-1a32 over bytes [0x00, 0x3C). */
export function computeDigest(view: DataView): number {
  return fnv1a32(new Uint8Array(view.buffer, view.byteOffset, DIGEST_SPAN));
}

/* ---------- offset derivation from the generated table ---------- */

function rowOffset(name: string, table: readonly (readonly [string, number, number, string])[]): number {
  for (const r of table) {
    if (r[0] === name) return r[1] as number;
  }
  throw new RangeError(
    `field ${name} not in generated row table (mirror/spec drift)`,
  );
}

/* ---------- shared checks ---------- */

type Check = { ok: true } | { ok: false; error: DecodeError };

function checkDigest(view: DataView): Check {
  const stored = view.getUint32(DIGEST_OFFSET, true);
  const computed = computeDigest(view);
  return stored === computed
    ? { ok: true }
    : { ok: false, error: { kind: "DigestMismatch", expected: computed, actual: stored } };
}

function checkMagic16(view: DataView, expected: number): Check {
  const actual = view.getUint16(0, true);
  return actual === expected
    ? { ok: true }
    : { ok: false, error: { kind: "BadMagic", expected, actual } };
}

function checkVersion16(view: DataView, expected: number): Check {
  const actual = view.getUint16(2, true);
  return actual === expected
    ? { ok: true }
    : { ok: false, error: { kind: "BadVersion", expected, actual } };
}

function checkReserved16(view: DataView, table: typeof INTENT_FIELDS, name: string): Check {
  const offset = rowOffset(name, table);
  const raw = view.getUint16(offset, true);
  return raw === 0
    ? { ok: true }
    : { ok: false, error: { kind: "NonZeroReserved", offset } };
}

/* ---------- IntentFrame ---------- */

export interface IntentFrame {
  intentKind: number;
  flags: number;
  hyperplaneId: bigint;
  threshold: number;
  weight: number;
  issuer: Uint8Array; // [u8;8]
  payloadBinding: Uint8Array; // [u8;16]
  frameSeq: number;
}

export class IntentFrameView {
  static readonly SIZE = FRAME_SIZE;
  readonly view: DataView;

  constructor(source: ArrayBuffer | SharedArrayBuffer, byteOffset = 0) {
    this.view = new DataView(source, byteOffset, FRAME_SIZE);
  }

  /** Wrap a frame resident in a SharedArrayBuffer slot. */
  static fromSAB(sab: SharedArrayBuffer, slotIndex = 0): IntentFrameView {
    return new IntentFrameView(sab, slotIndex * FRAME_SIZE);
  }

  /** Decode from an owned byte copy (mirrors Rust decode-from-bytes). */
  static fromBytes(bytes: Uint8Array): DecodeResult<IntentFrame> {
    if (bytes.length < FRAME_SIZE) {
      return {
        ok: false,
        error: { kind: "BufferTooShort", expected: FRAME_SIZE, actual: bytes.length },
      };
    }
    const copy = bytes.slice(0, FRAME_SIZE);
    return new IntentFrameView(copy.buffer).read();
  }

  read(): DecodeResult<IntentFrame> {
    const magic = checkMagic16(this.view, INTENT_MAGIC);
    if (!magic.ok) return magic;
    const version = checkVersion16(this.view, LAYOUT_VERSION);
    if (!version.ok) return version;
    const reserved = checkReserved16(this.view, INTENT_FIELDS, "reserved");
    if (!reserved.ok) return reserved;
    const digest = checkDigest(this.view);
    if (!digest.ok) return digest;
    return { ok: true, value: this.decodeFields() };
  }

  private decodeFields(): IntentFrame {
    const view = this.view;
    const issuer = new Uint8Array(
      view.buffer.slice(view.byteOffset + rowOffset("issuer", INTENT_FIELDS),
                        view.byteOffset + rowOffset("issuer", INTENT_FIELDS) + 8),
    );
    const payloadBinding = new Uint8Array(
      view.buffer.slice(view.byteOffset + rowOffset("payload_binding", INTENT_FIELDS),
                        view.byteOffset + rowOffset("payload_binding", INTENT_FIELDS) + 16),
    );
    return {
      intentKind: view.getUint16(rowOffset("intent_kind", INTENT_FIELDS), true),
      flags: view.getUint16(rowOffset("flags", INTENT_FIELDS), true),
      hyperplaneId: getU64(view, rowOffset("hyperplane_id", INTENT_FIELDS)),
      threshold: view.getFloat64(rowOffset("threshold", INTENT_FIELDS), true),
      weight: view.getFloat64(rowOffset("weight", INTENT_FIELDS), true),
      issuer,
      payloadBinding,
      frameSeq: view.getUint16(rowOffset("frame_seq", INTENT_FIELDS), true),
    };
  }

  /** Write all payload fields, zero reserved, then seal (digest at 60). */
  write(frame: IntentFrame): void {
    const view = this.view;
    if (frame.issuer.length !== 8) {
      throw new RangeError(`issuer must be 8 bytes, got ${frame.issuer.length}`);
    }
    if (frame.payloadBinding.length !== 16) {
      throw new RangeError(`payloadBinding must be 16 bytes, got ${frame.payloadBinding.length}`);
    }
    view.setUint16(0, INTENT_MAGIC, true);
    view.setUint16(2, LAYOUT_VERSION, true);
    view.setUint16(rowOffset("intent_kind", INTENT_FIELDS), frame.intentKind, true);
    view.setUint16(rowOffset("flags", INTENT_FIELDS), frame.flags, true);
    setU64(view, rowOffset("hyperplane_id", INTENT_FIELDS), frame.hyperplaneId);
    view.setFloat64(rowOffset("threshold", INTENT_FIELDS), frame.threshold, true);
    view.setFloat64(rowOffset("weight", INTENT_FIELDS), frame.weight, true);
    new Uint8Array(view.buffer, view.byteOffset + rowOffset("issuer", INTENT_FIELDS), 8)
      .set(frame.issuer);
    new Uint8Array(view.buffer, view.byteOffset + rowOffset("payload_binding", INTENT_FIELDS), 16)
      .set(frame.payloadBinding);
    view.setUint16(rowOffset("frame_seq", INTENT_FIELDS), frame.frameSeq, true);
    view.setUint16(rowOffset("reserved", INTENT_FIELDS), 0, true);
    view.setUint32(DIGEST_OFFSET, computeDigest(view), true);
  }
}

/* ---------- HyperplaneRegister ---------- */

export interface HyperplaneRegister {
  planeKind: number;
  flags: number;
  planeId: bigint;
  normalX: number;
  normalY: number;
  normalZ: number;
  planeOffset: number;
  binding: Uint8Array; // [u8;8]
  epoch: number;
}

export class HyperplaneRegisterView {
  static readonly SIZE = FRAME_SIZE;
  readonly view: DataView;

  constructor(source: ArrayBuffer | SharedArrayBuffer, byteOffset = 0) {
    this.view = new DataView(source, byteOffset, FRAME_SIZE);
  }

  static fromSAB(sab: SharedArrayBuffer, slotIndex = 0): HyperplaneRegisterView {
    return new HyperplaneRegisterView(sab, slotIndex * FRAME_SIZE);
  }

  static fromBytes(bytes: Uint8Array): DecodeResult<HyperplaneRegister> {
    if (bytes.length < FRAME_SIZE) {
      return {
        ok: false,
        error: { kind: "BufferTooShort", expected: FRAME_SIZE, actual: bytes.length },
      };
    }
    const copy = bytes.slice(0, FRAME_SIZE);
    return new HyperplaneRegisterView(copy.buffer).read();
  }

  read(): DecodeResult<HyperplaneRegister> {
    const magic = checkMagic16(this.view, HYPERPLANE_MAGIC);
    if (!magic.ok) return magic;
    const version = checkVersion16(this.view, LAYOUT_VERSION);
    if (!version.ok) return version;
    const reserved = checkReserved16(this.view, HYPERPLANE_FIELDS, "reserved");
    if (!reserved.ok) return reserved;
    const digest = checkDigest(this.view);
    if (!digest.ok) return digest;
    const binding = new Uint8Array(
      this.view.buffer.slice(
        this.view.byteOffset + rowOffset("binding", HYPERPLANE_FIELDS),
        this.view.byteOffset + rowOffset("binding", HYPERPLANE_FIELDS) + 8,
      ),
    );
    return {
      ok: true,
      value: {
        planeKind: this.view.getUint16(rowOffset("plane_kind", HYPERPLANE_FIELDS), true),
        flags: this.view.getUint16(rowOffset("flags", HYPERPLANE_FIELDS), true),
        planeId: getU64(this.view, rowOffset("plane_id", HYPERPLANE_FIELDS)),
        normalX: this.view.getFloat64(rowOffset("normal_x", HYPERPLANE_FIELDS), true),
        normalY: this.view.getFloat64(rowOffset("normal_y", HYPERPLANE_FIELDS), true),
        normalZ: this.view.getFloat64(rowOffset("normal_z", HYPERPLANE_FIELDS), true),
        planeOffset: this.view.getFloat64(rowOffset("offset", HYPERPLANE_FIELDS), true),
        binding,
        epoch: this.view.getUint16(rowOffset("epoch", HYPERPLANE_FIELDS), true),
      },
    };
  }

  write(reg: HyperplaneRegister): void {
    const view = this.view;
    if (reg.binding.length !== 8) {
      throw new RangeError(`binding must be 8 bytes, got ${reg.binding.length}`);
    }
    view.setUint16(0, HYPERPLANE_MAGIC, true);
    view.setUint16(2, LAYOUT_VERSION, true);
    view.setUint16(rowOffset("plane_kind", HYPERPLANE_FIELDS), reg.planeKind, true);
    view.setUint16(rowOffset("flags", HYPERPLANE_FIELDS), reg.flags, true);
    setU64(view, rowOffset("plane_id", HYPERPLANE_FIELDS), reg.planeId);
    view.setFloat64(rowOffset("normal_x", HYPERPLANE_FIELDS), reg.normalX, true);
    view.setFloat64(rowOffset("normal_y", HYPERPLANE_FIELDS), reg.normalY, true);
    view.setFloat64(rowOffset("normal_z", HYPERPLANE_FIELDS), reg.normalZ, true);
    view.setFloat64(rowOffset("offset", HYPERPLANE_FIELDS), reg.planeOffset, true);
    new Uint8Array(view.buffer, view.byteOffset + rowOffset("binding", HYPERPLANE_FIELDS), 8)
      .set(reg.binding);
    view.setUint16(rowOffset("epoch", HYPERPLANE_FIELDS), reg.epoch, true);
    view.setUint16(rowOffset("reserved", HYPERPLANE_FIELDS), 0, true);
    view.setUint32(DIGEST_OFFSET, computeDigest(view), true);
  }
}

/* ---------- ReceiptFrame ---------- */

export interface ReceiptFrame {
  algId: number;
  binding: Uint8Array; // 32B keyed-BLAKE3 binding of the 229B UnsealedReceipt
  admissionsRootPrefix: Uint8Array; // 16B admissions Merkle root prefix
  frameSeq: number;
}

export class ReceiptFrameView {
  static readonly SIZE = FRAME_SIZE;
  readonly view: DataView;

  constructor(source: ArrayBuffer | SharedArrayBuffer, byteOffset = 0) {
    this.view = new DataView(source, byteOffset, FRAME_SIZE);
  }

  static fromSAB(sab: SharedArrayBuffer, slotIndex = 0): ReceiptFrameView {
    return new ReceiptFrameView(sab, slotIndex * FRAME_SIZE);
  }

  static fromBytes(bytes: Uint8Array): DecodeResult<ReceiptFrame> {
    if (bytes.length < FRAME_SIZE) {
      return {
        ok: false,
        error: { kind: "BufferTooShort", expected: FRAME_SIZE, actual: bytes.length },
      };
    }
    const copy = bytes.slice(0, FRAME_SIZE);
    return new ReceiptFrameView(copy.buffer).read();
  }

  read(): DecodeResult<ReceiptFrame> {
    const magic = checkMagic16(this.view, RECEIPT_MAGIC);
    if (!magic.ok) return magic;
    const version = checkVersion16(this.view, LAYOUT_VERSION);
    if (!version.ok) return version;
    const algId = this.view.getUint16(4, true);
    if (algId !== ALG_ID_KEYED_BLAKE3 && algId !== ALG_ID_ML_DSA_65) {
      return { ok: false, error: { kind: "UnsupportedAlgorithm", algId } };
    }
    const digest = checkDigest(this.view);
    if (!digest.ok) return digest;
    const binding = new Uint8Array(
      this.view.buffer.slice(this.view.byteOffset + 8, this.view.byteOffset + 40),
    );
    const admissionsRootPrefix = new Uint8Array(
      this.view.buffer.slice(this.view.byteOffset + 40, this.view.byteOffset + 56),
    );
    return {
      ok: true,
      value: {
        algId,
        binding,
        admissionsRootPrefix,
        frameSeq: this.view.getUint16(56, true),
      },
    };
  }

  write(frame: ReceiptFrame): void {
    const view = this.view;
    if (frame.binding.length !== 32) {
      throw new RangeError(`binding must be 32 bytes, got ${frame.binding.length}`);
    }
    if (frame.admissionsRootPrefix.length !== 16) {
      throw new RangeError(`admissionsRootPrefix must be 16 bytes, got ${frame.admissionsRootPrefix.length}`);
    }
    if (frame.algId !== ALG_ID_KEYED_BLAKE3 && frame.algId !== ALG_ID_ML_DSA_65) {
      throw new RangeError(`unsupported alg_id ${frame.algId}`);
    }
    view.setUint16(0, RECEIPT_MAGIC, true);
    view.setUint16(2, LAYOUT_VERSION, true);
    view.setUint16(4, frame.algId, true);
    view.setUint16(6, 0, true); // flags: zero on write
    new Uint8Array(view.buffer, view.byteOffset + 8, 32).set(frame.binding);
    new Uint8Array(view.buffer, view.byteOffset + 40, 16).set(frame.admissionsRootPrefix);
    view.setUint16(56, frame.frameSeq, true);
    view.setUint16(58, 0, true); // payload_len: reserved, zero now
    view.setUint32(DIGEST_OFFSET, computeDigest(view), true);
  }
}
