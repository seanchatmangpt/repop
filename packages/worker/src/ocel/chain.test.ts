import { describe, expect, it } from "vitest";
import {
  blake3,
  blake3Hex,
  canonicalTextBytes,
  chainField,
  chainGenesis,
  chainOfFields,
  toHex,
} from "./chain.ts";
import { E2OBatch, EventsBatch, ObjectsBatch } from "./batch.ts";

/**
 * Known-answer test (KAT) court for the zero-dep BLAKE3 implementation.
 * Vectors generated with the reference implementation b3sum 1.8.5
 * (`b3sum` — BLAKE3-team/BLAKE3 reference CLI, Rust). The empty-input
 * vector is the canonical spec vector (BLAKE3 test_vectors.json, input
 * length 0, key 0, no context string):
 *   af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262
 * The 2500-byte vector exercises the multi-chunk tree (chunk counters,
 * parent merges) — beyond the single-chunk path.
 */
const KATS: Array<[Uint8Array, string]> = [
  [new Uint8Array(0), "af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262"],
  [new TextEncoder().encode("abc"), "6437b3ac38465133ffb63b75273a8db548c558465d79db03fd359c6cd5bd9d85"],
  [
    // bytes(i % 251) for i in 0..2500 — see receipt for generation command.
    Uint8Array.from({ length: 2500 }, (_, i) => i % 251),
    "95e809954ebdd862debeb347d5715c09e73d150cd0704d4bbd834993a730e2ff",
  ],
];

describe("blake3 KAT court (b3sum 1.8.5 reference vectors)", () => {
  for (const [i, [input, expected]] of KATS.entries()) {
    it(`KAT ${i}: input length ${input.length} matches reference digest`, () => {
      const got = blake3Hex(input);
      expect(got).toBe(expected);
      expect(got.length).toBe(64);
    });
  }

  it("digest is 32 bytes; hex round-trips", () => {
    expect(blake3(new Uint8Array([1, 2, 3])).length).toBe(32);
    const bytes = blake3(new Uint8Array([9]));
    expect(toHex(bytes)).toBe(blake3Hex(new Uint8Array([9])));
  });

  it("avalanche: one flipped input bit flips the digest", () => {
    const a = blake3Hex(new Uint8Array(200).fill(7));
    const b = new Uint8Array(200).fill(7);
    b[199] = 6;
    expect(blake3Hex(b)).not.toBe(a);
  });

  it("block-boundary sensitivity around CHUNK_LEN (1024)", () => {
    const lens = [1023, 1024, 1025, 2048, 2049, 3072];
    const digests = new Set(
      lens.map((n) => blake3Hex(new Uint8Array(n).fill(3))),
    );
    expect(digests.size).toBe(lens.length);
  });
});

describe("parent-chained links (seal-tier chain law)", () => {
  it("genesis matches the spec empty-input vector", () => {
    expect(toHex(chainGenesis())).toBe(KATS[0]![1]);
  });

  it("link = blake3(parent || len(parent) framing || field bytes)", () => {
    const p = chainGenesis();
    const f = new Uint8Array([1, 2, 3]);
    const direct = chainField(p, f);
    // Manual recomputation of the same framing.
    const framed = new Uint8Array(32 + 4 + 3);
    framed.set(p, 0);
    new DataView(framed.buffer).setUint32(32, 3, true);
    framed.set(f, 36);
    expect(blake3Hex(framed)).toBe(toHex(direct));
  });

  it("chain is order-bound: same fields, different order, different seal", () => {
    const a = chainOfFields([
      new Uint8Array([1]),
      new Uint8Array([2]),
    ]);
    const b = chainOfFields([
      new Uint8Array([2]),
      new Uint8Array([1]),
    ]);
    expect(toHex(a)).not.toBe(toHex(b));
  });

  it("canonicalTextBytes refuses LF (LF_IN_FIELD)", () => {
    const bad = canonicalTextBytes("start\ndone");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.code).toBe("LF_IN_FIELD");
    const good = canonicalTextBytes("start");
    expect(good.ok).toBe(true);
  });
});

/* ---------- chain laws from chain.ex, carried onto the batches ---------- */

function seededEvents(n: number): EventsBatch {
  const b = new EventsBatch();
  for (let i = 0; i < n; i++) {
    const r = b.append({ eventId: i + 1, ts: 1000 + i, activity: "start" });
    if (!r.ok) throw new Error(r.error.message);
  }
  return b;
}

describe("seal-last / ≤1-seal / verify-single-pass laws", () => {
  it("seal digest is the chain over the canonical column order", () => {
    const b = seededEvents(5);
    const s = b.seal();
    expect(s.ok).toBe(true);
    if (s.ok) {
      // Seal-last: the sealed digest must equal a fresh independent
      // recomputation over the same canonical field order.
      expect(s.value).toBe(b.chainDigest());
      expect(s.value).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("≤1-seal: second seal refuses; append after seal refuses", () => {
    const b = seededEvents(2);
    const first = b.seal();
    expect(first.ok).toBe(true);
    const second = b.seal();
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe("ALREADY_SEALED");
    const app = b.append({ eventId: 9, ts: 1, activity: "start" });
    expect(app.ok).toBe(false);
    if (!app.ok) expect(app.error.code).toBe("ALREADY_SEALED");
  });

  it("verify-single-pass: verify is repeatable and stateless", () => {
    const b = seededEvents(3);
    const s = b.seal();
    expect(s.ok).toBe(true);
    expect(b.verify().ok).toBe(true);
    expect(b.verify().ok).toBe(true); // second pass, same verdict
    if (s.ok) expect(b.chainDigest()).toBe(s.value); // no hidden state
  });

  it("seal-last: appending post-seal flips the recomputed chain (CHAIN_MISMATCH)", () => {
    const b = seededEvents(3);
    const s = b.seal();
    expect(s.ok).toBe(true);
    const views = b.rawColumnBytes();
    views[2]![1] = (views[2]![1]! ^ 0xff) & 0xff; // flip activity column
    const sealValue = s.ok ? s.value : "";
    const v = b.verify();
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.error.code).toBe("CHAIN_MISMATCH");
      expect(v.error.observed).not.toBe(v.error.expected);
      expect(v.error.expected).toBe(sealValue);
    }
  });

  it("each of the three batches seals with a distinct blake3 seal digest", () => {
    const events = seededEvents(2);
    const objects = new ObjectsBatch();
    objects.append({ objectId: 100, objectType: "wo" });
    const e2o = new E2OBatch();
    e2o.append(
      { eventId: 1, objectId: 100, qualifier: "exec" },
      events,
      objects,
    );
    const dEvents = events.seal();
    const dObjects = objects.seal();
    const dE2o = e2o.seal();
    expect(dEvents.ok && dObjects.ok && dE2o.ok).toBe(true);
    if (dEvents.ok && dObjects.ok && dE2o.ok) {
      expect(dEvents.value).not.toBe(dObjects.value);
      expect(dObjects.value).not.toBe(dE2o.value);
    }
    expect(events.verify().ok).toBe(true);
    expect(objects.verify().ok).toBe(true);
    expect(e2o.verify().ok).toBe(true);
  });
});
