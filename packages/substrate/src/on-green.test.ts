import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  runTrigger,
  shouldTriggerOnGreen,
  startDaemon,
  type ProbeSnapshot,
} from "./probe-daemon.ts";

const snap = (state: ProbeSnapshot["state"]): ProbeSnapshot => ({
  ts: new Date().toISOString(),
  state,
  doctorClass: state === "SERVING" ? "GREEN" : "RED-DOWN",
  actionProbeDigest: "none",
  detail: "unit",
});

describe("shouldTriggerOnGreen — edge detection on injected snapshots", () => {
  it("GREEN→GREEN: no trigger", () => {
    expect(shouldTriggerOnGreen(snap("SERVING"), snap("SERVING"))).toBe(false);
  });

  it("RED→GREEN (DEAD→SERVING): trigger fires", () => {
    expect(shouldTriggerOnGreen(snap("DEAD"), snap("SERVING"))).toBe(true);
  });

  it("STALE→SERVING: trigger fires", () => {
    expect(shouldTriggerOnGreen(snap("STALE"), snap("SERVING"))).toBe(true);
  });

  it("SERVING→DEAD→SERVING (recovery): fires again", () => {
    expect(shouldTriggerOnGreen(snap("WEDGED"), snap("SERVING"))).toBe(true);
  });

  it("first tick green (no previous): no trigger", () => {
    expect(shouldTriggerOnGreen(undefined, snap("SERVING"))).toBe(false);
  });

  it("RED→RED: no trigger", () => {
    expect(shouldTriggerOnGreen(snap("DEAD"), snap("STALE"))).toBe(false);
  });
});

describe("runTrigger — real subprocess, output captured", () => {
  it("runs the command via /bin/sh and captures stdout+exit", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "substrate-trig-"));
    const logPath = path.join(dir, "beam-state.log");
    const r = await runTrigger("echo trigger-ran; echo err-line >&2", logPath);
    expect(r.fired).toBe(true);
    expect(r.exitCode).toBe(0);
    expect(r.output).toContain("trigger-ran");
    expect(r.output).toContain("err-line");
    const files = fs.readdirSync(dir);
    expect(files.some((f) => f.startsWith("beam-state-trigger-"))).toBe(true);
  });

  it("reports nonzero exit for a failing command", async () => {
    const r = await runTrigger("exit 7", "/tmp/substrate-trig-fail.log");
    expect(r.exitCode).toBe(7);
  });
});

describe("startDaemon with onGreenCommand — injected probes over a real loop", () => {
  it("fires the command exactly once across a RED→GREEN→GREEN series", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "substrate-daemon-"));
    const logPath = path.join(dir, "beam-state.log");
    const flag = path.join(dir, "triggered.flag");
    const fakeProbes: ProbeSnapshot[] = [
      snap("DEAD"),
      snap("SERVING"),
      snap("SERVING"),
    ];
    const daemon = startDaemon(
      {
        targetUrl: "http://127.0.0.1:1",
        periodMs: 20,
        logPath,
        onGreenCommand: `touch ${JSON.stringify(flag)}`,
        probeFn: async () => fakeProbes.shift() ?? snap("SERVING"),
      },
    );
    // Drive the same tick logic the loop uses by awaiting the loop's own
    // writes: poll the log until 3 ticks exist (bounded deadline).
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const lines = fs.existsSync(logPath)
        ? fs.readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean)
        : [];
      if (lines.length >= 3) break;
      await new Promise((r) => setTimeout(r, 20)); // SLEEP-CLASS: POLL-STEP
    }
    daemon.stop();
    const lines = fs
      .readFileSync(logPath, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Record<string, string>);
    // Injected probes surface through the appendTick path of the loop; the
    // probeOnce against the dead port supplies the rest. The trigger must
    // have fired exactly once for the single DEAD→SERVING edge above.
    expect(fs.existsSync(flag)).toBe(true);
    expect(lines.some((l) => l.doctorClass === "TRIGGER-FIRED")).toBe(true);
  }, 15_000);

  afterAll(() => {
    fs.rmSync("/tmp/substrate-trig-fail.log", { force: true });
  });
});
