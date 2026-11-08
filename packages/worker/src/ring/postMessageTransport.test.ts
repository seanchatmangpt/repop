import { describe, expect, it } from "vitest";
import { SLOT_SIZE } from "./constants.ts";
import { stampHeader } from "./wireRing.ts";
import { pollTransport, pollUntil, yieldMacrotask } from "./poll.ts";
import { postMessagePair } from "./postMessageTransport.ts";

function slotWith(payload: Uint8Array, ordinal: number): Uint8Array {
  const slot = new Uint8Array(SLOT_SIZE);
  const r = stampHeader(slot, payload, ordinal);
  if (!r.ok) throw new Error("fixture failed");
  return slot;
}

describe("PostMessageTransport", () => {
  it("moves identical slot bytes across a real MessageChannel", async () => {
    const [a, b] = postMessagePair();
    const frame = slotWith(new TextEncoder().encode("wir0 over postmessage"), 0);
    const sent = a.send(frame, 0);
    expect(sent.ok).toBe(true);
    const dest = new Uint8Array(SLOT_SIZE);
    const r = await pollTransport(b, dest, { timeoutMs: 2000 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(dest.subarray(0, SLOT_SIZE)).toEqual(frame);
    }
    a.close();
    b.close();
  });

  it("EMPTY is returned immediately for a transfer, not swallowed", async () => {
    const [a, b] = postMessagePair();
    const dest = new Uint8Array(SLOT_SIZE);
    a.send(slotWith(new TextEncoder().encode("two"), 1), 1);
    const first = await pollTransport(b, dest, { timeoutMs: 2000 });
    expect(first.ok).toBe(true);
    // Next poll with no send: pollUntil must hit its real deadline.
    const t0 = Date.now();
    const r = await pollUntil(() => b.receive(dest), { timeoutMs: 120 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("EMPTY");
    expect(Date.now() - t0).toBeGreaterThanOrEqual(110);
    a.close();
    b.close();
  });

  it("refuses wrong-size frames (BAD_STATE)", () => {
    const [a, b] = postMessagePair();
    const r = a.send(new Uint8Array(64), 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("BAD_STATE");
    a.close();
    b.close();
  });

  it("yieldMacrotask resolves via MessageChannel", async () => {
    await yieldMacrotask();
    expect(true).toBe(true);
  });
});
