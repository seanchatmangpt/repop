// WorkerOwner — single-owner worker lifecycle.
//
// spawn/terminate are idempotent: start() creates the worker exactly once and
// returns the same handle on every call; terminate() tears down at most once
// and is safe to call repeatedly (including after a failed start). The factory
// is injectable so tests run against a real in-process fake (Chicago), never
// a mock framework. The owner never imports the store and never touches
// React.

import type { TransportHandle, WorkerFactory, WorkerLike } from '../types.js';

export interface WorkerOwnerOptions {
  /** Injectable worker factory (real `new Worker(...)` in production). */
  readonly factory: WorkerFactory;
}

/**
 * Bidirectional transport over the owned worker. Binary frames only —
 * zero-JSON law. Owned by P11 (provider) at composition time; the client
 * store consumes it via its TransportHandle seam.
 */
export class WorkerOwner {
  private worker: WorkerLike | null = null;
  private readonly inboundListeners = new Set<(bytes: Uint8Array) => void>();
  private readonly messageListener = (event: { data: Uint8Array }): void => {
    for (const listener of this.inboundListeners) {
      listener(event.data);
    }
  };
  private readonly factory: WorkerFactory;

  constructor(opts: WorkerOwnerOptions) {
    this.factory = opts.factory;
  }

  /** Spawn once; every later call returns the same live worker. */
  start(): WorkerLike {
    if (this.worker !== null) return this.worker;
    const worker = this.factory();
    worker.addEventListener('message', this.messageListener);
    this.worker = worker;
    return worker;
  }

  /** Tear down at most once; safe and silent on repeated calls. */
  terminate(): void {
    const worker = this.worker;
    if (worker === null) return;
    this.worker = null;
    worker.terminate();
  }

  isRunning(): boolean {
    return this.worker !== null;
  }

  /** Transport view over the owned worker (TransportHandle seam). */
  transport(): TransportHandle {
    return {
      send: (bytes: Uint8Array): void => {
        const worker = this.worker;
        if (worker === null) {
          // Fail-closed: sending to a dead owner is a typed condition at the
          // store layer (kernel not ready); here it is a no-op discard.
          return;
        }
        worker.postMessage(bytes);
      },
      subscribe: (onFrame: (bytes: Uint8Array) => void): (() => void) => {
        this.inboundListeners.add(onFrame);
        return () => {
          this.inboundListeners.delete(onFrame);
        };
      },
    };
  }
}
