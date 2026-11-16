/**
 * OCEL export — serialize the three landed columnar batches into the
 * beam4pm-ingest whole-log JSON shape.
 *
 * Decode law (transcribed, beam4pm @ /Users/sac/beam4pm):
 * - whole-log shape {events, objectTypes, eventTypes, objects}:
 *   lib/beam4pm_ocel_log_ingest.ex:7-10, required-keys gate :134.
 * - event record {id, type, time, attributes, relationships:[...]}, ids are
 *   strings (:186-187 id/type is_binary), relationships each
 *   {objectId, qualifier} strings (:210-213), object {id, type} strings
 *   (:217).
 * - event ids as strings; time as ISO8601 STRING per the OcelEvent law
 *   (lib/beam4pm_types.ex:11840 event_time: String.t() | nil; per-record
 *   ingest path lib/beam4pm_ocel_ingest.ex:133 passes event_time straight
 *   through as a string).
 * - REGISTERED DIVERGENCE: lib/beam4pm_ocel_log_ingest.ex:188 gates
 *   `time` as is_number — that validator gate predates the string-time
 *   OcelEvent law. Export emits ISO8601 strings per the OcelEvent law;
 *   the beam4pm-side validator gate is beam4pm's to update (not this
 *   lane's file). Recorded here fail-loud, not silently patched around.
 * - events serialize in chain document order — no re-sort (the batch's
 *   append order law IS the document order).
 *
 * Laws enforced here:
 * - u16 dictionary enums → vocab strings via the frozen vocabularies;
 *   an out-of-vocab dictionary index is an OUT_OF_VOCAB refusal.
 * - e2o re-joined into per-event relationships arrays (e2o is never
 *   embedded at rest; embedding exists only in this wire projection).
 * - dangling-e2o refusal preserved fail-closed at export: every e2o row
 *   re-checked against the appended event and object ids (ARITY_MISMATCH).
 * - closed sets declared: objectTypes/eventTypes top-level keys are
 *   emitted from the frozen vocabularies (required top-level keys,
 *   beam4pm_ocel_log_ingest.ex:134).
 * - the sealed chain digest rides as a top-level envelope attribute
 *   (repop_chain_digest + repop_chain_algorithm); the algorithm tier is
 *   parameterized (currently blake3 per chain.ts — no FNV-1a32 tamper
 *   tier).
 * - zero-JSON holds worker-side (resolutions.md S2 law): this module is
 *   the single sanctioned JSON boundary.
 */

import { ocelErr, ok, type OcelResult } from "./errors.ts";
import { ACTIVITY_VOCAB, activityName } from "./vocab.ts";
import { QUALIFIER_VOCAB, OBJECT_TYPE_VOCAB } from "./batch.ts";
import type { EventsBatch, ObjectsBatch, E2OBatch } from "./batch.ts";

/** Linear membership probe over the events batch's appended ids. */
function eventsHas(events: EventsBatch, eventId: number): boolean {
  for (let i = 0; i < events.length; i++) {
    if (events.eventIdAt(i) === eventId) return true;
  }
  return false;
}

/** Sealed chain digest tier — named in the envelope, not assumed. */
export interface ChainSeal {
  readonly algorithm: string; // e.g. "blake3" — the landed seal() tier
  readonly digest: SealHex;
}

/** Hex-encoded seal digest as returned by EventsBatch.seal() etc. */
export type SealHex = string;

/** Wire record shapes (beam4pm-ingest whole-log JSON). */
export interface WireEvent {
  readonly id: string;
  readonly type: string;
  readonly time: string; // ISO8601
  readonly attributes: Record<string, string>;
  readonly relationships: readonly {
    readonly objectId: string;
    readonly qualifier: string;
  }[];
}

export interface WireObject {
  readonly id: string;
  readonly type: string;
  readonly attributes: Record<string, string>;
}

