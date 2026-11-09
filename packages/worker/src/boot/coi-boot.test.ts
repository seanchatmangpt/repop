import { describe, expect, it } from "vitest";
import {
  RELOAD_GUARD_KEY,
  memoryGuardStore,
  reloadGuardSpent,
  guardedReload,
} from "./coi-boot.ts";

describe("reload guard", () => {
  it("fires once then refuses", () => {
    const store = memoryGuardStore();
    let n = 0;
    const bump = () => { n += 1; };
    guardedReload(store, bump);
    guardedReload(store, bump);
    guardedReload(store, bump);
    expect(n).toBe(1);
    expect(reloadGuardSpent(store)).toBe(true);
    expect(store.getItem(RELOAD_GUARD_KEY)).not.toBe(null);
  });

  it("pre-spent guard refuses without firing", () => {
    const store = memoryGuardStore();
    store.setItem(RELOAD_GUARD_KEY, "1");
    let n = 0;
    guardedReload(store, () => { n += 1; });
    expect(n).toBe(0);
  });
});
