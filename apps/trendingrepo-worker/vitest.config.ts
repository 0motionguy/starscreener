import { defineConfig } from 'vitest/config';

export default defineConfig({
  // CSS handling disabled so vitest doesn't climb to the monorepo root
  // and try to load the Next.js postcss config (Tailwind plugin shape).
  css: {
    postcss: {
      plugins: [],
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    testTimeout: 30_000,
    css: false,
  },
});
