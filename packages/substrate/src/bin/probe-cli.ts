#!/usr/bin/env node
/**
 * repop-probe-daemon CLI — run one probe tick (--once) or the continuous
 * daemon loop (--daemon, default when --once is absent; one JSONL tick per
 * period, minute cadence by default). On a non-GREEN→GREEN transition the
 * --on-green command is executed once (output captured next to the log).
 * Usage:
 *   node src/bin/probe-cli.ts --target http://localhost:4000 \
 *     --period 60000 --credentials /path/.env.local \
 *     --log .run/beam-state.log [--once] [--daemon] [--on-green "<cmd>"]
 */
import path from "node:path";
import {
  appendTick,
  probeOnce,
  startDaemon,
  type ProbeConfig,
} from "../probe-daemon.ts";

function arg(k: string): string | undefined {
  const i = process.argv.indexOf(k);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const target = arg("--target") ?? "http://localhost:4000";
const onGreen = arg("--on-green");
const cfg: ProbeConfig & { onGreenCommand?: string } = {
  targetUrl: target,
  periodMs: Number(arg("--period") ?? 60000),
  credentialsPath: arg("--credentials") as string | undefined,
  logPath: path.resolve(arg("--log") ?? ".run/beam-state.log"),
  ...(onGreen !== undefined ? { onGreenCommand: onGreen } : {}),
};

if (process.argv.includes("--once")) {
  const snap = await probeOnce(cfg);
  appendTick(cfg.logPath, snap);
  console.log(
    `${snap.ts} ${snap.state} (${snap.doctorClass}) action_probe=${snap.actionProbeDigest} — ${snap.detail}`,
  );
  console.log(`tick appended to ${cfg.logPath}`);
  // SOP-005 exit-code contract: 0 verified / 1 dead / 2 wedged / 3 vacuous
  process.exit(
    snap.state === "SERVING" ? 0 : snap.state === "DEAD" ? 1 : snap.state === "WEDGED" ? 2 : 3,
  );
}

console.log(
  `probe-daemon: target=${target} period=${cfg.periodMs}ms log=${cfg.logPath}` +
    (onGreen ? ` on-green=${JSON.stringify(onGreen)}` : "") +
    " (Ctrl-C to stop)",
);
const daemon = startDaemon(cfg);
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    console.log(`probe-daemon: ${sig} — closing cleanly`);
    daemon.stop();
    process.exit(0);
  });
}
