/**
 * Frame-level Transport seam (P9): the router depends on this interface,
 * never on a backing. Two impls lawful: PostMessageTransport (here) and a
 * SAB-backed adapter over ring/ (P6 owns the slot-level transport; the
 * adapter is future work and must not duplicate ring behavior).
 *
 * Frames are Uint8Array (32B router header + payload). Zero-JSON: bytes
 * cross the boundary, never structured objects or strings.
 */

import type { RouterIo } from "./router.ts";


export interface Transport {
  /** Send one frame. */
  send(frame: Uint8Array): void;
  /** Register the frame callback; returns a detach function. */
  onFrame(cb: (frame: Uint8Array) => void): () => void;
  /** Tear down. Idempotent. */
  close(): void;
}

/**
 * Transport over a MessageChannel port. Incoming transfers are queued;
 * onFrame consumers receive the transferred buffer views (zero-copy).
 * `canWait` is always false — bounded polling with macrotask yield, never
 * Atomics.wait.
 */
export class PostMessageTransport implements Transport {
  readonly #port: MessagePort;
  #closed = false;
  readonly #queue: Uint8Array[] = [];
  #cb: ((frame: Uint8Array) => void) | undefined;

  constructor(port: MessagePort) {
    this.#port = port;
    port.onmessage = (ev: MessageEvent) => {
      const data = ev.data as Uint8Array | undefined;
      if (!(data instanceof Uint8Array)) return; // non-frames are dropped, never parsed
      if (this.#cb) this.#cb(data);
      else this.#queue.push(data);
    };
  }

  send(frame: Uint8Array): void {
    if (this.#closed) return;
    const copy = frame.slice();
    this.#port.postMessage(copy, [copy.buffer]);
  }

  onFrame(cb: (frame: Uint8Array) => void): () => void {
    this.#cb = cb;
    for (const f of this.#queue) cb(f);
    this.#queue.length = 0;
    return () => {
      if (this.#cb === cb) this.#cb = undefined;
    };
  }

  close(): void {
    this.#closed = true;
    this.#port.close();
  }
}

/** Pair of transports joined by one MessageChannel (test/loopback seam). */
export function transportPair(): [PostMessageTransport, PostMessageTransport] {
  const ch = new MessageChannel();
  return [new PostMessageTransport(ch.port1), new PostMessageTransport(ch.port2)];
}

/** RouterIo adapter: wire a Transport into a Router. */
export function transportIo(t: Transport): RouterIo {
  return { send: (frame) => t.send(frame) };
}
