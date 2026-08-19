import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@ikp/config': path.resolve(__dirname, 'packages/config/src/index.ts'),
      '@ikp/shared': path.resolve(__dirname, 'packages/shared/src/index.ts'),
      '@ikp/processing': path.resolve(__dirname, 'packages/processing/src/index.ts'),
      '@ikp/queue': path.resolve(__dirname, 'packages/queue/src/index.ts'),
      '@ikp/storage': path.resolve(__dirname, 'packages/storage/src/index.ts'),
    },
  },
  test: {
    include: ['apps/**/*.test.ts', 'packages/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['./tests/integration/global-setup.ts'],
    teardown: ['./tests/integration/global-teardown.ts'],
    testTimeout: 20_000,
    coverage: {
      provider: 'v8',
      include: ['apps/**/src/**', 'packages/**/src/**'],
      exclude: ['**/dist/**', '**/*.test.ts', '**/src/index.ts'],
    },
  },
});
