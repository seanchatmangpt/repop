import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildQueue,
  conditionKey,
  conditionSatisfied,
  readQueueFile,
  refire,
  scanReceipts,
  writeQueueFile,
} from "./refire-queue.ts";

function makeReceiptsDir(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "substrate-refire-"));
  for (const [name, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), body);
  }
  return dir;
}

describe("scanReceipts — mechanical derivation from receipt files", () => {
  it("extracts BLOCKED legs with named unblock + resume condition", () => {
    const dir = makeReceiptsDir({
      "K7-login-sla.md":
        "# K7 login SLA\nStanding: BLOCKED — 3.9s login outliers\n" +
        "Unblock: backend session (bounce :4000)\n" +
        "Resume when: beam SERVING on :4000\n",
      "T030-FE.md": "# landed lane\nStanding: PASS\n",
      "TENANT-ARM.md":
        "# tenant arm\nStanding: BLOCKED\n" +
        "Unblock: operator decision receipt\n" +
        "Resume when: manual — family-flag flip approval\n",
      "notes.txt": "not a receipt",
    });
    const legs = scanReceipts(dir);
    expect(legs).toHaveLength(2);
    const k7 = legs.find((l) => l.lane === "K7-login-sla");
    expect(k7).toMatchObject({
      unblock: "backend session (bounce :4000)",
      resumeCondition: "beam SERVING on :4000",
    });
    expect(k7?.standing.startsWith("BLOCKED")).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("returns [] for a missing dir (loud emptiness, never throw)", () => {
    expect(scanReceipts("/tmp/substrate-no-such-dir-xyz")).toEqual([]);
  });
});

describe("conditionKey + refire — queue indexed by resume condition", () => {
  const legs = [
    {
      receipt: "/r/k7.md",
      lane: "K7",
      standing: "BLOCKED",
      unblock: "backend session",
      resumeCondition: "beam SERVING on :4000",
    },
    {
      receipt: "/r/ten.md",
      lane: "TENANT",
      standing: "BLOCKED",
      unblock: "operator",
      resumeCondition: "manual — flip approval",
    },
  ];

  it("classifies conditions into the closed key vocabulary", () => {
    expect(conditionKey("beam SERVING on :4000")).toBe("beam:SERVING");
    expect(conditionKey("manual — flip approval")).toBe("manual");
    expect(conditionKey("registry gap closed")).toBe("beam:registry-closed");
    expect(conditionKey("some novel condition")).toBe("custom:some novel condition");
  });

  it("refire emits only legs whose conditions the current state satisfies", () => {
    const queue = buildQueue(legs);
    const serving = { state: "SERVING" as const, doctorClass: "GREEN" };
    const dead = { state: "DEAD" as const };

    const up = refire(queue, serving);
    expect(up.fireable.map((l) => l.lane)).toEqual(["K7"]);
    expect(up.manual.map((l) => l.lane)).toEqual(["TENANT"]);

    // a manual condition is never auto-fired, whatever the wire says
    const down = refire(queue, dead);
    expect(down.fireable).toEqual([]);
    expect(down.manual).toHaveLength(1);
  });

  it("queue file round-trips through disk (Law 2: state re-readable)", () => {
    const queue = buildQueue(legs);
    const file = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "substrate-q-")),
      "queue.jsonl",
    );
    writeQueueFile(file, queue);
    expect(readQueueFile(file)).toEqual(queue);
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
  });

  it("conditionSatisfied evaluates the negation form", () => {
    expect(conditionSatisfied("beam:!DEAD", { state: "WEDGED" })).toBe(true);
    expect(conditionSatisfied("beam:!DEAD", { state: "DEAD" })).toBe(false);
  });
});
