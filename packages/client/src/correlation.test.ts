// Correlation court: settle/refuse paths, unknown corrId, typed errors —
// every failure is an Either, never a throw, never a silent state change.
import { describe, expect, it } from 'vitest';
import { CorrelationMap } from './protocol/correlate.js';
import { RepopClientStore } from './store/repopClient.js';
import { encodeFrame, FRAME_KIND, REFUSAL_CODE, RECEIPT_BYTES } from './protocol/frames.js';
import { BreachError, StaleVersionError, WorkerRefusalError } from './errors.js';
import { FakeClock, FakeTransport, kernelReadyBytes, receiptBytes, requestCorrId } from './test-support.js';

describe('CorrelationMap', () => {
  it('settle resolves the registered waiter; unknown corrId returns false', () => {
    const map = new CorrelationMap();
    let resolved = false;
    map.register({
      corrId: 7,
      entityKey: 'e1',
      timeoutMs: 1000,
      resolve: () => {
        resolved = true;
      },
      reject: () => {},
    });
    expect(map.settle(7)).toBe(true);
    expect(resolved).toBe(true);
    expect(map.settle(7)).toBe(false);
    expect(map.refuse(99, new StaleVersionError('e', 1, 0))).toBe(false);
  });

  it('refuse rejects with the typed error and consumes the corrId', () => {
    const map = new CorrelationMap();
    let caught: unknown;
    map.register({
      corrId: 1,
      entityKey: 'e1',
      timeoutMs: 1000,
      resolve: () => {},
      reject: (e) => {
        caught = e;
      },
    });
    const refusal = new WorkerRefusalError(1, REFUSAL_CODE.UnknownEntity, 'no such entity');
    expect(map.refuse(1, refusal)).toBe(true);
    expect(caught).toBe(refusal);
    expect(map.has(1)).toBe(false);
  });

  it('sweep rejects only past-deadline entries and returns their corrIds', () => {
    const clock = new FakeClock();
    const map = new CorrelationMap(clock.now);
    const outcomes = new Map<number, string>();
    for (const [corrId, timeoutMs] of [[1, 100], [2, 500]] as const) {
      map.register({
        corrId,
        entityKey: `e${corrId}`,
        timeoutMs,
        resolve: () => outcomes.set(corrId, 'ok'),
        reject: () => outcomes.set(corrId, 'timeout'),
      });
    }
    clock.advance(200);
    expect(map.sweep()).toEqual([1]);
    expect(outcomes.get(1)).toBe('timeout');
    expect(outcomes.get(2)).toBeUndefined();
    expect(map.size).toBe(1);
    clock.advance(400);
    expect(map.sweep()).toEqual([2]);
    expect(map.size).toBe(0);
  });
});

describe('store request/receipt correlation', () => {
  it('requestEntity sends a correlated frame and resolves on the receipt', async () => {
    const transport = new FakeTransport();
    const store = new RepopClientStore({ transport });
    transport.emit(kernelReadyBytes());
    const promise = store.requestEntity('widget-1');
    expect(transport.sent.length).toBe(1);
    const corrId = requestCorrId(transport.sent[0]!);
    transport.emit(
      encodeFrame({
        kind: FRAME_KIND.Receipt,
        corrId,
        entityKey: 'widget-1',
        version: 3,
        receipt: receiptBytes(0x42),
      }),
    );
    const result = await promise;
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('ready');
      expect(result.value.version).toBe(3);
      expect(result.value.lastReceipt?.length).toBe(RECEIPT_BYTES);
      expect(result.value.lastReceipt?.[0]).toBe(0x42);
    }
    // Final state: entity committed once.
    const snap = store.getSnapshot();
    expect(snap.entities.get('widget-1')?.version).toBe(3);
    expect(snap.entityKeys).toEqual(['widget-1']);
  });

  it('a refusal frame resolves the waiter with WorkerRefusalError (no throw)', async () => {
    const transport = new FakeTransport();
    const store = new RepopClientStore({ transport });
    transport.emit(kernelReadyBytes());
    const promise = store.requestEntity('gone');
    const corrId = requestCorrId(transport.sent[0]!);
    transport.emit(
      encodeFrame({
        kind: FRAME_KIND.Refusal,
        corrId,
        code: REFUSAL_CODE.UnknownEntity,
        message: 'no such entity',
      }),
    );
    const result = await promise;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(WorkerRefusalError);
      expect(result.error.name).toBe('WorkerRefusalError');
    }
    // No silent state change: nothing was committed.
    expect(store.getSnapshot().entities.size).toBe(0);
  });

  it('a receipt with an unknown corrId still applies the valid write and reports ok', () => {
    const transport = new FakeTransport();
    const store = new RepopClientStore({ transport });
    transport.emit(kernelReadyBytes());
    const before = store.getSnapshot();
    const result = store.handleFrame(
      encodeFrame({
        kind: FRAME_KIND.Receipt,
        corrId: 999,
        entityKey: 'unsolicited',
        version: 1,
        receipt: receiptBytes(1),
      }),
    );
    expect(result.ok).toBe(true);
    expect(store.getSnapshot().entities.get('unsolicited')?.version).toBe(1);
    expect(store.getSnapshot().generation).toBe(before.generation + 1);
  });

  it('a refusal with an unknown corrId is a typed refusal, state unchanged', () => {
    const transport = new FakeTransport();
    const store = new RepopClientStore({ transport });
    const before = store.getSnapshot();
    const result = store.handleFrame(
      encodeFrame({
        kind: FRAME_KIND.Refusal,
        corrId: 4242,
        code: REFUSAL_CODE.WorkerBusy,
        message: 'busy',
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(WorkerRefusalError);
    expect(Object.is(store.getSnapshot(), before)).toBe(true);
  });

  it('a breach frame rejects the correlated waiter with BreachError', async () => {
    const transport = new FakeTransport();
    const store = new RepopClientStore({ transport });
    transport.emit(kernelReadyBytes());
    const promise = store.requestEntity('x');
    const corrId = requestCorrId(transport.sent[0]!);
    transport.emit(
      encodeFrame({ kind: FRAME_KIND.Breach, corrId, code: 0x7f, message: 'ring overrun' }),
    );
    const result = await promise;
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(BreachError);
    // No state change on breach.
    expect(store.getSnapshot().entities.size).toBe(0);
  });

  it('inbound activity sweeps expired deadlines (no timers)', async () => {
    const clock = new FakeClock();
    const transport = new FakeTransport();
    const store = new RepopClientStore({ transport, now: clock.now, timeoutMs: 100 });
    transport.emit(kernelReadyBytes());
    const promise = store.requestEntity('slow');
    clock.advance(500);
    // Any inbound frame triggers the sweep; kernel-ready is cheap here.
    transport.emit(kernelReadyBytes(1));
    const result = await promise;
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.name).toBe('TimeoutError');
  });
});
