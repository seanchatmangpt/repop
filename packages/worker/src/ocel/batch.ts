/**
 * OCEL columnar batches — three batches (events / objects / e2o) per the
 * wave-1 R8/E12 zoela law, std-only.
 *
 * Laws enforced here:
 * - append-only: columns grow only by append; frozen entirely at seal().
 * - order law: event ids strictly increasing, refused otherwise.
 * - arity law: an e2o row must reference an appended event AND an appended
 *   object; dangling references are ARITY_MISMATCH refusals at append time.
 * - e2o is NEVER embedded in event rows: the events append API carries no
 *   object field — embedding is structurally impossible.
 * - dictionary-encoded enums: activities, object types and qualifiers are
 *   u16 indices into closed vocabularies with typed out-of-vocab refusals.
 * - rolling FNV-1a32 chain digest computed ONLY in seal() (durability
 *   event), never on the hot path.
 */

import { FNV_OFFSET_BASIS, FNV_PRIME, fnv1a32 } from "@repop/abi";
import { ocelErr, ok, type OcelResult } from "./errors.ts";
import { activityId } from "./vocab.ts";

/* ---------- rolling FNV-1a32 chain ---------- */

/** Advance a rolling FNV-1a32 state over `bytes`; returns the new state. */
export function fnvChain(h: number, bytes: Uint8Array): number {
  let hash = h >>> 0;
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i]!;
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}

/** Initial chain state. */
export function fnvInit(): number {
  return FNV_OFFSET_BASIS;
}

/** Whole-buffer FNV-1a32 (thin wrapper over the ABI codec). */
export function fnvOf(bytes: Uint8Array): number {
  return fnv1a32(bytes);
}

/* ---------- vocabularies ---------- */

/** Closed qualifier vocabulary (e2o relation semantics). */
export const QUALIFIER_VOCAB = ["exec", "assoc"] as const;

/** Closed object-type vocabulary. */
export const OBJECT_TYPE_VOCAB = ["wo", "machine"] as const;

function dictOf(names: readonly string[]): ReadonlyMap<string, number> {
  return new Map(names.map((n, i) => [n, i] as const));
}

const QUALIFIER_IDS = dictOf(QUALIFIER_VOCAB);
const OBJECT_TYPE_IDS = dictOf(OBJECT_TYPE_VOCAB);

function dictId(
  ids: ReadonlyMap<string, number>,
  name: string,
): OcelResult<number> {
  const id = ids.get(name);
  if (id === undefined) {
    return ocelErr("OUT_OF_VOCAB", `not in closed vocabulary`, { activity: name });
  }
  return ok(id);
}

/* ---------- row shapes ---------- */

export interface EventRow {
  readonly eventId: number;
  readonly ts: number;
  readonly activity: string;
}

export interface ObjectRow {
  readonly objectId: number;
  readonly objectType: string;
}

export interface E2ORow {
  readonly eventId: number;
  readonly objectId: number;
  readonly qualifier: string;
}

/* ---------- column helpers ---------- */

const GROW = 2;
const INITIAL_CAP = 16;

function growTyped(a: Uint32Array | Uint16Array | Float64Array):
    Uint32Array | Uint16Array | Float64Array {
  if (a.length === 0) {
    if (a instanceof Float64Array) return new Float64Array(INITIAL_CAP);
    if (a instanceof Uint16Array) return new Uint16Array(INITIAL_CAP);
    return new Uint32Array(INITIAL_CAP);
  }
  const n = a.length * GROW;
  if (a instanceof Float64Array) {
    const bigger = new Float64Array(n);
    bigger.set(a);
    return bigger;
  }
  if (a instanceof Uint16Array) {
    const bigger = new Uint16Array(n);
    bigger.set(a);
    return bigger;
  }
  const bigger = new Uint32Array(n);
  bigger.set(a);
  return bigger;
}

function u8Bytes(a: Uint32Array | Uint16Array | Float64Array): Uint8Array {
  return new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
}

/* ---------- events batch ---------- */

/**
 * Events batch: wide typed columns + dictionary-encoded activity enum.
 * The append API carries NO object field — e2o is a separate batch by law.
 */
export class EventsBatch {
  #eventId: Uint32Array = new Uint32Array(0);
  #ts: Float64Array = new Float64Array(0);
  #activity: Uint16Array = new Uint16Array(0);
  #n = 0;
  #sealed = false;
  #chain = 0;

  get length(): number {
    return this.#n;
  }

  get sealed(): boolean {
    return this.#sealed;
  }

