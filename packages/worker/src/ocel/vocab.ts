/**
 * Closed activity vocabulary (R8/E12 zoela law: events batch dictionary).
 *
 * The vocabulary is CLOSED: out-of-vocab activity is a typed refusal
 * (OUT_OF_VOCAB), never a silent dictionary growth. Aligns to the pack
 * ontology vocabulary (P16) via the WO01 config row read through the ABI.
 */

import { ocelErr, type OcelResult } from "./errors.ts";

/** Closed activity vocabulary, frozen at module load. */
export const ACTIVITY_VOCAB = [
  "start",
  "assign",
  "execute",
  "complete",
  "fail",
] as const;

export type Activity = (typeof ACTIVITY_VOCAB)[number];

const ACTIVITY_IDS: ReadonlyMap<string, number> = new Map(
  ACTIVITY_VOCAB.map((a, i) => [a, i]),
);

/** Dictionary size = vocab size; indices are u16 dictionary offsets. */
export const ACTIVITY_VOCAB_SIZE = ACTIVITY_VOCAB.length;

/** Map an activity string to its dictionary index; refused when out-of-vocab. */
export function activityId(name: string): OcelResult<number> {
  const id = ACTIVITY_IDS.get(name);
  if (id === undefined) {
    return ocelErr("OUT_OF_VOCAB", `activity not in closed vocabulary`, {
      activity: name,
    });
  }
  return { ok: true, value: id };
}

/** Inverse map: dictionary index back to the frozen activity name. */
export function activityName(id: number): string | undefined {
  return ACTIVITY_VOCAB[id];
}
