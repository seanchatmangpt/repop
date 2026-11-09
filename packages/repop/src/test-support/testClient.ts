/**
 * Real in-process RepopClient collaborator for tests (Chicago law).
 */

import type {
  RepopClient,
  RepopEntitySlice,
  RepopIntent,
  RepopSnapshot,
  RepopSolveRequest,
  RepopSolveResult,
} from "../types.js";
import type { RepopRefusal } from "../errors.js";

interface TestState {
  version: number;
  data: unknown;
  refusal: RepopRefusal | null;
}

export class TestRepopClient implements RepopClient {
  private readonly listeners = new Set<() => void>();
  private readonly states = new Map<string, TestState>();
  private snapshot: RepopSnapshot;

  constructor() {
    this.snapshot = Object.freeze({
      status: "idle",
      entities: new Map<string, RepopEntitySlice>(),
      projections: [] as const,
    });
  }

  subscribe(onStoreChange: () => void): () => void {
    this.listeners.add(onStoreChange);
    return () => {
      this.listeners.delete(onStoreChange);
    };
  }

  getSnapshot(): RepopSnapshot {
    return this.snapshot;
  }

  async bootstrap(): Promise<void> {}

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  /** Test driver: replace entity state with a NEW snapshot identity. */
  putEntity(entityId: string, version: number, data: unknown): void {
    this.states.set(entityId, { version, data, refusal: null });
    const entities = new Map(this.snapshot.entities);
    entities.set(entityId, {
      entityId,
      version,
      lastRefusal: null,
      data,
    });
    this.snapshot = Object.freeze({ ...this.snapshot, entities });
    this.notify();
  }

  async commitIntent(
    entityId: string,
    _intent: RepopIntent,
    expectedVersion: number,
  ): Promise<
    { ok: true; newVersion: number } | { ok: false; refusal: RepopRefusal }
  > {
    const state = this.states.get(entityId);
    const current = state === undefined ? 0 : state.version;
    if (expectedVersion !== current) {
      return {
        ok: false,
        refusal: {
          class: "STALE_VERSION",
          expected: expectedVersion,
          observed: current,
        },
      };
    }
    const newVersion = current + 1;
    this.putEntity(entityId, newVersion, state === undefined ? null : state.data);
    return { ok: true, newVersion };
  }

  async solve(_request: RepopSolveRequest): Promise<RepopSolveResult> {
    return {
      ok: false,
      refusal: { class: "WORKER_REFUSED", detail: "test client: no solver mirror" },
    };
  }

  dispose(): void {
    this.disposed = true;
  }

  /** Test driver: publish a partial snapshot change with NEW identity. */
  publish(partial: Partial<RepopSnapshot>): void {
    this.snapshot = Object.freeze({ ...this.snapshot, ...partial });
    this.notify();
  }

  disposed = false;
}

