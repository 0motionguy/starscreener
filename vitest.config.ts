// Vitest config — scoped to React-surface tests (anything that needs a DOM
// renderer or imports JSX). Other test suites continue to use node:test via
// the existing `npm test` pipeline. This config owns hooks (src/hooks/),
// components (src/components/), and pure helpers under src/lib/ that are
// easier to test alongside the React-surface code.

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
    include: [
      "src/hooks/__tests__/**/*.test.{ts,tsx}",
      "src/components/**/__tests__/**/*.test.{ts,tsx}",
      "src/lib/__vitest__/**/*.test.{ts,tsx}",
      // V4 funding aggregate tests live alongside the helper. The
      // `npm test` glob only sees `src/lib/__tests__/*.test.ts` (top
      // level, no nesting) so funding/__tests__/ doesn't double-run
      // under tsx --test.
      "src/lib/funding/__tests__/**/*.test.{ts,tsx}",
    ],
    // src/lib/__tests__/* and src/lib/pipeline/__tests__/* run under
    // node:test via `npm test` — vitest can't read those (no
    // describe/it suite at top-level). Vitest-specific lib tests live
    // under src/lib/__vitest__/ to keep the runners cleanly separated:
    // `tsx --test` globs `src/lib/__tests__/*.test.ts`, vitest globs
    // `src/lib/__vitest__/**`. No file is matched by both.
    globals: false,
    css: false,
    restoreMocks: true,
    clearMocks: true,
  },
});
