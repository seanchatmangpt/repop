// Frame decoder. Never throws across the async seam: every failure is a typed
// Either. UNVERIFIED-vs-C9 layout (see frames.ts header).

import {
  BreachError,
  UnknownFrameError,
  type RepopError,
} from '../errors.js';
import {
  FRAME_KIND,
  HEADER_BYTES,
  LENGTH_BYTES,
  RECEIPT_BYTES,
  type WireFrame,
} from './frames.js';

export type Either<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export function ok<T, E>(value: T): Either<T, E> {
  return { ok: true, value };
}

export function err<T, E extends RepopError>(error: E): Either<T, E> {
  return { ok: false, error };
}

const textDecoder = new TextDecoder('utf-8', { fatal: true });

/**
 * Decode one complete frame (header + full payload). A truncated or
 * inconsistent buffer is a BreachError; a kind outside the pinned union is an
 * UnknownFrameError. The caller's byte buffer is copied — the decoded frame
 * never aliases input bytes.
 */
export function decodeFrame(bytes: Uint8Array): Either<WireFrame, RepopError> {
  if (bytes.length < HEADER_BYTES) {
    return err(new BreachError(`frame shorter than ${HEADER_BYTES}-byte header (${bytes.length}B)`));
  }
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const kind = dv.getUint8(0);
  const corrId = dv.getUint32(1, false);
  const payloadLen = dv.getUint32(5, false);
  if (HEADER_BYTES + payloadLen !== bytes.length) {
    return err(
      new BreachError(
        `payload length ${payloadLen} does not match buffer (${bytes.length - HEADER_BYTES}B after header)`,
      ),
    );
  }
  switch (kind) {
    case FRAME_KIND.KernelReady: {
      if (payloadLen !== 0) {
        return err(new BreachError(`kernel-ready frame with ${payloadLen}B payload (expected 0)`));
      }
      return ok({ kind: FRAME_KIND.KernelReady, corrId });
    }
    case FRAME_KIND.Receipt: {
      const p = HEADER_BYTES;
      if (payloadLen < 2 + LENGTH_BYTES + RECEIPT_BYTES) {
        return err(new BreachError('receipt payload too short'));
      }
      const keyLen = dv.getUint16(p, false);
      const expected = 2 + keyLen + LENGTH_BYTES + RECEIPT_BYTES;
      if (payloadLen !== expected) {
        return err(
          new BreachError(`receipt payload length ${payloadLen} inconsistent with keyLen ${keyLen}`),
        );
      }
      let entityKey: string;
      try {
        entityKey = textDecoder.decode(bytes.subarray(p + 2, p + 2 + keyLen));
      } catch {
        return err(new BreachError('receipt entityKey is not valid UTF-8'));
      }
      const version = dv.getUint32(p + 2 + keyLen, false);
      const receipt = bytes.slice(p + 2 + keyLen + LENGTH_BYTES, p + 2 + keyLen + LENGTH_BYTES + RECEIPT_BYTES);
      return ok({ kind: FRAME_KIND.Receipt, corrId, entityKey, version, receipt });
    }
    case FRAME_KIND.Refusal:
    case FRAME_KIND.Breach: {
      const p = HEADER_BYTES;
      if (payloadLen < 3) {
        return err(new BreachError('refusal/breach payload too short'));
      }
      const code = dv.getUint8(p);
      const msgLen = dv.getUint16(p + 1, false);
      if (payloadLen !== 3 + msgLen) {
        return err(new BreachError(`refusal/breach payload length ${payloadLen} inconsistent with msgLen ${msgLen}`));
      }
      let message: string;
      try {
        message = textDecoder.decode(bytes.subarray(p + 3, p + 3 + msgLen));
    } catch {
        return err(new BreachError('refusal/breach message is not valid UTF-8'));
      }
      return kind === FRAME_KIND.Refusal
        ? ok({ kind: FRAME_KIND.Refusal, corrId, code, message })
        : ok({ kind: FRAME_KIND.Breach, corrId, code, message });
    }
    default:
      return err(new UnknownFrameError(kind));
  }
}
