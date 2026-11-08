/** Bounded-poll consumer: deadline-checked polling on real observables. */

import type { RingTransport } from "./transport.ts";
import { err, ok, type RingResult } from "./errors.ts";

export interface PollOptions {
  /** Wall-clock budget in ms. Default 5000. */
  timeoutMs?: number;
  /** Per-poll yield between empty checks. Default: MessageChannel yield when unsupported. */
  canWaitHint?: boolean;
}

/** Macrotask yield so bounded polls never starve the event loop. */
export function yieldMacrotask(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof MessageChannel !== "undefined") {
      const ch = new MessageChannel();
      ch.port1.onmessage = () => {
        ch.port1.close();
        ch.port2.close();
        resolve();
      };
      ch.port2.postMessage(null);
    } else {
      setTimeout(resolve, 0);
    }
  });
}

/**
 * Poll `read` until it yields a frame or the deadline passes. No fixed
 * sleeps: every empty poll yields via MessageChannel macrotask, and the
 * loop is bounded by a real deadline, never a loop counter.
 */
export async function pollUntil(
  read: () => RingResult<number>,
  opts: PollOptions = {},
): Promise<RingResult<number>> {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const start = Date.now();
  for (;;) {
    const r = read();
    if (r.ok) return ok(r.value);
    if (r.error.code !== "EMPTY") return r;
    if (Date.now() - start > timeoutMs) {
      return err("EMPTY", `poll deadline ${timeoutMs}ms exceeded`);
    }
    await yieldMacrotask();
  }
}

/** Poll a transport's receive() until a frame arrives or deadline. */
export function pollTransport(
  t: RingTransport,
  dest: Uint8Array,
  opts: PollOptions = {},
): Promise<RingResult<number>> {
  return pollUntil(() => t.receive(dest), opts);
}
