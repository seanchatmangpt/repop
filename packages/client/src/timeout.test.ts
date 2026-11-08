// Timeout court: injected deadlines and clock — no sleeps, no real timers.
import { describe, expect, it } from 'vitest';
import { RepopClientStore } from './store/repopClient.js';
import { TimeoutError } from './errors.js';
import { FakeClock, FakeTransport, kernelReadyBytes } from './test-support.js';

describe('deadline sweep', () => {
  it('waitForKernelReady rejects with TimeoutError once past its injected deadline', async () => {
    const clock = new FakeClock();
    const transport = new FakeTransport();
    const store = new RepopClientStore({ transport, now: clock.now });
    const pending = store.waitForKernelReady(100);
    clock.advance(101);
    const expired = store.sweepNow();
    expect(expired.length).toBe(1);
    const result = await pending;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(TimeoutError);
      expect(result.error.name).toBe('TimeoutError');
    }
  });

  it('a kernel-ready frame BEFORE the deadline resolves the waiter successfully', async () => {
    const clock = new FakeClock();
    const transport = new FakeTransport();
    const store = new RepopClientStore({ transport, now: clock.now });
    const pending = store.waitForKernelReady(1000);
    transport.emit(kernelReadyBytes());
    const result = await pending;
    expect(result.ok).toBe(true);
  });

  it('requestEntity times out through sweepNow when the worker never answers', async () => {
    const clock = new FakeClock();
    const transport = new FakeTransport();
    const store = new RepopClientStore({ transport, now: clock.now, timeoutMs: 100 });
    transport.emit(kernelReadyBytes());
    const pending = store.requestEntity('slow');
    clock.advance(101);
    const expired = store.sweepNow();
    expect(expired.length).toBe(1);
    const result = await pending;
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(TimeoutError);
    // State unchanged: no entity committed.
    expect(store.getSnapshot().entities.size).toBe(0);
  });

  it('an unexpired request is untouched by the sweep', async () => {
    const clock = new FakeClock();
    const transport = new FakeTransport();
    const store = new RepopClientStore({ transport, now: clock.now, timeoutMs: 1000 });
    transport.emit(kernelReadyBytes());
    const pending = store.requestEntity('fast');
    clock.advance(10);
    expect(store.sweepNow().length).toBe(0);
    // Clean up: dispose rejects the still-pending waiter deterministically.
    store.dispose();
    const result = await pending;
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.name).toBe('RepopNotBootedError');
  });
});
