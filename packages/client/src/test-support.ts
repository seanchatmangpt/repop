// Chicago test collaborators: real in-process fakes (hand-written real
// implementations of owned interfaces — NOT mocks). No vi.mock/jest.mock.
import type { TransportHandle } from './types.js';
import { encodeFrame, FRAME_KIND, RECEIPT_BYTES } from './protocol/frames.js';

/** Real in-process transport: records sent bytes, replays inbound frames. */
export class FakeTransport implements TransportHandle {
  readonly sent: Uint8Array[] = [];
  readonly closed = { value: false };
  private readonly listeners = new Set<(bytes: Uint8Array) => void>();

  send(bytes: Uint8Array): void {
    if (this.closed.value) {
      throw new Error('FakeTransport: send after close');
    }
    this.sent.push(bytes.slice());
  }

  subscribe(onFrame: (bytes: Uint8Array) => void): () => void {
    this.listeners.add(onFrame);
    return () => {
      this.listeners.delete(onFrame);
    };
  }

  /** Simulate the worker emitting a frame. */
  emit(bytes: Uint8Array): void {
    for (const listener of [...this.listeners]) {
      listener(bytes);
    }
  }

  close(): void {
    this.closed.value = true;
  }
}

/** Injected deterministic clock (no-sleep law: deadlines, never waits). */
export class FakeClock {
  private t = 0;
  now = (): number => this.t;
  advance(ms: number): void {
    this.t += ms;
  }
}

export function receiptBytes(fill = 0xa5): Uint8Array {
  const b = new Uint8Array(RECEIPT_BYTES);
  b.fill(fill);
  return b;
}

export function kernelReadyBytes(corrId = 0): Uint8Array {
  return encodeFrame({ kind: FRAME_KIND.KernelReady, corrId });
}

/** Decode the corrId of an outbound request frame (client-only kind 0x10). */
export function requestCorrId(sent: Uint8Array): number {
  const dv = new DataView(sent.buffer, sent.byteOffset, sent.byteLength);
  return dv.getUint32(1, false);
}
