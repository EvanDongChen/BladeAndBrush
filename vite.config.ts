/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const page = (name: string) => fileURLToPath(new URL(`./${name}.html`, import.meta.url));

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: page('index'),
        generator: page('generator'),
        sandbox: page('sandbox'),
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // The discovery test drops temporary files into src/; running files one at a time keeps
    // other test files from transforming the auto-discovery globs while those files exist.
    fileParallelism: false,
  },
});
