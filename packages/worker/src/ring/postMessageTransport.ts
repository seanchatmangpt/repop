/** PostMessageTransport: RingTransport over MessageChannel (zero-JSON). */

import { SLOT_SIZE } from "./constants.ts";
import { err, ok, type RingResult } from "./errors.ts";
import type { RingTransport } from "./transport.ts";

/**
 * Same WIR0 slot bytes over MessageChannel port messages (transferables,
 * zero-JSON). canWait() is always false — the consumer must use bounded
 * polling with a MessageChannel yield between polls.
 */
export class PostMessageTransport implements RingTransport {
  readonly port: MessagePort;
  #closed = false;
  readonly #queue: Uint8Array[] = [];

  constructor(port: MessagePort) {
    this.port = port;
    port.onmessage = (ev: MessageEvent) => {
      const data = ev.data as Uint8Array | undefined;
      if (data instanceof Uint8Array) this.#queue.push(data);
    };
  }

  /** Producer: transfer a slot copy to the peer port. */
  send(frame: Uint8Array, _ordinal: number): RingResult<void> {
    if (this.#closed) return err("TRANSPORT_CLOSED", "postMessage transport closed");
    if (frame.byteLength !== SLOT_SIZE) {
      return err("BAD_STATE", `frame must be exactly one slot`, frame.byteLength, SLOT_SIZE);
    }
    const copy = frame.slice();
    this.port.postMessage(copy, [copy.buffer]);
    return ok(undefined);
  }

  /** Consumer: dequeue; EMPTY when nothing has arrived yet. */
  receive(dest: Uint8Array): RingResult<number> {
    const next = this.#queue.shift();
    if (next === undefined) return err("EMPTY", "no frame queued");
    if (next.byteLength > dest.byteLength) {
      return err("OVERSIZE", "dest smaller than queued frame", dest.byteLength, next.byteLength);
    }
    dest.set(next);
    return ok(next.byteLength);
  }

  canWait(): boolean {
    return false;
  }

  close(): void {
    this.#closed = true;
    this.port.close();
  }
}

/** Pair of transports joined by one MessageChannel. */
export function postMessagePair(): [PostMessageTransport, PostMessageTransport] {
  const ch = new MessageChannel();
  return [
    new PostMessageTransport(ch.port1),
    new PostMessageTransport(ch.port2),
  ];
}
