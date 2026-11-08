import { defineConfig } from "@playwright/test";

/**
 * C15 lane (wave v26.11.8) — crossOriginIsolated smoke (P15 D3/D4).
 *
 * Boots the vite dev server (C14's server.headers supply the
 * COOP/COEP credentialless set) and runs the smoke specs under
 * playwright/smoke/. Fail-closed: a missing header turns the COI spec
 * red — there is no skip path for missing COI (E20: COI is
 * environment-fragile; the smoke exists to catch exactly that).
 *
 *   pnpm exec playwright test --config playwright.smoke.config.ts
 */
export default defineConfig({
  testDir: "./playwright/smoke",
  timeout: 30_000,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
  },
  webServer: {
    // One header source: the C14 vite.config.ts server.headers are the
    // only COOP/COEP map; this server serves the smoke fixture and (once
    // it lands) the app surface. strictPort so a port collision is a
    // loud infra failure, never a silently-different server.
    command: "pnpm exec vite --port 5173 --strictPort",
    port: 5173,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
