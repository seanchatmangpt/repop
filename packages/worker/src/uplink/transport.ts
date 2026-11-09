/**
 * UplinkTransport seam (P20 plan): scatter-segment send, partial accept as
 * a first-class result, zero accept as the typed ZERO_PROGRESS refusal.
 * No JSON anywhere on this path; ordering is a logical ordinal carried in
 * the MetaHeader sequence field, never wall clock.
 */

import { MAX_PAYLOAD, SLOT_SIZE, type RingTransport } from "../ring/index.ts";
import { encodeEnvelope, type UplinkResult } from "./metaHeader.ts";

/** One uplink send: k-of-n segments accepted, or a typed refusal. */
export type UplinkSendResult = UplinkResult<number>;

/** Uplink transport trait: consumer code depends on this, never a backing. */
export interface UplinkTransport {
  /**
   * Scatter send: `segments` go out as one logical record (envelope header
   * + body). Returns the number of segments accepted; partial accept is
   * lawful, zero accept is the typed ZERO_PROGRESS refusal.
   */
  send(segments: Uint8Array[], ordinal: number): UplinkSendResult;
  /** Tear down. Idempotent. */
  close(): void;
}

export function zeroProgress(detail: string): UplinkSendResult {
  return {
    ok: false,
    error: { code: "ZERO_PROGRESS", message: detail },
  };
}

/** Typed-refusal sink: every send refuses with ZERO_PROGRESS. */
export class NullTransport implements UplinkTransport {
  send(_segments: Uint8Array[], _ordinal: number): UplinkSendResult {
    return zeroProgress("null transport accepts nothing");
  }
  close(): void {
    // Nothing to release: the sink owns no channel.
  }
}

/**
 * PostMessage uplink: segments go out as transferable postMessage payload
 * (zero-JSON). Accepts the whole record or nothing: a closed port refuses
 * with ZERO_PROGRESS rather than accepting 0 silently.
 */
export class PostMessageUplink implements UplinkTransport {
  readonly port: MessagePort;
  #closed = false;

  constructor(port: MessagePort) {
    this.port = port;
  }

  send(segments: Uint8Array[], ordinal: number): UplinkSendResult {
    if (this.#closed) {
      return zeroProgress("postMessage uplink closed");
    }
    if (segments.length === 0) {
      return { ok: true, value: 0 };
    }
    const envelope = buildEnvelope(segments, ordinal);
    if (!envelope.ok) return { ok: false, error: envelope.error };
    const frame = envelope.value;
    this.port.postMessage(frame, [frame.buffer]);
    return { ok: true, value: segments.length };
  }

  close(): void {
    this.#closed = true;
    this.port.close();
  }
}

/**
 * Flat scatter segments into one envelope buffer: 64B MetaHeader + the
 * concatenated body segments. Typed refusal when the body exceeds u32.
 */
function buildEnvelope(
  segments: Uint8Array[],
  ordinal: number,
): UplinkResult<Uint8Array> {
  let bodyLength = 0;
  for (const seg of segments) bodyLength += seg.byteLength;
  const body = new Uint8Array(bodyLength);
  let at = 0;
  for (const seg of segments) {
    body.set(seg, at);
    at += seg.byteLength;
  }
  return encodeEnvelope(body, ordinal);
}

/**
 * Ring adapter: emits into the landed C6b ring (WIR0 slots) through its
 * RingTransport API. The envelope (64B MetaHeader + body) rides inside one
 * slot; the ring stamps CRC (transport tier), the envelope carries the FNV
 * seal (tamper tier) — tiers stay in different modules by law.
 */
export class RingUplink implements UplinkTransport {
  readonly ring: RingTransport;
  #closed = false;

  constructor(ring: RingTransport) {
    this.ring = ring;
  }

  send(segments: Uint8Array[], ordinal: number): UplinkSendResult {
    if (this.#closed) {
      return zeroProgress("ring uplink closed");
    }
    const envelope = buildEnvelope(segments, ordinal);
    if (!envelope.ok) {
      return { ok: false, error: envelope.error };
    }
    if (envelope.value.byteLength > SLOT_SIZE) {
      return {
        ok: false,
        error: {
          code: "ZERO_PROGRESS",
          message: `record exceeds one WIR0 slot`,
          observed: envelope.value.byteLength,
          expected: MAX_PAYLOAD,
        },
      };
    }
    const slot = new Uint8Array(SLOT_SIZE);
    slot.set(envelope.value, 0);
    const sent = this.ring.send(slot, ordinal);
    if (!sent.ok) {
      // Zero segments accepted: typed refusal, never a silent retry.
      return zeroProgress(`ring refused: ${sent.error.code} ${sent.error.message}`);
    }
    return { ok: true, value: segments.length };
  }

  close(): void {
    this.#closed = true;
    this.ring.close();
  }
}
