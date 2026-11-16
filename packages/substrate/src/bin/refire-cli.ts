#!/usr/bin/env node
/**
 * repop-refire CLI — derive the re-fire queue from a receipts dir, then
 * emit legs whose resume conditions the current probe state satisfies.
 *
 *   node src/bin/refire-cli.ts --receipts-dir <dir> --state-file <probe jsonl>
 *     [--queue-file .run/refire-queue.jsonl] [--emit]
 *
 * With --state-file omitted the current wire state is probed once from
 * --target (default http://localhost:4000).
 */
import fs from "node:fs";
import path from "node:path";
import { probeOnce } from "../probe-daemon.ts";
import {
  buildQueue,
  refire,
  scanReceipts,
  writeQueueFile,
  type ProbeState,
} from "../refire-queue.ts";

function arg(k: string): string | undefined {
  const i = process.argv.indexOf(k);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const receiptsDir = arg("--receipts-dir");
if (!receiptsDir) {
  console.error("usage: refire-cli --receipts-dir <dir> [--state-file <jsonl>] [--emit]");
  process.exit(2);
}
const queueFile = path.resolve(arg("--queue-file") ?? ".run/refire-queue.jsonl");

const legs = scanReceipts(receiptsDir);
const queue = buildQueue(legs);
writeQueueFile(queueFile, queue);
console.log(`queue: ${queue.length} BLOCKED legs -> ${queueFile}`);

let state;
const stateFile = arg("--state-file");
if (stateFile) {
  const lines = fs.readFileSync(stateFile, "utf8").trim().split("\n");
  const last = JSON.parse(lines[lines.length - 1] as string) as {
    state: string;
    doctorClass?: string | undefined;
  };
  state = {
    state: last.state as ProbeState["state"],
    doctorClass: last.doctorClass,
  };
} else {
  const snap = await probeOnce({
    targetUrl: arg("--target") ?? "http://localhost:4000",
    periodMs: 60000,
    logPath: path.resolve(".run/beam-state.log"),
  });
  state = { state: snap.state, doctorClass: snap.doctorClass };
}
console.log(`probe state: ${state.state} (${state.doctorClass ?? "?"})`);

const { fireable, manual } = refire(queue, state);
if (process.argv.includes("--emit")) {
  for (const leg of fireable) {
    console.log(
      `REFIRE ${leg.lane} <- ${leg.receipt} (condition ${leg.conditionKey} satisfied by ${state.state})`,
    );
  }
}
console.log(`fireable now: ${fireable.length}; manual-gated: ${manual.length}`);
for (const leg of manual) {
  console.log(`  MANUAL ${leg.lane}: ${leg.resumeCondition}`);
}
