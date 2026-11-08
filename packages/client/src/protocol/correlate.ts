// Correlation map: outbound request corrId -> pending promise bookkeeping.
// Deadlines are injected (no-sleep law: tests pass explicit deadlines and an
// injected clock; there is no fixed Process/`setTimeout` coordination here).
// The map never throws; settling an unknown corrId is a typed report, not an
// exception.

import { TimeoutError, type RepopError } from '../errors.js';

export interface PendingRequest {
  readonly entityKey: string;
  readonly resolve: (value: void) => void;
  readonly reject: (error: RepopError) => void;
  /** Absolute deadline in clock units — computed once at register time. */
  readonly deadline: number;
}

interface RegisterOpts {
  readonly corrId: number;
  readonly entityKey: string;
  /** Relative timeout in clock units; deadline = now + timeoutMs. */
  readonly timeoutMs: number;
  readonly resolve: (value: void) => void;
  readonly reject: (error: RepopError) => void;
}

export class CorrelationMap {
  private readonly pending = new Map<number, PendingRequest>();
  private readonly now: () => number;

  constructor(now: () => number = () => Date.now()) {
    this.now = now;
  }

  register(opts: RegisterOpts): PendingRequest {
    const entry: PendingRequest = {
      entityKey: opts.entityKey,
      resolve: opts.resolve,
      reject: opts.reject,
      deadline: this.now() + opts.timeoutMs,
    };
    this.pending.set(opts.corrId, entry);
    return entry;
  }

  /** Settle a pending request successfully. Returns false if corrId unknown. */
  settle(corrId: number): boolean {
    const entry = this.pending.get(corrId);
    if (entry === undefined) return false;
    this.pending.delete(corrId);
    entry.resolve();
    return true;
  }

  /** Refuse a pending request with a typed error. Returns false if unknown. */
  refuse(corrId: number, error: RepopError): boolean {
    const entry = this.pending.get(corrId);
    if (entry === undefined) return false;
    this.pending.delete(corrId);
    entry.reject(error);
    return true;
  }

  /**
   * Reject every pending request whose deadline has passed. Returns the
   * expired corrIds. Called on inbound-frame activity and explicitly by the
   * store's sweepNow; no timers of its own.
   */
  sweep(): number[] {
    const now = this.now();
    const expired: number[] = [];
    for (const [corrId, entry] of this.pending) {
      if (entry.deadline <= now) {
        expired.push(corrId);
        this.pending.delete(corrId);
        entry.reject(new TimeoutError(entry.entityKey, entry.deadline));
      }
    }
    return expired;
  }

  /** Reject all pending requests (worker termination / teardown). */
  rejectAll(error: RepopError): number {
    const n = this.pending.size;
    for (const [, entry] of this.pending) {
      entry.reject(error);
    }
    this.pending.clear();
    return n;
  }

  get size(): number {
    return this.pending.size;
  }

  has(corrId: number): boolean {
    return this.pending.has(corrId);
  }
}
