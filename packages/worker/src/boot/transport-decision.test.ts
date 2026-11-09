import { describe, expect, it } from "vitest";
import { decideTransport } from "./transport-decision.ts";

describe("transport decision table", () => {
  it("picks sab when SAB is constructible (ground truth)", () => {
    expect(
      decideTransport({ sabConstructible: true, serviceWorkerSupported: false, reloadGuardSpent: false }),
    ).toBe("sab");
  });

  it("picks fallback when no SW container", () => {
    expect(
      decideTransport({ sabConstructible: false, serviceWorkerSupported: false, reloadGuardSpent: false }),
    ).toBe("fallback");
  });

  it("picks fallback when the reload guard is already spent", () => {
    expect(
      decideTransport({ sabConstructible: false, serviceWorkerSupported: true, reloadGuardSpent: true }),
    ).toBe("fallback");
  });

  it("picks reload-and-reprobe only when guard unspent and SW present", () => {
    expect(
      decideTransport({ sabConstructible: false, serviceWorkerSupported: true, reloadGuardSpent: false }),
    ).toBe("reload-and-reprobe");
  });
});
