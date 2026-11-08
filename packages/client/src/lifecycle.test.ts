// Lifecycle court: unbooted refusals, boot transition, dispose idempotence,
// worker-owner spawn/terminate idempotence.
import { describe, expect, it } from 'vitest';
import { RepopClientStore } from './store/repopClient.js';
import { RepopNotBootedError } from './errors.js';
import { WorkerOwner } from './worker/owner.js';
import type { WorkerLike } from './types.js';
import { FakeTransport, kernelReadyBytes } from './test-support.js';

describe('boot law', () => {
  it('requestEntity before kernel-ready resolves to RepopNotBootedError, never throws', async () => {
    const transport = new FakeTransport();
    const store = new RepopClientStore({ transport });
    const result = await store.requestEntity('e1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(RepopNotBootedError);
    expect(transport.sent.length).toBe(0);
    expect(store.isKernelReady()).toBe(false);
  });

  it('kernel-ready frame flips readiness and re-emits a new snapshot identity', () => {
    const transport = new FakeTransport();
    const store = new RepopClientStore({ transport });
    const before = store.getSnapshot();
    transport.emit(kernelReadyBytes());
    expect(store.isKernelReady()).toBe(true);
    const after = store.getSnapshot();
    expect(after.kernelReady).toBe(true);
    expect(Object.is(before, after)).toBe(false);
    expect(after.generation).toBe(before.generation + 1);
  });

  it('waitForKernelReady resolves once the frame arrives', async () => {
    const transport = new FakeTransport();
    const store = new RepopClientStore({ transport });
    const pending = store.waitForKernelReady();
    transport.emit(kernelReadyBytes());
    const result = await pending;
    expect(result.ok).toBe(true);
  });

  it('waitForKernelReady resolves immediately when already ready', async () => {
    const transport = new FakeTransport();
    const store = new RepopClientStore({ transport });
    transport.emit(kernelReadyBytes());
    const result = await store.waitForKernelReady();
    expect(result.ok).toBe(true);
  });

  it('dispose rejects in-flight requests with RepopNotBootedError; second dispose is a no-op', async () => {
    const transport = new FakeTransport();
    const store = new RepopClientStore({ transport });
    transport.emit(kernelReadyBytes());
    const pending = store.requestEntity('e1');
    const rejected = store.dispose();
    expect(rejected).toBe(1);
    const result = await pending;
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(RepopNotBootedError);
    expect(store.dispose()).toBe(0);
    expect(() => store.dispose()).not.toThrow();
  });
});

// -- WorkerOwner idempotence (injectable factory, real in-process fake) -----

class FakeWorker implements WorkerLike {
  terminated = false;
  messages: Uint8Array[] = [];
  private listeners = new Set<(event: { data: Uint8Array }) => void>();

  postMessage(m: Uint8Array): void {
    this.messages.push(m.slice());
  }

  terminate(): void {
    this.terminated = true;
  }

  addEventListener(_type: 'message', listener: (event: { data: Uint8Array }) => void): void {
    this.listeners.add(listener);
  }

  emitFromWorker(data: Uint8Array): void {
    for (const l of this.listeners) l({ data });
  }
}

describe('WorkerOwner idempotence', () => {
  it('start() spawns exactly once; every call returns the same handle', () => {
    const created: FakeWorker[] = [];
    const owner = new WorkerOwner({
      factory: () => {
        const w = new FakeWorker();
        created.push(w);
        return w;
      },
    });
    const w1 = owner.start();
    const w2 = owner.start();
    const w3 = owner.start();
    expect(created.length).toBe(1);
    expect(w1).toBe(w2);
    expect(w2).toBe(w3);
    expect(w1).toBe(created[0]);
    expect(owner.isRunning()).toBe(true);
    expect(created[0]?.terminated).toBe(false);
  });

  it('terminate() tears down at most once and is idempotent', () => {
    const created: FakeWorker[] = [];
    const owner = new WorkerOwner({
      factory: () => {
        const w = new FakeWorker();
        created.push(w);
        return w;
      },
    });
    owner.terminate();
    expect(created.length).toBe(0);
    expect(owner.isRunning()).toBe(false);
    owner.start();
    owner.terminate();
    owner.terminate();
    expect(created.length).toBe(1);
    expect(created[0]?.terminated).toBe(true);
    expect(owner.isRunning()).toBe(false);
  });

  it('a fresh start after terminate spawns a new worker', () => {
    let spawns = 0;
    const workers: FakeWorker[] = [];
    const owner = new WorkerOwner({
      factory: () => {
        spawns += 1;
        const w = new FakeWorker();
        workers.push(w);
        return w;
      },
    });
    owner.start();
    owner.terminate();
    owner.start();
    expect(spawns).toBe(2);
    expect(workers.length).toBe(2);
    expect(workers[0]!.terminated).toBe(true);
    expect(workers[1]!.terminated).toBe(false);
  });

  it('owner transport delivers worker messages to subscribers and forwards send', () => {
    const worker = new FakeWorker();
    const owner = new WorkerOwner({ factory: () => worker });
    const t = owner.transport();
    const received: Uint8Array[] = [];
    t.subscribe((b) => received.push(b));
    owner.start();
    t.send(new Uint8Array([1, 2, 3]));
    expect(worker.messages.length).toBe(1);
    worker.emitFromWorker(new Uint8Array([9]));
    expect(received.length).toBe(1);
    expect(received[0]![0]).toBe(9);
    owner.terminate();
    // Send after terminate is a no-op discard (fail-closed at store layer).
    expect(() => t.send(new Uint8Array([4]))).not.toThrow();
    expect(worker.messages.length).toBe(1);
  });
});
