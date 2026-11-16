/**
 * Zero-JSON gate (P9): no JSON serialization anywhere in the protocol
 * surface. The gate scans the protocol sources on disk for JSON usage.
 *
 * Anti-vacuity kill: the gate's predicate is run against an injected
 * JSON-using token file and MUST detect it, and against a clean token
 * file and MUST pass — a gate that cannot kill the injected token (or
 * that refuses clean code) is a vacuous gate and fails this test.
 */

import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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
  /**
   * Allowlist: protocol files where JSON serialization is lawful. The A2A
   * bridge (a2a.ts, seam S1) is the single named exception — every OTHER
   * protocol source (enumerated from the directory, so a new file cannot
   * silently escape the scan) must pass the predicate.
   */
  const ALLOWLIST = new Set(["a2a.ts"]);
  const files = readdirSync(PROTOCOL_DIR).filter(
    (f) => f.endsWith(".ts") && !ALLOWLIST.has(f),
  );

  it("gate allowlist is non-empty and only names the A2A boundary", () => {
    expect([...ALLOWLIST]).toEqual(["a2a.ts"]);
    // the exception must exist, or the allowlist is stale
    expect(existsSync(join(PROTOCOL_DIR, "a2a.ts"))).toBe(true);
  });

  it("no protocol source uses JSON serialization", () => {
    expect(files.length).toBeGreaterThan(0);
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
