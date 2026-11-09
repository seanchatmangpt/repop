import { defineConfig } from "vitest/config";
import { configDefaults } from "vitest/config";

/**
 * C15 lane (wave v26.11.8) — root vitest runner. Two projects:
 *
 *  - unit:    jsdom, plain `*.test.ts(x)` only. Excludes `*.browser.test.*`
 *             (jsdom has no SharedArrayBuffer / Atomics.wait — P15 D2).
 *  - browser: declared in vitest.browser.config.ts, referenced here as a
 *             project so `--project unit` and `--project browser` select
 *             disjoint surfaces from one entry point.
 *
 * The `.test` vs `.browser.test` suffix is the ONLY routing signal
 * (P15 D2). scripts/test_file_convention_gate.py enforces the suffix law
 * and refuses wasm/SAB/Worker construction in jsdom-routed files.
 */

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        test: {
          name: "unit",
          environment: "jsdom",
          include: [
            "packages/*/src/**/*.test.ts",
            "packages/*/src/**/*.test.tsx",
          ],
          exclude: [
            ...configDefaults.exclude,
            "**/*.browser.test.*",
          ],
        },
      },
      // vitest 3 packaging note (disclosed in c15 receipt): the contract's
      // `@vitest/browser-playwright` name is vitest-4 packaging; the tree
      // pins vitest ^3.2 (package-level test files must match the runner
      // major), where the playwright provider ships inside @vitest/browser.
      "vitest.browser.config.ts",
    ],
  },
});
