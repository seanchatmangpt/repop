import { describe, expect, it } from "vitest";
import { checkExportContract, KERNEL_EXPORT_ALLOWLIST } from "./wasm-boot.ts";

describe("wasm exports contract", () => {
  it("allowlist is pinned and non-empty", () => {
    expect(KERNEL_EXPORT_ALLOWLIST.length).toBeGreaterThan(0);
  });

  it("accepts an exact export surface", () => {
    const exports = KERNEL_EXPORT_ALLOWLIST.map((name) => ({ name, kind: "function" }));
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
