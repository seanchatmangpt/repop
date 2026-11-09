import { defineConfig } from "vite";

/**
 * P7 lane (wave v26.11.8): COOP/COEP credentialless headers per wave-1
 * resolution R5/E16. `credentialless` avoids breaking Google Fonts.
 * amplify.yml customHeaders is P15's file, not this one.
 */
export default defineConfig({
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "credentialless",
    },
  },
});