  /** Dictionary index of the activity of row `i`. */
  activityAt(i: number): number {
    return this.#activity[i] ?? 0;
  }

  /** Appended event id of row `i`. */
  eventIdAt(i: number): number {
    return this.#eventId[i] ?? 0;
  }

  /**
   * Live column byte views, in digest column order. These are views over
   * the batch's own buffers (not copies) — the seal/verify mutation-leg
   * surface: flipping any byte here must flip the recomputed chain.
   */
  rawColumnBytes(): Uint8Array[] {
    return [
      u8Bytes(this.#eventId.subarray(0, this.#n)),
      u8Bytes(this.#ts.subarray(0, this.#n)),
      u8Bytes(this.#activity.subarray(0, this.#n)),
    ];
  }

  /**
   * Append one event row. Order law: eventId strictly increasing.
   * Closed vocab: activity resolves to a u16 dictionary index.
   */
  append(row: EventRow): OcelResult<void> {
    if (this.#sealed) {
      return ocelErr("ALREADY_SEALED", "events batch sealed; append refused");
    }
    if (this.#n > 0 && row.eventId <= (this.#eventId[this.#n - 1] as number)) {
      return ocelErr(
        "ORDER_VIOLATION",
        "event ids must be strictly increasing",
        { observed: row.eventId, expected: (this.#eventId[this.#n - 1] as number) + 1 },
      );
    }
    const act = activityId(row.activity);
    if (!act.ok) return act;
    this.#eventId = growTyped(this.#eventId) as Uint32Array;
    this.#ts = growTyped(this.#ts) as Float64Array;
    this.#activity = growTyped(this.#activity) as Uint16Array;
    const i = this.#n;
    this.#eventId[i] = row.eventId;
    this.#ts[i] = row.ts;
    this.#activity[i] = act.value;
    this.#n += 1;
    return ok(undefined);
  }

  /** Seal: rolling FNV chain over all column bytes. Once only. */
  seal(): OcelResult<number> {
    if (this.#sealed) {
      return ocelErr("ALREADY_SEALED", "events batch already sealed");
    }
    this.#sealed = true;
    this.#chain = this.chainDigest(fnvInit());
    return ok(this.#chain);
  }

  /**
   * Verify: recompute the rolling chain over the live column bytes and
   * compare against the sealed digest. Any post-seal byte flip anywhere in
   * any column flips the recomputed digest — CHAIN_MISMATCH refusal.
   */
  verify(): OcelResult<void> {
    if (!this.#sealed) {
      return ocelErr("NOT_SEALED", "verify before seal");
    }
    const recomputed = this.chainDigest(fnvInit());
    if (recomputed !== this.#chain) {
      return ocelErr("CHAIN_MISMATCH", "post-seal mutation detected", {
        observed: recomputed,
        expected: this.#chain,
      });
    }
    return ok(undefined);
  }

  /** Rolling FNV-1a32 over the live columns, in column order. */
  chainDigest(h: number): number {
    let acc = h;
    acc = fnvOf(u8Bytes(this.#eventId.subarray(0, this.#n)));
    acc = fnvChain(acc, u8Bytes(this.#ts.subarray(0, this.#n)));
    acc = fnvChain(acc, u8Bytes(this.#activity.subarray(0, this.#n)));
    return acc;
  }
}

/* ---------- objects batch ---------- */

/** Dictionary-encoded object table. */
export class ObjectsBatch {
  #objectId: Uint32Array = new Uint32Array(0);
  #objectType: Uint16Array = new Uint16Array(0);
  #n = 0;
  #sealed = false;
  #chain = 0;

  get length(): number {
    return this.#n;
  }

  get sealed(): boolean {
    return this.#sealed;
  }

  has(objectId: number): boolean {
    for (let i = 0; i < this.#n; i++) {
      if (this.#objectId[i] === objectId) return true;
    }
    return false;
  }

  /** Append one object row; objectType resolves through the closed vocab. */
  append(row: ObjectRow): OcelResult<void> {
    if (this.#sealed) {
      return ocelErr("ALREADY_SEALED", "objects batch sealed; append refused");
    }
    const type = dictId(OBJECT_TYPE_IDS, row.objectType);
    if (!type.ok) return type;
    this.#objectId = growTyped(this.#objectId) as Uint32Array;
    this.#objectType = growTyped(this.#objectType) as Uint16Array;
    this.#objectId[this.#n] = row.objectId;
    this.#objectType[this.#n] = type.value;
    this.#n += 1;
    return ok(undefined);
  }

  /** Seal: rolling FNV chain over all column bytes. Once only. */
  seal(): OcelResult<number> {
    if (this.#sealed) {
      return ocelErr("ALREADY_SEALED", "objects batch already sealed");
    }
    this.#sealed = true;
    this.#chain = this.chainDigest(fnvInit());
    return ok(this.#chain);
  }

  /** Verify: recompute the chain; CHAIN_MISMATCH on any post-seal flip. */
  verify(): OcelResult<void> {
    if (!this.#sealed) {
      return ocelErr("NOT_SEALED", "verify before seal");
    }
    const recomputed = this.chainDigest(fnvInit());
    if (recomputed !== this.#chain) {
      return ocelErr("CHAIN_MISMATCH", "post-seal mutation detected", {
        observed: recomputed,
        expected: this.#chain,
      });
    }
    return ok(undefined);
  }

  /** Rolling FNV-1a32 over the live columns, in column order. */
  chainDigest(h: number): number {
    let acc = h;
    acc = fnvOf(u8Bytes(this.#objectId.subarray(0, this.#n)));
    acc = fnvChain(acc, u8Bytes(this.#objectType.subarray(0, this.#n)));
    return acc;
  }
}

/* ---------- e2o batch ---------- */

/**
 * e2o batch: separate (event_id, object_id, qualifier) relation — never
 * embedded in event rows. Arity law: both ids must reference appended rows.
 */
export class E2OBatch {
  #eventId: Uint32Array = new Uint32Array(0);
  #objectId: Uint32Array = new Uint32Array(0);
  #qualifier: Uint16Array = new Uint16Array(0);
  #n = 0;
  #sealed = false;
  #chain = 0;

  get length(): number {
    return this.#n;
  }

  get sealed(): boolean {
    return this.#sealed;
  }

  /**
   * Append one e2o row. Arity assert: eventId must exist in `events`,
   * objectId in `objects` — a dangling id is ARITY_MISMATCH at append time.
   */
  append(
    row: E2ORow,
    events: EventsBatch,
    objects: ObjectsBatch,
  ): OcelResult<void> {
    if (this.#sealed) {
      return ocelErr("ALREADY_SEALED", "e2o batch sealed; append refused");
    }
    if (!eventsHas(events, row.eventId)) {
      return ocelErr("ARITY_MISMATCH", "e2o references unknown eventId", {
        observed: row.eventId,
      });
    }
    if (!objects.has(row.objectId)) {
      return ocelErr("ARITY_MISMATCH", "e2o references unknown objectId", {
        observed: row.objectId,
      });
    }
    const q = dictId(QUALIFIER_IDS, row.qualifier);
    if (!q.ok) return q;
    this.#eventId = growTyped(this.#eventId) as Uint32Array;
    this.#objectId = growTyped(this.#objectId) as Uint32Array;
    this.#qualifier = growTyped(this.#qualifier) as Uint16Array;
    this.#eventId[this.#n] = row.eventId;
    this.#objectId[this.#n] = row.objectId;
    this.#qualifier[this.#n] = q.value;
    this.#n += 1;
    return ok(undefined);
  }

  /** Seal: rolling FNV chain over all column bytes. Once only. */
  seal(): OcelResult<number> {
    if (this.#sealed) {
      return ocelErr("ALREADY_SEALED", "e2o batch already sealed");
    }
    this.#sealed = true;
    this.#chain = this.chainDigest(fnvInit());
    return ok(this.#chain);
  }

  /** Verify: recompute the chain; CHAIN_MISMATCH on any post-seal flip. */
  verify(): OcelResult<void> {
    if (!this.#sealed) {
      return ocelErr("NOT_SEALED", "verify before seal");
    }
    const recomputed = this.chainDigest(fnvInit());
    if (recomputed !== this.#chain) {
      return ocelErr("CHAIN_MISMATCH", "post-seal mutation detected", {
        observed: recomputed,
        expected: this.#chain,
      });
    }
    return ok(undefined);
  }

  /** Rolling FNV-1a32 over the live columns, in column order. */
  chainDigest(h: number): number {
    let acc = h;
    acc = fnvOf(u8Bytes(this.#eventId.subarray(0, this.#n)));
    acc = fnvChain(acc, u8Bytes(this.#objectId.subarray(0, this.#n)));
    acc = fnvChain(acc, u8Bytes(this.#qualifier.subarray(0, this.#n)));
    return acc;
  }
}

/** Linear membership probe over the events batch's appended ids. */
function eventsHas(events: EventsBatch, eventId: number): boolean {
  for (let i = 0; i < events.length; i++) {
    if (events.eventIdAt(i) === eventId) return true;
  }
  return false;
}
