// Vitest config — scoped to React hook tests under src/hooks/__tests__/.
// Other test suites continue to use node:test via the existing `npm test`
// pipeline. This config only owns the React-DOM surface where node:test
// can't run (no DOM, no JSX renderer).

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  // Disable Vite's PostCSS auto-discovery — Tailwind's postcss.config.mjs
  // exports a plugin shape Vite's PostCSS loader rejects, and the hook
  // tests don't need CSS at all.
  css: {
    postcss: { plugins: [] },
  },
  test: {
    environment: "happy-dom",
    include: ["src/hooks/__tests__/**/*.test.{ts,tsx}"],
    globals: false,
    css: false,
    restoreMocks: true,
    clearMocks: true,
  },
});
