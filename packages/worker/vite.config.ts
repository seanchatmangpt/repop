import { defineConfig } from "vite";
import { resolve } from "node:path";

/**
 * Worker-bundle build (I4 / seam S5) — lib mode, single ESM worker file.
 *
 * Entry `src/worker-main.ts` carries the namespace barrel (`export * from
 * "./index.ts"`) plus the postMessage boot surface. Output
 * `dist/repop.worker.js` is the artifact the servengine vendored package
 * consumes (worker-dist/ + public/ staging, per the P19 origin-root law).
 */
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, "src/worker-main.ts"),
      formats: ["es"],
      fileName: "repop.worker",
    },
    target: "es2022",
    rollupOptions: {
      external: [],
    },
  },
});
