import { describe, expect, it } from "vitest";
import { probeCoi, tryConstructSabInRealm } from "./detect.ts";

describe("coi detect", () => {
  it("probe trusts the construct probe over the flag (flag true, SAB fails)", () => {
    const status = probeCoi({
      crossOriginIsolated: true,
      tryConstructSab: () => false,
      serviceWorkerSupported: true,
    });
    expect(status.sabConstructible).toBe(false);
  });

  it("probe trusts the construct probe (flag false, SAB passes)", () => {
    const status = probeCoi({
      crossOriginIsolated: false,
      tryConstructSab: () => true,
      serviceWorkerSupported: true,
    });
    expect(status.sabConstructible).toBe(true);
  });

  it("real-realm probe returns a boolean", () => {
    expect(typeof tryConstructSabInRealm()).toBe("boolean");
  });
});
