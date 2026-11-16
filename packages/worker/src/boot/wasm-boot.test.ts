import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkExportContract,
  KERNEL_EXPORT_ALLOWLIST,
  STRUCTURAL_EXPORTS,
} from "./wasm-boot.ts";

/**
 * Authority file for the kernel export contract (P4, lane C6), resolved
 * relative to this test file (src/boot → repo root) so the guard works
 * regardless of the vitest working directory. If the gate file moves,
 * the read throws and the drift-guard tests fail loudly (fail-closed).
 */
const FOOTPRINT_GATE = join(
  import.meta.dirname!,
  "../../../../kernel/scripts/footprint_gate.py",
);

/** Parse the REPOP_FUNCS table out of footprint_gate.py. Returns null on any structural drift. */
function parseFootprintGateFuncs(source: string): string[] | null {
  const table = source.match(/REPOP_FUNCS\s*=\s*\[([^\]]*)\]/);
  if (!table) return null;
  const names = [...(table[1] ?? "").matchAll(/"([^"]+)"/g)]
    .map((m) => m[1])
    .filter((n): n is string => n !== undefined);
  if (names.length === 0) return null;
  return names;
}

describe("wasm exports contract", () => {
  it("allowlist matches the kernel footprint gate exactly (drift guard)", () => {
    let source: string;
    try {
      source = readFileSync(FOOTPRINT_GATE, "utf8");
    } catch (err) {
      // Fail-closed: if the gate file moves or disappears, this test fails
      // loudly rather than silently passing an unpinned contract.
      throw new Error(
        `drift guard: cannot read authority file ${FOOTPRINT_GATE} — ` +
          `the allowlist has no authority to match against. Re-point ` +
          `FOOTPRINT_GATE at the moved gate. (${String(err)})`,
      );
    }
    const pinned = parseFootprintGateFuncs(source);
    if (pinned === null) {
      throw new Error(
        `drift guard: could not parse REPOP_FUNCS from ${FOOTPRINT_GATE} — ` +
          `the gate's export table changed shape; re-pin both sides.`,
      );
    }
    expect([...KERNEL_EXPORT_ALLOWLIST].sort()).toEqual([...pinned].sort());
  });

  it("structural exports match the gate's STRUCTURAL_EXPORTS set", () => {
    const source = readFileSync(FOOTPRINT_GATE, "utf8");
    const table = source.match(/STRUCTURAL_EXPORTS\s*=\s*\{([^\}]*)\}/);
    expect(table).not.toBeNull();
    const names = [...(table![1] ?? "").matchAll(/"([^"]+)"/g)]
      .map((m) => m[1])
      .filter((n): n is string => n !== undefined);
    expect([...STRUCTURAL_EXPORTS].sort()).toEqual([...names].sort());
  });

  it("allowlist is pinned and non-empty", () => {
    expect(KERNEL_EXPORT_ALLOWLIST.length).toBeGreaterThan(0);
  });

  it("accepts an exact export surface", () => {
    const exports = KERNEL_EXPORT_ALLOWLIST.map((name) => ({ name, kind: "function" }));
    expect(checkExportContract(exports)).toEqual({ ok: true });
  });

  it("accepts the real artifact surface (pinned + structural)", () => {
    const exports = [
      ...KERNEL_EXPORT_ALLOWLIST.map((name) => ({ name, kind: "function" })),
      ...STRUCTURAL_EXPORTS.map((name) => ({ name, kind: kindOf(name) })),
    ];
    expect(checkExportContract(exports)).toEqual({ ok: true });
  });

  it("refuses a missing export fail-closed", () => {
    const exports = KERNEL_EXPORT_ALLOWLIST.slice(1).map((name) => ({ name, kind: "function" }));
    const v = checkExportContract(exports);
    expect(v.ok).toBe(false);
  });

  it("refuses extra exports", () => {
    const exports = [...KERNEL_EXPORT_ALLOWLIST, "repop_backdoor"].map(
      (name) => ({ name, kind: "function" }),
    );
    const v = checkExportContract(exports);
    expect(v.ok).toBe(false);
  });
});

function kindOf(name: string): string {
  return name === "memory" ? "memory" : "function";
}
