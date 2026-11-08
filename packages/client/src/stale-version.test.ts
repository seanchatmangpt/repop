// Stale-version court: typed refusal, no silent overwrite, no state change.
import { describe, expect, it } from 'vitest';
import { encodeFrame, FRAME_KIND } from './protocol/frames.js';
import { RepopClientStore } from './store/repopClient.js';
import { StaleVersionError } from './errors.js';
import {
  FakeTransport,
  kernelReadyBytes,
  requestCorrId,
  receiptBytes,
} from './test-support.js';

function makeStore(): { store: RepopClientStore; transport: FakeTransport } {
  const transport = new FakeTransport();
  const store = new RepopClientStore({ transport });
  transport.emit(kernelReadyBytes());
  return { store, transport };
}

describe('stale-version law', () => {
  it('rejects a lower-or-equal upsert with StaleVersionError, no state change', () => {
    const { store } = makeStore();
    const first = store.upsertEntity('e1', new Uint8Array([1]), 1);
    expect(first.ok).toBe(true);
    const before = store.getSnapshot();
    const second = store.upsertEntity('e1', new Uint8Array([9]), 1);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      const e = second.error;
      expect(e).toBeInstanceOf(StaleVersionError);
      if (e instanceof StaleVersionError) {
        expect(e.entityKey).toBe('e1');
        expect(e.currentVersion).toBe(1);
        expect(e.rejectedVersion).toBe(1);
      }
    }
    expect(Object.is(store.getSnapshot(), before)).toBe(true);
    expect(store.getSnapshot().generation).toBe(before.generation);
  });

  it('rejects a version regressing across commits', () => {
    const { store } = makeStore();
    expect(store.upsertEntity('e1', new Uint8Array([1]), 3).ok).toBe(true);
    const before = store.getSnapshot();
    const regressed = store.upsertEntity('e1', new Uint8Array([2]), 2);
    expect(regressed.ok).toBe(false);
    if (!regressed.ok && regressed.error instanceof StaleVersionError) {
      expect(regressed.error.currentVersion).toBe(3);
      expect(regressed.error.rejectedVersion).toBe(2);
    }
    expect(Object.is(store.getSnapshot(), before)).toBe(true);
  });

  it('a stale receipt resolves the waiter with the typed error and keeps state', async () => {
    const { store, transport } = makeStore();
    const fresh = await (async () => {
      const p = store.requestEntity('e1');
      transport.emit(
        encodeFrame({
          kind: FRAME_KIND.Receipt,
          corrId: requestCorrId(transport.sent[0]!),
          entityKey: 'e1',
          version: 2,
          receipt: receiptBytes(2),
        }),
      );
      return p;
    })();
    expect(fresh.ok).toBe(true);

    const p2 = store.requestEntity('e1');
    transport.emit(
      encodeFrame({
        kind: FRAME_KIND.Receipt,
        corrId: requestCorrId(transport.sent[1]!),
        entityKey: 'e1',
        version: 1,
        receipt: receiptBytes(3),
      }),
    );
    const stale = await p2;
    expect(stale.ok).toBe(false);
    if (!stale.ok) {
      expect(stale.error).toBeInstanceOf(StaleVersionError);
    }
    const snap = store.getSnapshot();
    expect(snap.entities.get('e1')?.version).toBe(2);
    expect(snap.entities.get('e1')?.lastReceipt?.[0]).toBe(2);
  });
});
