import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'apps/web'),
    },
  },
  test: {
    globals: true,
    exclude: ['**/node_modules/**', 'e2e/**', '.claude/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      thresholds: {
        statements: 60,
        branches: 50,
      },
    },
  },
})
