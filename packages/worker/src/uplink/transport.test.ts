// @vitest-environment node
// RingUplink drives the landed C6b ring through postMessagePair, whose
// consumer legs deliver via MessagePort onmessage. jsdom's MessagePort
// does not deliver posted messages, so the bounded pollReceive hits its
// deadline with ok:false even though the ring is lawful (proven by this
// file passing 8/8 under node). MessageChannel/MessagePort delivery is a
// node-level concern; run in node. No DOM surface is exercised here.
import { describe, expect, it } from "vitest";
import { SLOT_SIZE, postMessagePair } from "../ring/index.ts";
import { decodeMetaHeader } from "./metaHeader.ts";
import {
  NullTransport,
  PostMessageUplink,
  RingUplink,
} from "./transport.ts";

describe("NullTransport: typed-refusal sink", () => {
  it("refuses every send with ZERO_PROGRESS", () => {
    const t = new NullTransport();
    const r = t.send([new Uint8Array(4)], 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("ZERO_PROGRESS");
    t.close();
  });
});

describe("PostMessageUplink", () => {
  it("accepts a scatter send and delivers the envelope", async () => {
    const [tx, rx] = makeUplinkPair();
    const body = new Uint8Array([1, 2, 3]);
    const r = tx.send([body], 0);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(1);
    const frame = await rx.receive();
    expect(frame).not.toBeNull();
    if (!frame) return;
    const parsed = decodeMetaHeader(frame, 0);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value).toBe(3);
    tx.close();
  });

  it("refuses send after close (ZERO_PROGRESS)", () => {
    const [tx] = makeUplinkPair();
    tx.close();
    const r = tx.send([new Uint8Array(1)], 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("ZERO_PROGRESS");
  });

  it("empty scatter accepts zero segments (no-op, not refusal)", () => {
    const [tx] = makeUplinkPair();
    const r = tx.send([], 0);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(0);
    tx.close();
  });
});

describe("RingUplink: emit into the C6b ring", () => {
  it("emits one envelope into one WIR0 slot; consumer decodes it", async () => {
    const [prod, cons] = postMessagePair();
    const uplink = new RingUplink(prod);
    const body = new Uint8Array([9, 8, 7, 6]);
    const r = uplink.send([body], 0);
    expect(r.ok).toBe(true);
    const slot = new Uint8Array(SLOT_SIZE);
    const got = await pollReceive(cons, slot);
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    const parsed = decodeMetaHeader(slot, 0);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value).toBe(4);
    uplink.close();
  });

  it("preserves the ordinal law across emit (seq stamped in header)", async () => {
    const [prod, cons] = postMessagePair();
    const uplink = new RingUplink(prod);
    uplink.send([new Uint8Array(4)], 41);
    const slot = new Uint8Array(SLOT_SIZE);
    const got = await pollReceive(cons, slot);
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    const dv = new DataView(slot.buffer);
    expect(dv.getUint32(0x08, true)).toBe(41);
    uplink.close();
  });

  it("refuses a record larger than one slot (ZERO_PROGRESS)", () => {
    const [prod] = postMessagePair();
    const uplink = new RingUplink(prod);
    const r = uplink.send([new Uint8Array(SLOT_SIZE)], 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("ZERO_PROGRESS");
    uplink.close();
  });

  it("refuses send after close (ZERO_PROGRESS)", () => {
    const [prod] = postMessagePair();
    const uplink = new RingUplink(prod);
    uplink.close();
    const r = uplink.send([new Uint8Array(1)], 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("ZERO_PROGRESS");
  });
});

/* ---------- helpers ---------- */

/** Bounded observable poll: macrotask yields until the frame lands. */
async function pollReceive(
  t: { receive(dest: Uint8Array): { ok: boolean } },
  dest: Uint8Array,
  deadlineMs = 500,
): Promise<{ ok: boolean }> {
  const start = Date.now();
  while (Date.now() - start < deadlineMs) {
    const r = t.receive(dest);
    if (r.ok) return r;
    await new Promise((res) => setTimeout(res, 0));
  }
  return t.receive(dest);
}

interface RxSide {
  receive(): Promise<Uint8Array | null>;
}

function makeUplinkPair(): [PostMessageUplink, RxSide] {
  const ch = new MessageChannel();
  const tx = new PostMessageUplink(ch.port1);
  let pending: Uint8Array | null = null;
  ch.port2.onmessage = (ev: MessageEvent) => {
    pending = ev.data as Uint8Array;
  };
  return [
    tx,
    {
      receive: () =>
        new Promise<Uint8Array | null>((resolve) => {
          const check = () => {
            if (pending !== null) {
              resolve(pending);
              return true;
            }
            return false;
          };
          if (!check()) {
            setTimeout(() => {
              check() || resolve(null);
            }, 10);
          }
        }),
    },
  ];
}
