/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const page = (name: string) => fileURLToPath(new URL(`./${name}.html`, import.meta.url));
const onWindowsDriveInWsl = process.platform === 'linux' && /^\/mnt\/[a-z]\//.test(process.cwd());

export default defineConfig({
  server: {
    watch: onWindowsDriveInWsl ? { usePolling: true, interval: 300 } : undefined,
  },
  build: {
    rollupOptions: {
      input: {
        main: page('index'),
        generator: page('generator'),
        sandbox: page('sandbox'),
        gallery: page('gallery'),
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
