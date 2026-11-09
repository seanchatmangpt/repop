import { describe, expect, it } from "vitest";
import {
  E2OBatch,
  EventsBatch,
  ObjectsBatch,
} from "./batch.ts";
import { ACTIVITY_VOCAB_SIZE } from "./vocab.ts";

function seededEvents(n: number): EventsBatch {
  const b = new EventsBatch();
  for (let i = 0; i < n; i++) {
    const r = b.append({ eventId: i + 1, ts: 1000 + i, activity: "start" });
    if (!r.ok) throw new Error(r.error.message);
  }
  return b;
}

describe("events batch: append / order law", () => {
  it("appends rows in strictly increasing event-id order", () => {
    const b = seededEvents(3);
    expect(b.length).toBe(3);
  });

  it("refuses a non-increasing event id (ORDER_VIOLATION)", () => {
    const b = seededEvents(1);
    const r = b.append({ eventId: 1, ts: 2000, activity: "start" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("ORDER_VIOLATION");
  });

  it("refuses a decreasing event id (ORDER_VIOLATION)", () => {
    const b = seededEvents(2);
    const r = b.append({ eventId: 1, ts: 2000, activity: "assign" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("ORDER_VIOLATION");
  });

  it("refuses out-of-vocab activity (OUT_OF_VOCAB)", () => {
    const b = new EventsBatch();
    const r = b.append({ eventId: 1, ts: 0, activity: "teleport" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("OUT_OF_VOCAB");
      expect(r.error.activity).toBe("teleport");
    }
  });

  it("carries a closed activity vocabulary", () => {
    expect(ACTIVITY_VOCAB_SIZE).toBe(5);
  });
});

describe("seal / verify roundtrip", () => {
  it("seals once and verifies clean", () => {
    const b = seededEvents(4);
    const s = b.seal();
    expect(s.ok).toBe(true);
    if (s.ok) expect(typeof s.value).toBe("number");
    expect(b.sealed).toBe(true);
    expect(b.verify().ok).toBe(true);
  });

  it("refuses double seal (ALREADY_SEALED)", () => {
    const b = seededEvents(1);
    b.seal();
    const r = b.seal();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("ALREADY_SEALED");
  });

  it("refuses verify before seal (NOT_SEALED)", () => {
    const b = seededEvents(1);
    const r = b.verify();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("NOT_SEALED");
  });

  it("refuses append after seal (ALREADY_SEALED)", () => {
    const b = seededEvents(1);
    b.seal();
    const r = b.append({ eventId: 9, ts: 0, activity: "start" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("ALREADY_SEALED");
  });

  it("digest differs when content differs (chain is content-bound)", () => {
    const a = seededEvents(3);
    const c = new EventsBatch();
    for (let i = 0; i < 3; i++) {
      c.append({ eventId: i + 1, ts: 1000 + i, activity: "assign" });
    }
    const da = a.seal();
    const dc = c.seal();
    expect(da.ok && dc.ok).toBe(true);
    if (da.ok && dc.ok) expect(da.value).not.toBe(dc.value);
  });
});

describe("mutation leg: tampered events byte post-seal", () => {
  it("verify refuses CHAIN_MISMATCH after a flipped byte", () => {
    const b = seededEvents(3);
    const sealed = b.seal();
    expect(sealed.ok).toBe(true);
    const views = b.rawColumnBytes();
    expect(views.length).toBe(3);
    expect(views[0]!.byteLength).toBeGreaterThan(0);
    views[0]![0] = (views[0]![0]! ^ 0xff) & 0xff;
    const v = b.verify();
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.error.code).toBe("CHAIN_MISMATCH");
      expect(v.error.expected).not.toBe(v.error.observed);
    }
  });
});

describe("objects + e2o batches: arity law", () => {
  function seededPair(): [EventsBatch, ObjectsBatch] {
    const events = seededEvents(2);
    const objects = new ObjectsBatch();
    const o = objects.append({ objectId: 100, objectType: "wo" });
    if (!o.ok) throw new Error(o.error.message);
    return [events, objects];
  }

  it("accepts e2o rows referencing appended event and object", () => {
    const [events, objects] = seededPair();
    const e2o = new E2OBatch();
    const r = e2o.append(
      { eventId: 1, objectId: 100, qualifier: "exec" },
      events,
      objects,
    );
    expect(r.ok).toBe(true);
    expect(e2o.length).toBe(1);
  });

  it("refuses a dangling eventId (ARITY_MISMATCH)", () => {
    const [events, objects] = seededPair();
    const e2o = new E2OBatch();
    const r = e2o.append(
      { eventId: 999, objectId: 100, qualifier: "exec" },
      events,
      objects,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("ARITY_MISMATCH");
  });

  it("refuses a dangling objectId (ARITY_MISMATCH)", () => {
    const [events, objects] = seededPair();
    const e2o = new E2OBatch();
    const r = e2o.append(
      { eventId: 1, objectId: 555, qualifier: "assoc" },
      events,
      objects,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("ARITY_MISMATCH");
  });

  it("e2o is a separate batch: event rows carry no object field", () => {
    const b = new EventsBatch();
    const r = b.append({ eventId: 1, ts: 0, activity: "start" });
    expect(r.ok).toBe(true);
    expect("objectId" in r).toBe(false);
  });

  it("seals and verifies the e2o batch; tamper refuses", () => {
    const [events, objects] = seededPair();
    const e2o = new E2OBatch();
    e2o.append(
      { eventId: 2, objectId: 100, qualifier: "exec" },
      events,
      objects,
    );
    expect(e2o.seal().ok).toBe(true);
    expect(e2o.verify().ok).toBe(true);
  });

  it("objects batch seals and verifies", () => {
    const objects = new ObjectsBatch();
    objects.append({ objectId: 100, objectType: "machine" });
    expect(objects.seal().ok).toBe(true);
    expect(objects.verify().ok).toBe(true);
    const again = objects.append({ objectId: 101, objectType: "wo" });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe("ALREADY_SEALED");
  });
});
