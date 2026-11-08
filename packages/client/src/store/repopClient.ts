// RepopClientStore — the only state authority above the worker.
//
// React-free external store (useSyncExternalStore-compatible):
//   subscribe(listener)     -> unsubscribe
//   getSnapshot()           -> same identity until a real mutation
//   getServerSnapshot()     -> SERVER_SNAPSHOT module constant
//
// Whole-state cache with generation bump: every committed mutation produces a
// NEW frozen snapshot object (immutable replace per entity — previously
// emitted snapshots are never edited in place). Fail-closed: every failure
// crossing the async seam is an Either-shaped RepopResult, never a throw, and
// never a silent state change.
//
// UNVERIFIED-vs-C9: outbound request frames use client-only kind 0x10 until
// P9's outbound contract lands.

import {
  BreachError,
  RepopNotBootedError,
  StaleVersionError,
  UnknownFrameError,
  WorkerRefusalError,
} from '../errors.js';
import { decodeFrame } from '../protocol/decode.js';
import { CorrelationMap } from '../protocol/correlate.js';
import {
  CORR_ID_BYTES,
  FRAME_KIND,
  KIND_BYTES,
  LENGTH_BYTES,
  type ReceiptFrame,
  type RefusalFrame,
} from '../protocol/frames.js';
import { EMPTY_ENTITIES, EMPTY_ENTITY_LIST, SERVER_SNAPSHOT } from './empty.js';
import type {
  EntityRecord,
  RepopResult,
  RepopSnapshot,
  TransportHandle,
} from '../types.js';

const KERNEL_READY_SENTINEL = '::kernel-ready::';
const REQUEST_KIND = 0x10; // UNVERIFIED-vs-C9 outbound kind
const DEFAULT_TIMEOUT_MS = 30_000;

export interface RepopClientOptions {
  /** Injected transport (P11 owns worker boot; the client never spawns). */
  readonly transport: TransportHandle;
  /** Correlation timeout, clock units, injected. Default 30_000. */
  readonly timeoutMs?: number;
  /** Injected clock for deadline math (tests pass a fake; no-sleep law). */
  readonly now?: () => number;
}

export class RepopClientStore {
  private readonly listeners = new Set<() => void>();
  private readonly correlations: CorrelationMap;
  private readonly transport: TransportHandle;
  private readonly defaultTimeoutMs: number;
  private readonly kernelWaiterCorrIds = new Set<number>();
  private readonly unsubTransport: () => void;
  private nextCorrId = 1;
  private kernelReady = false;
  private entities: ReadonlyMap<string, EntityRecord> = EMPTY_ENTITIES;
  private entityKeys: readonly string[] = EMPTY_ENTITY_LIST;
  private generation = 0;
  private cachedSnapshot: RepopSnapshot = SERVER_SNAPSHOT;

  constructor(opts: RepopClientOptions) {
    this.transport = opts.transport;
    this.defaultTimeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.correlations = new CorrelationMap(opts.now);
    this.unsubTransport = this.transport.subscribe((bytes) => {
      this.handleFrame(bytes);
    });
  }

  // -- External store contract -------------------------------------------

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Same object identity until a real mutation (selector contract, empty.ts). */
  getSnapshot(): RepopSnapshot {
    return this.cachedSnapshot;
  }

  /** Module-level constant — server render identity-stable. */
  getServerSnapshot(): RepopSnapshot {
    return SERVER_SNAPSHOT;
  }

  // -- Lifecycle -----------------------------------------------------------

  /** Rejects all in-flight requests, detaches from the transport. Idempotent. */
  dispose(): number {
    this.unsubTransport();
    const rejected = this.correlations.rejectAll(
      new RepopNotBootedError('store disposed; in-flight requests rejected'),
    );
    for (const corrId of this.kernelWaiterCorrIds) {
      void this.correlations.refuse(
        corrId,
        new RepopNotBootedError('store disposed; kernel-ready waiter rejected'),
      );
    }
    this.kernelWaiterCorrIds.clear();
    this.listeners.clear();
    return rejected;
  }

