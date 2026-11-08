// Public type surface for @repop/client. React-free by law (wave-1 R6):
// nothing in this package imports `react`; the React binding layer
// (packages/repop, P11-P13) consumes this contract via useSyncExternalStore.

import type { RepopError } from './errors.js';

/** Closed entity status union (P10 decision 3). */
export type EntityStatus = 'idle' | 'loading' | 'ready' | 'stale' | 'refused';

export interface EntityRecord {
  readonly data: Uint8Array;
  readonly version: number;
  readonly status: EntityStatus;
  /** 64B UnsealedReceipt summary from the worker (wave-1 R3), or null. */
  readonly lastReceipt: Uint8Array | null;
}

/** Whole-state cache: one object identity per committed mutation. */
export interface RepopSnapshot {
  readonly generation: number;
  readonly entities: ReadonlyMap<string, EntityRecord>;
  readonly entityKeys: readonly string[];
  readonly kernelReady: boolean;
}

/** Either-shaped result — the ONLY shape that crosses the async seam. */
export type RepopResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: RepopError };

export interface TransportHandle {
  /** Send raw binary bytes toward the worker. */
  send(bytes: Uint8Array): void;
  /** Subscribe to inbound binary frames; return an unsubscribe fn. */
  subscribe(onFrame: (bytes: Uint8Array) => void): () => void;
}

/** Minimal worker shape the owner manages (real Worker or in-process fake). */
export interface WorkerLike {
  postMessage(message: Uint8Array): void;
  terminate(): void;
  addEventListener(type: 'message', listener: (event: { data: Uint8Array }) => void): void;
}

/** Injectable factory so lifecycle tests never spawn real workers. */
export type WorkerFactory = () => WorkerLike;
