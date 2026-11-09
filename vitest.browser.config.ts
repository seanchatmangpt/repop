import { defineConfig } from "vitest/config";

/**
 * C15 lane (wave v26.11.8) — browser project: REAL chromium via the
 * playwright provider (Chicago law — no jsdom stub for worker/SAB/wasm
 * surfaces; P15 D1/D2). Referenced as a project from vitest.config.ts and
 * runnable standalone:
 *
 *   npx vitest run --config vitest.browser.config.ts
 *
 * The playwright provider in vitest 3 requires `playwright` (or
 * playwright-core) installed at the workspace root — see root
 * package.json devDependencies.
 */
export default defineConfig({
  test: {
    name: "browser",
    include: ["packages/*/src/**/*.browser.test.{ts,tsx}"],
    browser: {
      enabled: true,
      name: "chromium",
      provider: "playwright",
      headless: true,
    },
  },
});