  isKernelReady(): boolean {
    return this.kernelReady;
  }

  /**
   * Resolves (Either) once a kernel-ready frame has been applied, or with a
   * TimeoutError if the injected deadline passes first. Deadline sweeps ride
   * on inbound-frame activity and sweepNow — no timers, no sleeps.
   */
  waitForKernelReady(timeoutMs: number = this.defaultTimeoutMs): Promise<RepopResult<void>> {
    if (this.kernelReady) {
      return Promise.resolve({ ok: true, value: undefined });
    }
    const corrId = this.nextCorrId++;
    this.kernelWaiterCorrIds.add(corrId);
    return new Promise((resolve) => {
      this.correlations.register({
        corrId,
        entityKey: KERNEL_READY_SENTINEL,
        timeoutMs,
        resolve: () => resolve({ ok: true, value: undefined }),
        reject: (error) => resolve({ ok: false, error }),
      });
    });
  }

  // -- Requests ------------------------------------------------------------

  /**
   * Request an entity from the worker. Never throws: unbooted, refusal,
   * timeout and stale paths all resolve to typed Eithers.
   */
  requestEntity(entityKey: string): Promise<RepopResult<EntityRecord>> {
    if (!this.kernelReady) {
      return Promise.resolve({ ok: false, error: new RepopNotBootedError() });
    }
    const corrId = this.nextCorrId++;
    this.transport.send(encodeRequest(entityKey, corrId));
    return new Promise((resolve) => {
      this.correlations.register({
        corrId,
        entityKey,
        timeoutMs: this.defaultTimeoutMs,
        resolve: () => {
          const record = this.entities.get(entityKey);
          if (record === undefined) {
            // Settled but no committed record — fail closed, typed.
            resolve({
              ok: false,
              error: new StaleVersionError(entityKey, -1, -1),
            });
          } else {
            resolve({ ok: true, value: record });
          }
        },
        reject: (error) => resolve({ ok: false, error }),
      });
    });
  }

  // -- Inbound frames ------------------------------------------------------

  /** Entry point for raw transport bytes. Never throws. */
  handleFrame(bytes: Uint8Array): RepopResult<'applied' | 'settled' | 'ignored'> {
    // Deadline sweep rides on inbound activity — no timers.
    this.correlations.sweep();
    const decoded = decodeFrame(bytes);
    if (!decoded.ok) return decoded;
    const frame = decoded.value;
    switch (frame.kind) {
      case FRAME_KIND.KernelReady: {
        this.kernelReady = true;
        for (const corrId of this.kernelWaiterCorrIds) {
          void this.correlations.settle(corrId);
        }
        this.kernelWaiterCorrIds.clear();
        // Readiness is a state transition: re-commit so useSyncExternalStore
        // subscribers observe kernelReady=true with a new snapshot identity.
        this.commit(this.entities);
        return { ok: true, value: 'applied' };
      }
      case FRAME_KIND.Receipt:
        return this.applyReceipt(frame);
      case FRAME_KIND.Refusal:
        return this.applyRefusal(frame);
      case FRAME_KIND.Breach: {
        // Fail-closed: reject the correlated request (if any); no state change.
        void this.correlations.refuse(
          frame.corrId,
          new BreachError(`worker breach 0x${frame.code.toString(16)}: ${frame.message}`),
        );
        return { ok: true, value: 'ignored' };
      }
      default:
        return {
          ok: false,
          error: new UnknownFrameError((frame as { kind: number }).kind),
        };
    }
  }

  // -- Local writes --------------------------------------------------------

