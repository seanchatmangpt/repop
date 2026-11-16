import { describe, it, expect } from "vitest";
import { EventsBatch, ObjectsBatch, E2OBatch, OBJECT_TYPE_VOCAB } from "./batch.ts";
import { ACTIVITY_VOCAB } from "./vocab.ts";
import { exportOcelLog, type ChainSeal } from "./export.ts";

/* Decode-law citations (transcribed, beam4pm @ /Users/sac/beam4pm):
 * - whole-log shape {events, objectTypes, eventTypes, objects}:
 *   lib/beam4pm_ocel_log_ingest.ex:7-10, required-keys gate :134.
 * - event {id,type,time,attributes,relationships}, id/type is_binary:
 *   :186-187; relationship {objectId, qualifier} strings :210-213;
 *   object {id,type} strings :217.
 * - time as ISO8601 STRING per BeamPM.Types.OcelEvent
 *   lib/beam4pm_types.ex:11840 (event_time: String.t() | nil; per-record
 *   path lib/beam4pm_ocel_ingest.ex:133 passes event_time through).
 *   REGISTERED DIVERGENCE: beam4pm_ocel_log_ingest.ex:188 still gates
 *   `time` as is_number — beam4pm-side fix, not this lane's file. */

const SEAL: ChainSeal = { algorithm: "blake3", digest: "ab".repeat(32) };

/** Build a sealed three-batch fixture: 2 events, 2 objects, 2 e2o rows.
 *  Appended id order (7,9 / 3,4) is deliberately not 1..n. */
function buildFixture(): {
  events: EventsBatch;
  objects: ObjectsBatch;
  e2o: E2OBatch;
} {
  const events = new EventsBatch();
  const objects = new ObjectsBatch();
  const e2o = new E2OBatch();
  expect(events.append({ eventId: 7, ts: 1700000000000, activity: "start" }).ok).toBe(true);
  expect(events.append({ eventId: 9, ts: 1700000005000, activity: "complete" }).ok).toBe(true);
  expect(objects.append({ objectId: 3, objectType: "wo" }).ok).toBe(true);
  expect(objects.append({ objectId: 4, objectType: "machine" }).ok).toBe(true);
  expect(e2o.append({ eventId: 7, objectId: 3, qualifier: "exec" }, events, objects).ok).toBe(true);
  expect(e2o.append({ eventId: 9, objectId: 4, qualifier: "assoc" }, events, objects).ok).toBe(true);
  expect(events.seal().ok).toBe(true);
  expect(objects.seal().ok).toBe(true);
  expect(e2o.seal().ok).toBe(true);
  return { events, objects, e2o };
}

describe("exportOcelLog — beam4pm ingest shape", () => {
  it("emits the whole-log shape with closed-set declarations", () => {
    const { events, objects, e2o } = buildFixture();
    const res = exportOcelLog(events, objects, e2o, SEAL);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const log = res.value;
    expect(Object.keys(log).sort()).toEqual([
      "eventTypes",
      "events",
      "objectTypes",
      "objects",
      "repop_chain_algorithm",
      "repop_chain_digest",
    ]);
    // closed-set declarations from the frozen vocabularies
    expect(log.objectTypes).toEqual(OBJECT_TYPE_VOCAB.map((name) => ({ name })));
    expect(log.eventTypes).toEqual(ACTIVITY_VOCAB.map((name) => ({ name })));
  });

  it("serializes events in chain document order, no re-sort", () => {
    const { events, objects, e2o } = buildFixture();
    const res = exportOcelLog(events, objects, e2o, SEAL);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // fixture appended 7 then 9; append order == document order
    expect(res.value.events.map((e) => e.id)).toEqual(["7", "9"]);
    expect(res.value.events.map((e) => e.type)).toEqual(["start", "complete"]);
  });

  it("event ids are strings; time is an ISO8601 string", () => {
    const { events, objects, e2o } = buildFixture();
    const res = exportOcelLog(events, objects, e2o, SEAL);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const e = res.value.events[0]!;
    expect(typeof e.id).toBe("string");
    expect(typeof e.time).toBe("string");
    expect(e.time).toBe(new Date(1700000000000).toISOString());
    expect(Number.isNaN(Date.parse(e.time))).toBe(false);
  });

  it("re-joins e2o into per-event relationships {objectId, qualifier}", () => {
    const { events, objects, e2o } = buildFixture();
    const res = exportOcelLog(events, objects, e2o, SEAL);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.events[0]!.relationships).toEqual([
      { objectId: "3", qualifier: "exec" },
    ]);
    expect(res.value.events[1]!.relationships).toEqual([
      { objectId: "4", qualifier: "assoc" },
    ]);
    expect(res.value.objects.map((o) => ({ id: o.id, type: o.type }))).toEqual([
      { id: "3", type: "wo" },
      { id: "4", type: "machine" },
    ]);
  });

  it("carries the real blake3 seal digest from chainDigest() (parameterized tier)", () => {
    const { events, objects, e2o } = buildFixture();
    const digest = events.chainDigest();
    expect(digest).toMatch(/^[0-9a-f]{64}$/); // hex-encoded 32-byte blake3
    const res = exportOcelLog(events, objects, e2o, {
      algorithm: "blake3",
      digest,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.repop_chain_digest).toBe(digest);
    expect(res.value.repop_chain_algorithm).toBe("blake3");
  });
});

describe("exportOcelLog — fail-closed courts", () => {
  it("out-of-vocab activity u16 → typed OUT_OF_VOCAB refusal (mutation leg)", () => {
    const events = new EventsBatch();
    const objects = new ObjectsBatch();
    expect(events.append({ eventId: 1, ts: 0, activity: "start" }).ok).toBe(true);
    expect(objects.append({ objectId: 1, objectType: "wo" }).ok).toBe(true);
    // mutation: flip the activity enum u16 byte to an out-of-vocab index.
    // rawColumnBytes() is the documented seal/verify mutation surface.
    const raw = events.rawColumnBytes()[2]!; // [eventId, ts, activity]
    raw[0] = 0xff; // 255 — outside ACTIVITY_VOCAB (size 5)
    const e2o = new E2OBatch();
    const res = exportOcelLog(events, objects, e2o, SEAL);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("OUT_OF_VOCAB");
    expect(res.error.observed).toBe(255);
  });

  it("dangling e2o (unknown eventId) → ARITY_MISMATCH refusal", () => {
    const { objects, e2o } = buildFixture();
    // simulate a dangling reference: export against an events batch that
    // lacks event 9 — the export-time re-check must refuse even though the
    // e2o batch sealed cleanly.
    const trimmed = new EventsBatch();
    expect(trimmed.append({ eventId: 7, ts: 1700000000000, activity: "start" }).ok).toBe(true);
    const res = exportOcelLog(trimmed, objects, e2o, SEAL);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("ARITY_MISMATCH");
    expect(res.error.observed).toBe(9);
  });

  it("dangling e2o (unknown objectId) → ARITY_MISMATCH refusal", () => {
    const { events, e2o } = buildFixture();
    const trimmedObjects = new ObjectsBatch();
    expect(trimmedObjects.append({ objectId: 3, objectType: "wo" }).ok).toBe(true);
    const res = exportOcelLog(events, trimmedObjects, e2o, SEAL);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("ARITY_MISMATCH");
    expect(res.error.observed).toBe(4);
  });
});
