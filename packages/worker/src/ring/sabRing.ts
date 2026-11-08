/**
 * SPSC ring over a SharedArrayBuffer using the WIR0 slot format.
 * Control page = leading slot; cursors move only via Atomics.
 * Publish = Release store of the write cursor; read = Acquire load.
 */

import {
  CONTROL_BYTES,
  CTRL_CAPACITY,
  CTRL_DROPPED,
  CTRL_READ,
  CTRL_READY,
  CTRL_WRAPPED,
  CTRL_WRITE,
  SLOT_SIZE,
} from "./constants.ts";
import { stampHeader, validateHeader, readFrameInto } from "./wireRing.ts";
import { err, ok, type RingResult } from "./errors.ts";

const INT32S_PER_SLOT = SLOT_SIZE / 4;

/** SAB sized for a ring of `slotCount` slots plus the control page. */
export function allocSab(slotCount: number): SharedArrayBuffer {
  if (!Number.isInteger(slotCount) || slotCount < 2) {
    throw new Error(`slotCount must be an integer >= 2, got ${slotCount}`);
  }
  return new SharedArrayBuffer(CONTROL_BYTES + slotCount * SLOT_SIZE);
}

export class SabRing {
  readonly sab: SharedArrayBuffer;
  readonly slotCount: number;
  readonly #ctrl: Int32Array;

  constructor(sab: SharedArrayBuffer, opts?: { init?: boolean }) {
    if (sab.byteLength <= CONTROL_BYTES) {
      throw new Error(`SAB too small (${sab.byteLength})`);
    }
    const tail = sab.byteLength - CONTROL_BYTES;
    if (tail % SLOT_SIZE !== 0) {
      throw new Error(`SAB tail ${tail} not a multiple of SLOT_SIZE`);
    }
    this.sab = sab;
    this.slotCount = tail / SLOT_SIZE;
    this.#ctrl = new Int32Array(sab, 0, INT32S_PER_SLOT);
    if (opts?.init === true) {
      Atomics.store(this.#ctrl, CTRL_CAPACITY, this.slotCount);
      Atomics.store(this.#ctrl, CTRL_READY, 1);
    }
  }

  #capacity(): RingResult<number> {
    const cap = Atomics.load(this.#ctrl, CTRL_CAPACITY);
    if (cap !== this.slotCount) {
      return err("BAD_CAPACITY", "control-page capacity mismatch", cap, this.slotCount);
    }
    return ok(cap);
  }

  /** Producer step 1: claim a slot view to write into. */
  claimPayload(): RingResult<Uint8Array> {
    const cap = this.#capacity();
    if (!cap.ok) return cap;
    const w = Atomics.load(this.#ctrl, CTRL_WRITE);
    const r = Atomics.load(this.#ctrl, CTRL_READ);
    if (w - r >= this.slotCount) {
      return err("FULL", "ring is full", w - r, this.slotCount);
    }
    const index = w % this.slotCount;
    const off = CONTROL_BYTES + index * SLOT_SIZE;
    return ok(new Uint8Array(this.sab, off, SLOT_SIZE));
  }

  /** Producer step 2: stamp WIR0 header, then Release-store the cursor. */
  commit(claimed: Uint8Array, payload: Uint8Array, ordinal: number): RingResult<number> {
    const cap = this.#capacity();
    if (!cap.ok) return cap;
    const stamped = stampHeader(claimed, payload, ordinal);
    if (!stamped.ok) return stamped;
    const w = Atomics.load(this.#ctrl, CTRL_WRITE);
    Atomics.store(this.#ctrl, CTRL_WRITE, w + 1);
    return ok(w + 1);
  }

  /** Producer convenience: claim + commit in one call. */
  publish(payload: Uint8Array, ordinal: number): RingResult<number> {
    const slot = this.claimPayload();
    if (!slot.ok) return slot;
    return this.commit(slot.value, payload, ordinal);
  }

  /** Frames available to the consumer. */
  available(): number {
    return Atomics.load(this.#ctrl, CTRL_WRITE) - Atomics.load(this.#ctrl, CTRL_READ);
  }

  /** Consumer: Acquire-load, validate, copy payload, Release-store cursor. */
  read(dest: Uint8Array): RingResult<number> {
    const cap = this.#capacity();
    if (!cap.ok) return cap;
    const r = Atomics.load(this.#ctrl, CTRL_READ);
    const w = Atomics.load(this.#ctrl, CTRL_WRITE);
    if (r >= w) return err("EMPTY", "ring is empty", r, w);
    const index = r % this.slotCount;
    const slot = new Uint8Array(this.sab, CONTROL_BYTES + index * SLOT_SIZE, SLOT_SIZE);
    const n = readFrameInto(dest, slot, r);
    if (!n.ok) return n;
    Atomics.store(this.#ctrl, CTRL_READ, r + 1);
    return ok(n.value);
  }

  /** Consumer: validate the next frame without copying. */
  peek(): RingResult<number> {
    const cap = this.#capacity();
    if (!cap.ok) return cap;
    const r = Atomics.load(this.#ctrl, CTRL_READ);
    const w = Atomics.load(this.#ctrl, CTRL_WRITE);
    if (r >= w) return err("EMPTY", "ring is empty", r, w);
    const index = r % this.slotCount;
    const slot = new Uint8Array(this.sab, CONTROL_BYTES + index * SLOT_SIZE, SLOT_SIZE);
    return validateHeader(slot, r);
  }

  dropped(): number {
    return Atomics.load(this.#ctrl, CTRL_DROPPED);
  }

  wrapped(): number {
    return Atomics.load(this.#ctrl, CTRL_WRAPPED);
  }
}