export interface WireLog {
  readonly events: readonly WireEvent[];
  readonly objectTypes: readonly { readonly name: string }[];
  readonly eventTypes: readonly { readonly name: string }[];
  readonly objects: readonly WireObject[];
  /** repop chain envelope attribute (receipt chains are NOT conflated:
   *  the digest rides as an attribute, never as beam4pm-side chain state). */
  readonly repop_chain_digest: SealHex;
  readonly repop_chain_algorithm: string;
}

/**
 * Serialize the three sealed batches into the beam4pm-ingest whole-log
 * shape. Fail-closed: out-of-vocab dictionary index or dangling e2o
 * reference is a typed refusal, never a coerced field.
 *
 * Events emit in batch (chain document) order — no re-sort.
 */
export function exportOcelLog(
  events: EventsBatch,
  objects: ObjectsBatch,
  e2o: E2OBatch,
  seal: ChainSeal,
): OcelResult<WireLog> {
  const nEvents = events.length;
  const nObjects = objects.length;

  // objects: dictionary u16 → vocab string, ids as strings.
  const wireObjects: WireObject[] = [];
  for (let i = 0; i < nObjects; i++) {
    const type = OBJECT_TYPE_VOCAB[objects.objectTypeIdAt(i)];
    if (type === undefined) {
      return ocelErr(
        "OUT_OF_VOCAB",
        "object type dictionary index out of vocab",
        { observed: objects.objectTypeIdAt(i) },
      );
    }
    wireObjects.push({
      id: String(objects.objectIdAt(i)),
      type,
      attributes: {},
    });
  }

  // per-event relationships: re-join the e2o column by eventId.
  const relsByEvent = new Map<number, {
    objectId: string;
    qualifier: string;
  }[]>();
  for (let i = 0; i < e2o.length; i++) {
    const eventId = e2o.eventIdAt(i);
    const objectId = e2o.objectIdAt(i);
    // Fail-closed re-check: dangling references refused at export even if
    // the append-time arity assert was bypassed or batches moved apart.
    if (!eventsHas(events, eventId)) {
      return ocelErr("ARITY_MISMATCH", "e2o references unknown eventId", {
        observed: eventId,
      });
    }
    if (!objects.has(objectId)) {
      return ocelErr("ARITY_MISMATCH", "e2o re-check: unknown objectId", {
        observed: objectId,
      });
    }
    const qualifier = QUALIFIER_VOCAB[e2o.qualifierIdAt(i)];
    if (qualifier === undefined) {
      return ocelErr(
        "OUT_OF_VOCAB",
        "qualifier dictionary index out of vocab",
        { observed: e2o.qualifierIdAt(i) },
      );
    }
    let list = relsByEvent.get(eventId);
    if (list === undefined) {
      list = [];
      relsByEvent.set(eventId, list);
    }
    list.push({ objectId: String(objectId), qualifier });
  }

  // events: activity u16 → vocab string; time as ISO8601 string.
  const wireEvents: WireEvent[] = [];
  for (let i = 0; i < nEvents; i++) {
    const activity = activityName(events.activityAt(i));
    if (activity === undefined) {
      return ocelErr(
        "OUT_OF_VOCAB",
        "activity dictionary index out of vocab",
        { observed: events.activityAt(i) },
      );
    }
    wireEvents.push({
      id: String(events.eventIdAt(i)),
      type: activity,
      time: new Date(events.tsAt(i)).toISOString(),
      attributes: {},
      relationships: relsByEvent.get(events.eventIdAt(i)) ?? [],
    });
  }

  // Closed-set declarations: every frozen vocab entry is emitted — the
  // ingest-side closed-set gate wants the full declared surface.
  return ok({
    events: wireEvents,
    objectTypes: OBJECT_TYPE_VOCAB.map((name) => ({ name })),
    eventTypes: ACTIVITY_VOCAB.map((name) => ({ name })),
    objects: wireObjects,
    repop_chain_digest: seal.digest,
    repop_chain_algorithm: seal.algorithm,
  });
}