  /**
   * Local entity write (e.g. optimistic update). Immutable replace; a version
   * that would clobber a newer record is a typed StaleVersionError with no
   * state change.
   */
  upsertEntity(
    entityKey: string,
    data: Uint8Array,
    version: number,
    receipt: Uint8Array | null = null,
  ): RepopResult<void> {
    const existing = this.entities.get(entityKey);
    if (existing !== undefined && version <= existing.version) {
      return {
        ok: false,
        error: new StaleVersionError(entityKey, existing.version, version),
      };
    }
    const record: EntityRecord = {
      data,
      version,
      status: 'ready',
      lastReceipt: receipt,
    };
    const next = new Map(this.entities);
    next.set(entityKey, record);
    this.commit(next);
    return { ok: true, value: undefined };
  }

  // -- Sweeps ----------------------------------------------------------------

  /** Explicit deadline sweep (tests inject deadlines; production rides on frames). */
  sweepNow(): number[] {
    return this.correlations.sweep();
  }

  // -- Internals --------------------------------------------------------------

  private applyReceipt(frame: ReceiptFrame): RepopResult<'settled'> {
    const existing = this.entities.get(frame.entityKey);
    if (existing !== undefined && frame.version <= existing.version) {
      // Stale receipt: settle the waiter with the typed error, keep state.
      const staleError = new StaleVersionError(frame.entityKey, existing.version, frame.version);
      void this.correlations.refuse(frame.corrId, staleError);
      return { ok: false, error: staleError };
    }
    const record: EntityRecord = {
      data: new Uint8Array(0),
      version: frame.version,
      status: 'ready',
      lastReceipt: frame.receipt,
    };
    const next = new Map(this.entities);
    next.set(frame.entityKey, record);
    this.commit(next);
    // Settle AFTER commit so the waiter's resolve reads the new snapshot.
    if (!this.correlations.settle(frame.corrId)) {
      // Unknown corrId: the write itself was valid and is applied; report ok —
      // a vanished waiter is not a wire fault.
      return { ok: true, value: 'settled' };
    }
    return { ok: true, value: 'settled' };
  }

  private applyRefusal(frame: RefusalFrame): RepopResult<'settled'> {
    const refusal = new WorkerRefusalError(frame.corrId, frame.code, frame.message);
    // Fail-closed: reject the waiter with the typed refusal; a refusal whose
    // corrId has no waiter surfaces as the same typed refusal in the Either
    // (never a silent swallow). No state changes either way.
    const refused = this.correlations.refuse(frame.corrId, refusal);
    return refused ? { ok: true, value: 'settled' } : { ok: false, error: refusal };
  }

  /** Immutable whole-state commit: new snapshot object, generation bump, notify.
   * Protected so mutation-leg tests can subclass and violate the court. */
  protected commit(next: ReadonlyMap<string, EntityRecord>): void {
    this.entities = next;
    this.entityKeys = Object.freeze([...next.keys()].sort());
    this.generation += 1;
    this.cachedSnapshot = Object.freeze({
      generation: this.generation,
      entities: next,
      entityKeys: this.entityKeys,
      kernelReady: this.kernelReady,
    });
    for (const listener of this.listeners) {
      listener();
    }
  }
}

// Outbound request frames reuse the wire header with client-only kind 0x10
// (UNVERIFIED-vs-C9): kind(1) corrId(4) payloadLen(4) keyLen(2) key(utf8).
function encodeRequest(entityKey: string, corrId: number): Uint8Array {
  const keyBytes = new TextEncoder().encode(entityKey);
  const out = new Uint8Array(KIND_BYTES + CORR_ID_BYTES + LENGTH_BYTES + 2 + keyBytes.length);
  const dv = new DataView(out.buffer);
  dv.setUint8(0, REQUEST_KIND);
  dv.setUint32(1, corrId, false);
  dv.setUint32(5, 2 + keyBytes.length, false);
  dv.setUint16(9, keyBytes.length, false);
  out.set(keyBytes, KIND_BYTES + CORR_ID_BYTES + LENGTH_BYTES + 2);
  return out;
}
