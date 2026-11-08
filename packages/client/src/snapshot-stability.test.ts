// Snapshot-stability court (P10 gate 1) + mutation legs e/f (non-vacuity).
// Leg e: an in-place-commit mutant must violate the identity court.
// Leg f: an allocating-empty mutant must violate the EMPTY-identity court.
import { describe, expect, it } from 'vitest';
import { RepopClientStore } from './store/repopClient.js';
import { EMPTY_ENTITIES, EMPTY_ENTITY_LIST, SERVER_SNAPSHOT } from './store/empty.js';
import { FakeTransport, receiptBytes } from './test-support.js';

function makeStore(): { store: RepopClientStore; transport: FakeTransport } {
  const transport = new FakeTransport();
  const store = new RepopClientStore({ transport });
  return { store, transport };
}

describe('snapshot stability', () => {
  it('returns the same identity across reads with no mutation', () => {
    const { store } = makeStore();
    const s1 = store.getSnapshot();
    const s2 = store.getSnapshot();
    expect(Object.is(s1, s2)).toBe(true);
  });

  it('empty state uses the module-level EMPTY constants (no allocation)', () => {
    const { store } = makeStore();
    const snap = store.getSnapshot();
    expect(Object.is(snap.entities, EMPTY_ENTITIES)).toBe(true);
    expect(Object.is(snap.entityKeys, EMPTY_ENTITY_LIST)).toBe(true);
    expect(snap.generation).toBe(0);
    expect(snap.kernelReady).toBe(false);
  });

  it('getServerSnapshot is the SERVER_SNAPSHOT constant, always', () => {
    const { store } = makeStore();
    expect(Object.is(store.getServerSnapshot(), SERVER_SNAPSHOT)).toBe(true);
    store.upsertEntity('e1', new Uint8Array([1]), 1);
    expect(Object.is(store.getServerSnapshot(), SERVER_SNAPSHOT)).toBe(true);
  });

  it('a mutation produces a NEW identity and bumps generation; listener notified once', () => {
    const { store } = makeStore();
    const before = store.getSnapshot();
    let notifications = 0;
    store.subscribe(() => {
      notifications += 1;
    });
    const up = store.upsertEntity('e1', new Uint8Array([1, 2, 3]), 1, receiptBytes(0x11));
    expect(up.ok).toBe(true);
    const after = store.getSnapshot();
    expect(Object.is(before, after)).toBe(false);
    expect(after.generation).toBe(before.generation + 1);
    expect(notifications).toBe(1);
    // Further reads keep the post-mutation identity (stable until next commit).
    expect(Object.is(after, store.getSnapshot())).toBe(true);
  });

  it('immutable replace: the previously emitted snapshot is never edited in place', () => {
    const { store } = makeStore();
    const before = store.getSnapshot();
    store.upsertEntity('e1', new Uint8Array([1]), 1);
    const after = store.getSnapshot();
    // The old snapshot still has zero entities; the new one has one.
    expect(before.entities.size).toBe(0);
    expect(after.entities.size).toBe(1);
    expect(Object.is(before.entities, after.entities)).toBe(false);
  });

  // -- MUTATION LEGS (non-vacuity: the court must be able to FAIL) ----------

  it('mutation leg e: an in-place-commit mutant violates the identity court', () => {
    // Mutant: commit reuses the previous snapshot object (in-place mutation).
    class InPlaceMutantStore extends RepopClientStore {
      protected override commit(): void {
        // Deliberately does NOT allocate a new snapshot: identity stays.
      }
    }
    const transport = new FakeTransport();
    const mutant = new InPlaceMutantStore({ transport });
    const before = mutant.getSnapshot();
    mutant.upsertEntity('e1', new Uint8Array([1]), 1);
    const after = mutant.getSnapshot();
    // The court's condition (identity must change) does NOT hold on the mutant:
    expect(Object.is(before, after)).toBe(true);
    // …and the entities observable is stale (mutation invisible):
    expect(after.entities.size).toBe(0);
  });

  it('mutation leg f: an allocating-empty mutant violates the EMPTY-identity court', () => {
    // Mutant: empty state allocates a fresh Map per read instead of the
    // module-level constant — exactly the useSyncExternalStore loop bug.
    class AllocatingEmptyMutantStore extends RepopClientStore {
      override getSnapshot() {
        const real = super.getSnapshot();
        if (real.entities.size === 0) {
          return { ...real, entities: new Map() };
        }
        return real;
      }
    }
    const transport = new FakeTransport();
    const mutant = new AllocatingEmptyMutantStore({ transport });
    const s1 = mutant.getSnapshot();
    const s2 = mutant.getSnapshot();
    // The court's condition (empty identity must be the shared constant) does
    // NOT hold on the mutant:
    expect(Object.is(s1.entities, EMPTY_ENTITIES)).toBe(false);
    expect(Object.is(s1, s2)).toBe(false);
    // The real store passes the same court:
    const { store } = makeStore();
    expect(Object.is(store.getSnapshot().entities, EMPTY_ENTITIES)).toBe(true);
  });
});
