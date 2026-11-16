/**
 * refire-queue — COORDINATION-THESIS build item 4 (re-fire queue) + Law 4:
 * every interruption produces a resumable checkpoint with observed evidence,
 * blocking cause, responsible party, resume condition. Derived MECHANICALLY
 * from receipt dirs instead of coordinator memory.
 *
 * Receipt grammar (matched against lane receipt markdown files):
 *   Standing: BLOCKED <detail>        — the checkpoint marker
 *   Unblock: <named unblock>          — responsible party / named unblock
 *   Resume when: <condition>          — resume condition (indexed key)
 * Aliases accepted for the condition line: `Resume when:` / `Resume condition:`
 * / `Blocked on:`.
 */
import fs from "node:fs";
import path from "node:path";
import type { WireState } from "./probe-daemon.ts";

export interface RefireLeg {
  receipt: string;
  lane: string;
  standing: string;
  unblock: string;
  resumeCondition: string;
}

export interface RefireQueueEntry extends RefireLeg {
  /** normalized condition key the queue is indexed by */
  conditionKey: string;
}

export interface ProbeState {
  state: WireState;
  doctorClass?: string | undefined;
}

const STANDING_RE = /^Standing:\s*(.+)$/m;
const UNBLOCK_RE = /^(?:Unblock|Unblocks|Named unblock):\s*(.+)$/im;
const CONDITION_RE =
  /^(?:Resume when|Resume condition|Blocked on):\s*(.+)$/im;

export function scanReceipts(dir: string): RefireLeg[] {
  const legs: RefireLeg[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return legs;
  }
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith(".md")) continue;
    const full = path.join(dir, e.name);
    const text = fs.readFileSync(full, "utf8");
    const standing = text.match(STANDING_RE)?.[1]?.trim();
    if (!standing || !/^BLOCKED\b/i.test(standing)) continue;
    const lane = e.name.replace(/\.md$/, "");
    legs.push({
      receipt: full,
      lane,
      standing,
      unblock: text.match(UNBLOCK_RE)?.[1]?.trim() ?? "unspecified",
      resumeCondition:
        text.match(CONDITION_RE)?.[1]?.trim() ?? "unspecified",
    });
  }
  return legs;
}

/**
 * Normalize a resume condition into a machine-checkable key. The closed
 * vocabulary mirrors the four-state model: a condition is either a wire
 * state ("beam SERVING", "backend up"), a doctor class ("registry gap
 * closed"), or `manual` (a human/decision gate — never auto-refired).
 */
export function conditionKey(cond: string): string {
  const c = cond.toLowerCase();
  if (/\bmanual\b|coordinator|operator|decision/.test(c)) return "manual";
  if (/serving|backend up|beam green|wire green|health/.test(c))
    return "beam:SERVING";
  if (/wedged/.test(c)) return "beam:!WEDGED";
  if (/registry/.test(c)) return "beam:registry-closed";
  if (/compile|stale beam|rebuilt/.test(c)) return "beam:!STALE";
  if (/dead|restart/.test(c)) return "beam:!DEAD";
  return `custom:${cond.trim()}`;
}

export function buildQueue(legs: RefireLeg[]): RefireQueueEntry[] {
  return legs.map((l) => ({
    ...l,
    conditionKey: conditionKey(l.resumeCondition),
  }));
}

/** Queue file format: JSONL indexed by resume condition. */
export function writeQueueFile(
  queueFile: string,
  entries: RefireQueueEntry[],
): void {
  fs.mkdirSync(path.dirname(queueFile), { recursive: true });
  fs.writeFileSync(
    queueFile,
    `${entries.map((e) => JSON.stringify(e)).join("\n")}\n`,
  );
}

export function readQueueFile(queueFile: string): RefireQueueEntry[] {
  const text = fs.readFileSync(queueFile, "utf8");
  return text
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as RefireQueueEntry);
}

/** Does the current probe state satisfy a condition key? */
export function conditionSatisfied(
  key: string,
  state: ProbeState,
): boolean {
  if (key === "manual") return false;
  if (key === "beam:SERVING") return state.state === "SERVING";
  if (key === "beam:registry-closed")
    return (
      state.state === "SERVING" && state.doctorClass !== "REGISTRY-GAP"
    );
  const neg = key.startsWith("beam:!");
  const target = neg ? key.slice(6) : key.replace(/^beam:/, "");
  if (["DEAD", "WEDGED", "STALE", "SERVING"].includes(target)) {
    return neg ? state.state !== (target as WireState) : state.state === target;
  }
  return false;
}

/**
 * refire — given the queue and the CURRENT probe state, emit the legs whose
 * resume conditions are satisfied (candidate re-fire legs). `manual` legs are
 * reported separately, never auto-emitted.
 */
export function refire(
  entries: RefireQueueEntry[],
  state: ProbeState,
): { fireable: RefireQueueEntry[]; manual: RefireQueueEntry[] } {
  const fireable = entries.filter((e) => conditionSatisfied(e.conditionKey, state));
  const manual = entries.filter((e) => e.conditionKey === "manual");
  return { fireable, manual };
}
