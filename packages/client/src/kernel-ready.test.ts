// Kernel-ready court: frame layout pins + codec roundtrip for the full union.
// Pins are the UNVERIFIED-vs-C9 contract surface — a C9 divergence fails here.
import { describe, expect, it } from 'vitest';
import {
  encodeFrame,
  FRAME_KIND,
  HEADER_BYTES,
  RECEIPT_BYTES,
  REFUSAL_CODE,
} from './protocol/frames.js';
import { decodeFrame } from './protocol/decode.js';
import { BreachError, UnknownFrameError } from './errors.js';

describe('frame layout pins', () => {
  it('header and receipt sizes match the pinned layout', () => {
    expect(HEADER_BYTES).toBe(9);
    expect(RECEIPT_BYTES).toBe(64);
    expect(FRAME_KIND.KernelReady).toBe(0x01);
    expect(FRAME_KIND.Receipt).toBe(0x02);
    expect(FRAME_KIND.Refusal).toBe(0x03);
    expect(FRAME_KIND.Breach).toBe(0x04);
  });
});

describe('codec roundtrip', () => {
  it('kernel-ready roundtrips', () => {
    const bytes = encodeFrame({ kind: FRAME_KIND.KernelReady, corrId: 0 });
    expect(bytes.length).toBe(9);
    const decoded = decodeFrame(bytes);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.value).toEqual({ kind: FRAME_KIND.KernelReady, corrId: 0 });
    }
  });

  it('receipt roundtrips entityKey, version, and the 64B receipt', () => {
    const receipt = new Uint8Array(RECEIPT_BYTES);
    receipt[0] = 0xde;
    receipt[63] = 0xad;
    const bytes = encodeFrame({
      kind: FRAME_KIND.Receipt,
      corrId: 4294967295,
      entityKey: 'hello-world',
      version: 7,
      receipt,
    });
    const decoded = decodeFrame(bytes);
    expect(decoded.ok).toBe(true);
    if (decoded.ok && decoded.value.kind === FRAME_KIND.Receipt) {
      expect(decoded.value.entityKey).toBe('hello-world');
      expect(decoded.value.version).toBe(7);
      expect(decoded.value.corrId).toBe(4294967295);
      expect(decoded.value.receipt.length).toBe(64);
      expect(decoded.value.receipt[0]).toBe(0xde);
      expect(decoded.value.receipt[63]).toBe(0xad);
    }
  });

  it('refusal and breach roundtrip code + message', () => {
    const refusal = decodeFrame(
      encodeFrame({
        kind: FRAME_KIND.Refusal,
        corrId: 5,
        code: REFUSAL_CODE.StaleVersion,
        message: 'version conflict',
      }),
    );
    expect(refusal.ok).toBe(true);
    if (refusal.ok && refusal.value.kind === FRAME_KIND.Refusal) {
      expect(refusal.value.code).toBe(REFUSAL_CODE.StaleVersion);
      expect(refusal.value.message).toBe('version conflict');
    }
    const breach = decodeFrame(
      encodeFrame({
        kind: FRAME_KIND.Breach,
        corrId: 6,
        code: 0x7f,
        message: 'ring overrun',
      }),
    );
    expect(breach.ok).toBe(true);
    if (breach.ok && breach.value.kind === FRAME_KIND.Breach) {
      expect(breach.value.code).toBe(0x7f);
      expect(breach.value.message).toBe('ring overrun');
    }
  });
});

describe('fail-closed decode', () => {
  it('unknown kind is a typed UnknownFrameError', () => {
    const bytes = new Uint8Array(9); // kind 0x00, len 0 — not in the union
    bytes[0] = 0x00;
    const decoded = decodeFrame(bytes);
    expect(decoded.ok).toBe(false);
    if (!decoded.ok) {
      expect(decoded.error).toBeInstanceOf(UnknownFrameError);
      expect(decoded.error.name).toBe('UnknownFrameError');
    }
  });

  it('a kind outside the union even with a well-formed header refuses', () => {
    const bytes = encodeFrame({ kind: FRAME_KIND.KernelReady, corrId: 0 });
    bytes[0] = 0xfe;
    const decoded = decodeFrame(bytes);
    expect(decoded.ok).toBe(false);
    if (!decoded.ok) expect(decoded.error).toBeInstanceOf(UnknownFrameError);
  });

  it('a truncated frame is a BreachError', () => {
    const bytes = encodeFrame({ kind: FRAME_KIND.KernelReady, corrId: 0 });
    const decoded = decodeFrame(bytes.slice(0, 5));
    expect(decoded.ok).toBe(false);
    if (!decoded.ok) expect(decoded.error).toBeInstanceOf(BreachError);
  });

  it('a payload-length mismatch is a BreachError', () => {
    const bytes = encodeFrame({ kind: FRAME_KIND.KernelReady, corrId: 0 });
    bytes[8] = 4; // declared payloadLen 4 over a 0-payload frame
    const decoded = decodeFrame(bytes);
    expect(decoded.ok).toBe(false);
    if (!decoded.ok) expect(decoded.error).toBeInstanceOf(BreachError);
  });
});
