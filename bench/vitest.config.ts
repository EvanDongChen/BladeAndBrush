import { defineConfig } from 'vitest/config';

/** Local benchmarks only: `npm run bench`. Not part of `npm test` or CI. */
export default defineConfig({
  test: {
    include: ['bench/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 600_000,
    hookTimeout: 600_000,
  },
});
