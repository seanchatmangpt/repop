/** SabTransport: RingTransport backed by SabRing (SharedArrayBuffer). */

import { SabRing, allocSab } from "./sabRing.ts";
import { err, ok, type RingResult } from "./errors.ts";
import type { RingTransport } from "./transport.ts";

export interface SabTransportOptions {
  /** Pre-built SAB; when omitted, allocates slotCount slots (default 8). */
  sab?: SharedArrayBuffer;
  slotCount?: number;
}

/** Build a SabTransport; ring init happens only for a fresh allocation. */
export function sabTransport(options: SabTransportOptions = {}): SabTransport {
  const sab = options.sab ?? allocSab(options.slotCount ?? 8);
  const ring = new SabRing(sab, { init: options.sab === undefined });
  return new SabTransport(ring);
}

export class SabTransport implements RingTransport {
  readonly ring: SabRing;
  #closed = false;

  constructor(ring: SabRing) {
    this.ring = ring;
  }

  /** Producer: publish one WIR0 frame into the ring. */
  send(frame: Uint8Array, ordinal: number): RingResult<void> {
    if (this.#closed) return err("TRANSPORT_CLOSED", "sab transport closed");
    const n = this.ring.publish(frame, ordinal);
    if (!n.ok) return n;
    return ok(undefined);
  }

  /** Consumer: read next frame payload into dest. */
  receive(dest: Uint8Array): RingResult<number> {
    if (this.#closed) return err("TRANSPORT_CLOSED", "sab transport closed");
    return this.ring.read(dest);
  }

  canWait(): boolean {
    return true;
  }

  close(): void {
    this.#closed = true;
  }
}
