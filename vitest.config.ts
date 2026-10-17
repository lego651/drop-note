import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@', replacement: resolve(__dirname, 'apps/web') },
      { find: /^@drop-note\/shared\/(.*)$/, replacement: resolve(__dirname, 'packages/shared/src/$1') },
    ],
  },
  test: {
    globals: true,
    environment: 'node',
    environmentMatchGlobs: [['**/*.test.tsx', 'jsdom']],
    setupFiles: ['./vitest.setup.ts'],
    exclude: ['**/node_modules/**', 'e2e/**', '.claude/**', '.worktrees/**', '.paperclip/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      exclude: ['.worktrees/**', '.paperclip/**'],
      thresholds: {
        statements: 60,
        branches: 50,
      },
    },
  },
})
