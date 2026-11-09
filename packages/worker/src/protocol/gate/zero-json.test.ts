/**
 * Zero-JSON gate (P9): no JSON serialization anywhere in the protocol
 * surface. The gate scans the protocol sources on disk for JSON usage.
 *
 * Anti-vacuity kill: the gate's predicate is run against an injected
 * JSON-using token file and MUST detect it, and against a clean token
 * file and MUST pass — a gate that cannot kill the injected token (or
 * that refuses clean code) is a vacuous gate and fails this test.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const PROTOCOL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** The gate predicate: true when the source text violates zero-JSON. */
function violatesZeroJson(text: string): boolean {
  return /\bJSON\s*\.\s*(parse|stringify|rawJSON)\b/.test(text);
}

describe("zero-json gate", () => {
  const files = ["frame.ts", "frameKind.ts", "router.ts", "routerError.ts", "correlation.ts", "seq.ts", "refusal.ts", "transport.ts", "index.ts"];

  it("no protocol source uses JSON serialization", () => {
    for (const f of files) {
      const text = readFileSync(join(PROTOCOL_DIR, f), "utf8");
      expect(violatesZeroJson(text), `${f} uses JSON`).toBe(false);
    }
  });

  it("kill leg: injected JSON token is detected (gate is not vacuous)", () => {
    const dir = mkdtempSync(join(tmpdir(), "zero-json-"));
    try {
      const dirty = join(dir, "dirty.ts");
      writeFileSync(dirty, "export const x = JSON.parse('{\"a\":1}');\n", "utf8");
      expect(violatesZeroJson(readFileSync(dirty, "utf8"))).toBe(true);

      const clean = join(dir, "clean.ts");
      writeFileSync(clean, "export const y = 1;\n", "utf8");
      expect(violatesZeroJson(readFileSync(clean, "utf8"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
