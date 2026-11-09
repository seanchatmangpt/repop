import { expect, test } from "@playwright/test";

/**
 * C15 lane — COI smoke (P15 D3). Fail-closed: if the dev server is
 * missing the COOP/COEP credentialless headers (C14's vite.config.ts
 * server.headers), `window.crossOriginIsolated` is false and this spec
 * is RED. No skip path for missing COI.
 *
 * Mutation leg (documented, run when auditing this gate): remove
 * `Cross-Origin-Opener-Policy` from vite.config.ts server.headers →
 * this spec must turn red; restore → green.
 */

const FIXTURE = "/playwright/smoke/fixtures/coi.html";

test("dev server sets COOP/COEP so the page is crossOriginIsolated", async ({
  page,
}) => {
  const response = await page.goto(FIXTURE);
  expect(response, "fixture page must load from the dev server").not.toBeNull();

  // Header-level assertion: fail-closed even if a browser quirk ever
  // muddied the window-level signal.
  expect(response?.headers()["cross-origin-opener-policy"]).toBe(
    "same-origin",
  );
  expect(response?.headers()["cross-origin-embedder-policy"]).toBe(
    "credentialless",
  );

  const coi = await page.evaluate(() => ({
    isolated: window.crossOriginIsolated,
    sab: (() => {
      try {
        new SharedArrayBuffer(8);
        return true;
      } catch {
        return false;
      }
    })(),
  }));
  expect(coi.isolated, "window.crossOriginIsolated must be true").toBe(true);
  expect(coi.sab, "SharedArrayBuffer must be constructible").toBe(true);
});
