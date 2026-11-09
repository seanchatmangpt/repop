import { describe, expect, it } from "vitest";
import { FRAME_SIZE } from "@repop/abi";
import { Router } from "./router.ts";
import { encodeFrame } from "./frame.ts";
import { FrameKind } from "./frameKind.ts";
import { encodeRefusal, RefusalReason } from "./refusal.ts";

function payload64(): Uint8Array {
  return new Uint8Array(FRAME_SIZE);
}

function frameOf(
  kind: FrameKind,
  seq: number,
  corrId: number,
  payload = payload64(),
): Uint8Array {
  const r = encodeFrame(kind, seq, corrId, payload);
  if (!r.ok) throw new Error(`encode refused: ${r.error.code}`);
  return r.frame;
}

describe("Router stateful gates", () => {
  it("seq: strictly monotonic, replay refuses", () => {
    const seen: number[] = [];
    const r = new Router({ send: () => {} });
    r.on(FrameKind.KERNEL_READY, (f) => seen.push(f.seq));
    const p = new Uint8Array(0);
    expect(r.accept(frameOf(FrameKind.KERNEL_READY, 0, 0, p)).ok).toBe(true);
    expect(r.accept(frameOf(FrameKind.KERNEL_READY, 0, 0, p)).ok).toBe(false); // replay
    expect(r.accept(frameOf(FrameKind.KERNEL_READY, 1, 0, p)).ok).toBe(true);
    const bad = r.accept(frameOf(FrameKind.KERNEL_READY, 1, 0, p));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.code).toBe("BAD_SEQ");
  });

  it("seq: wrap-safe at the u32 ring boundary", () => {
    const r = new Router({ send: () => {} });
    const p = new Uint8Array(0);
    expect(r.accept(frameOf(FrameKind.KERNEL_READY, 0xffffffff, 0, p)).ok).toBe(true);
    // first-ever seq 0xffffffff accepted; next lawful is 0 (distance 1)
    expect(r.accept(frameOf(FrameKind.KERNEL_READY, 0, 0, p)).ok).toBe(true);
    // distance >= 2^31 is far-past, refuses
    const r2 = r.accept(frameOf(FrameKind.KERNEL_READY, 0x80000000, 0, p));
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error.code).toBe("BAD_SEQ");
  });

  it("corrId: unknown refuses, minted id passes, KERNEL_READY corrId 0 bypasses", () => {
    const r = new Router({ send: () => {} });
    // unsolicited non-READY frame with unregistered corrId
    const un = r.accept(frameOf(FrameKind.SUBMIT_INTENT, 1, 777));
    expect(un.ok).toBe(false);
    if (!un.ok) expect(un.error.code).toBe("BAD_CORRELATION");

    const id = r.mintCorrId();
    const okIn = r.accept(frameOf(FrameKind.INTENT_RESOLVED, 2, id));
    expect(okIn.ok).toBe(true);

    // KERNEL_READY with corrId 0: lawful unsolicited boot frame
    expect(r.accept(frameOf(FrameKind.KERNEL_READY, 3, 0, new Uint8Array(0))).ok).toBe(true);
  });

  it("REFUSE echo: payload corrId must equal header corrId", () => {
    const r = new Router({ send: () => {} });
    const id = r.mintCorrId();
    const good = encodeRefusal(1, RefusalReason.NOT_READY, id);
    if (!good.ok) throw new Error("refusal encode refused");
    const goodIn = r.accept(
      frameOf(FrameKind.REFUSE, 4, id, good.payload),
    );
    expect(goodIn.ok).toBe(true);

    const id2 = r.mintCorrId();
    const badEcho = encodeRefusal(1, RefusalReason.NOT_READY, id); // echoes stale corrId
    if (!badEcho.ok) throw new Error("refusal encode refused");
    const badIn = r.accept(frameOf(FrameKind.REFUSE, 5, id2, badEcho.payload));
    expect(badIn.ok).toBe(false);
    if (!badIn.ok) {
      expect(badIn.error.code).toBe("BAD_CORRELATION");
      if (badIn.error.code === "BAD_CORRELATION" && badIn.error.why === "echo-mismatch") {
        // typed path reached
      } else {
        throw new Error("expected echo-mismatch");
      }
    }
  });

  it("dispatch: registered handler fires exactly once for its kind", () => {
    const r = new Router({ send: () => {} });
    let ready = 0;
    let resolved = 0;
    r.on(FrameKind.KERNEL_READY, () => {
      ready += 1;
    });
    r.on(FrameKind.INTENT_RESOLVED, () => {
      resolved += 1;
    });
    const id = r.mintCorrId();
    r.accept(frameOf(FrameKind.KERNEL_READY, 0, 0, new Uint8Array(0)));
    r.accept(frameOf(FrameKind.INTENT_RESOLVED, 1, id));
    expect(ready).toBe(1);
    expect(resolved).toBe(1);
  });

  it("writer: send advances seq and emits header+payload bytes", () => {
    const sent: Uint8Array[] = [];
    const r = new Router({ send: (f) => sent.push(f) });
    const id = r.mintCorrId();
    const s1 = r.send(FrameKind.SUBMIT_INTENT, payload64(), id);
    expect(s1.ok).toBe(true);
    if (s1.ok) expect(s1.seq).toBe(0);
    const s2 = r.send(FrameKind.SUBMIT_INTENT, payload64(), id);
    if (s2.ok) expect(s2.seq).toBe(1);
    expect(sent.length).toBe(2);
    expect(sent[0]!.byteLength).toBe(32 + FRAME_SIZE);
  });

  it("writer: wrong-width payload refuses and does not advance seq", () => {
    const sent: Uint8Array[] = [];
    const r = new Router({ send: (f) => sent.push(f) });
    const before = r.seq;
    const s = r.send(FrameKind.SUBMIT_INTENT, new Uint8Array(4), 1);
    expect(s.ok).toBe(false);
    expect(r.seq).toBe(before);
    expect(sent.length).toBe(0);
  });
});
