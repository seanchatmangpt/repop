import { expect, test } from "@playwright/test";

/**
 * C15 lane — boot smoke (P15 D3, worker-ready beacon leg).
 *
 * FAIL-CLOSED: this spec hard-asserts the worker-ready beacon. There is
 * no skip inside the spec. The GATE decides whether the leg runs at all:
 * scripts/verify.sh only invokes it when an app surface (root
 * index.html) exists; with no app surface the gate emits a loud
 * `[SKIP]` line and the exit law classifies the run (exit 3 = loud skip,
 * never a silent green).
 *
 * The beacon contract is a DOM-visible signal (P15 D3: await a DOM
 * event/selector, not worker frame internals, to avoid a P9 dependency
 * in the spec body): the app composition root must set
 * `document.documentElement.dataset.repopWorkerReady = "ready"` once
 * the AtomVM worker reaches ready.
 */
test("worker reaches ready and posts a DOM-visible beacon", async ({
  page,
}) => {
  await page.goto("/");
  const beacon = await page
    .locator('html[data-repop-worker-ready="ready"]')
    .waitFor({ state: "attached", timeout: 30_000 });
  expect(beacon).not.toBeNull();
});
