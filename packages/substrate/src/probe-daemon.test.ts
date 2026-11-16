import { afterAll, describe, expect, it } from "vitest";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  appendTick,
  classify,
  probeOnce,
  readCredentials,
  type ProbeWitnesses,
} from "./probe-daemon.ts";

const serving: ProbeWitnesses = {
  healthStatus: 200,
  unauthStatus: 401,
  processAlive: true,
  haveCredentials: true,
  actionRows: true,
};

describe("classify — SOP-002 four-state wire triage", () => {
  it("DEAD: listener refused + no process witness", () => {
    expect(
      classify({
        healthStatus: "000",
        unauthStatus: "000",
        processAlive: false,
        haveCredentials: true,
      }),
    ).toMatchObject({ state: "DEAD", doctorClass: "RED-DOWN" });
  });

  it("WEDGED: process alive but listener refusing — bounce, not wait", () => {
    expect(
      classify({
        healthStatus: "000",
        unauthStatus: "000",
        processAlive: true,
        haveCredentials: true,
      }),
    ).toMatchObject({ state: "WEDGED", doctorClass: "RED-DOWN-WEDGED" });
  });

  it("STALE: identity green but registry gap", () => {
    expect(
      classify({
        ...serving,
        actionRows: false,
        actionBody: '{"error":"action_not_found"}',
      }),
    ).toMatchObject({ state: "STALE", doctorClass: "REGISTRY-GAP" });
  });

  it("STALE: rpc answers non-row body (compile-error class)", () => {
    expect(
      classify({ ...serving, actionRows: false, actionBody: "no entries" }),
    ).toMatchObject({ state: "STALE", doctorClass: "RED-COMPILE" });
  });

  it("SERVING: identity green + action probe rows", () => {
    expect(classify(serving)).toMatchObject({ state: "SERVING", doctorClass: "GREEN" });
  });

  it("unexpected health/unauth pair is STALE, never SERVING", () => {
    expect(
      classify({ ...serving, unauthStatus: 200 }),
    ).toMatchObject({ state: "STALE" });
  });
});

describe("probeOnce — real wire over a real local server", () => {
  let server: http.Server;
  let url: string;
  const hits: string[] = [];

  beforeAllData();

  function beforeAllData() {
    server = http.createServer((req, res) => {
      hits.push(`${req.method} ${req.url}`);
      if (req.url === "/health") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
      } else if (req.url === "/api/health") {
        res.writeHead(401, { "content-type": "application/json" });
        res.end("missing or invalid Bearer token");
      } else if (req.url === "/auth/token" && req.method === "POST") {
        let body = "";
        req.on("data", (c: Buffer) => (body += c));
        req.on("end", () => {
          const parsed = JSON.parse(body) as { email?: string; password?: string };
          if (parsed.email === "e@x.test" && parsed.password === "pw") {
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify({ token: "tok123" }));
          } else {
            res.writeHead(401);
            res.end("{}");
          }
        });
      } else if (req.url === "/internal-api/rpc/run" && req.method === "POST") {
        let body = "";
        req.on("data", (c: Buffer) => (body += c));
        req.on("end", () => {
          const auth = req.headers.authorization;
          if (auth !== "Bearer tok123") {
            res.writeHead(401);
            res.end("{}");
            return;
          }
          const parsed = JSON.parse(body) as { action?: string };
          res.writeHead(200, { "content-type": "application/json" });
          res.end(
            parsed.action === "list_lookup_values"
              ? JSON.stringify({ data: [{ id: "1", label: "repair" }] })
              : JSON.stringify({ error: "action_not_found" }),
          );
        });
      } else {
        res.writeHead(404);
        res.end();
      }
    });
  }

  it("classifies a serving target through the real HTTP path", async () => {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address() as { port: number };
    url = `http://127.0.0.1:${addr.port}`;

    const credsDir = fs.mkdtempSync(path.join(os.tmpdir(), "substrate-probe-"));
    const credsPath = path.join(credsDir, ".env.local");
    fs.writeFileSync(
      credsPath,
      "VITE_E2E_DEV_USERNAME=e@x.test\nVITE_E2E_DEV_PASSWORD=pw\n",
    );
    expect(readCredentials(credsPath)).toEqual({ email: "e@x.test", password: "pw" });

    const snap = await probeOnce({
      targetUrl: url,
      periodMs: 60000,
      credentialsPath: credsPath,
      logPath: path.join(credsDir, "log.jsonl"),
      probeTimeoutMs: 5000,
      // avoid a real pgrep dependency in the wire leg: the serving witness
      // comes from the live HTTP round-trips themselves
      processPattern: "substrate-no-such-process",
    });
    // processAlive=false + wire green still classifies SERVING (health+auth+rows)
    expect(snap.state).toBe("SERVING");
    expect(snap.doctorClass).toBe("GREEN");
    expect(snap.actionProbeDigest).not.toBe("none");
    expect(hits.some((h) => h.includes("/internal-api/rpc/run"))).toBe(true);

    const logPath = path.join(credsDir, "log.jsonl");
    appendTick(logPath, snap);
    const line = JSON.parse(
      fs.readFileSync(logPath, "utf8").trim().split("\n").pop() as string,
    ) as Record<string, string>;
    expect(line).toMatchObject({ state: "SERVING", doctorClass: "GREEN" });
    expect(Object.keys(line)).toContain("action_probe");
  });

  it("classifies a dead port as DEAD through the real connection path", async () => {
    const snap = await probeOnce({
      targetUrl: "http://127.0.0.1:1",
      periodMs: 60000,
      logPath: "/tmp/substrate-dead.jsonl",
      probeTimeoutMs: 1000,
      processPattern: "substrate-no-such-process",
    });
    expect(snap.state).toBe("DEAD");
  });

  afterAll(() => {
    server?.close();
  });
});
