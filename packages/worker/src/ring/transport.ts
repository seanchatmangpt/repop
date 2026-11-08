/**
 * RingTransport seam: consumer/producer code depends on this trait, never
 * the backing. Two impls: SabTransport (SharedArrayBuffer + Atomics) and
 * PostMessageTransport (MessageChannel, zero-JSON binary frames).
 * Selection is feature-detection; the fallback swaps I/O only — the WIR0
 * slot format is identical on both.
 */

import { err, type RingResult } from "./errors.ts";

export interface RingTransport {
  /** Send one slot-sized WIR0 frame; `ordinal` is stamped in the header. */
  send(frame: Uint8Array, ordinal: number): RingResult<void>;
  /** Consumer: read the next frame's payload into `dest`. */
  receive(dest: Uint8Array): RingResult<number>;
  /**
   * True when this transport supports blocking waits (Atomics.wait). A
   * false return obligates the consumer to yield via MessageChannel macrotask
   * between bounded polls instead of waiting.
   */
  canWait(): boolean;
  /** Tear down. Idempotent. */
  close(): void;
}

export type TransportKind = "sab" | "postMessage";

export interface TransportFeatureProbe {
  readonly sabAvailable: boolean;
}

/** Feature detection: SAB + Atomics present. */
export function probeFeatures(): TransportFeatureProbe {
  return {
    sabAvailable:
      typeof SharedArrayBuffer !== "undefined" && typeof Atomics !== "undefined",
  };
}

/** Choose a transport kind from feature detection. */
export function selectTransportKind(
  probe: TransportFeatureProbe = probeFeatures(),
): TransportKind {
  return probe.sabAvailable ? "sab" : "postMessage";
}

/** Typed refusal helper for closed transports. */
export function transportClosed(): RingResult<never> {
  return err("TRANSPORT_CLOSED", "transport is closed");
}
