import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    projects: [
      'apps/web/vitest.config.ts',
      'packages/hermes-kernel/vitest.config.ts',
      'packages/event-contracts/vitest.config.ts',
    ],
  },
  resolve: {
    alias: {
      'next-auth': path.resolve(__dirname, 'apps/web/node_modules/next-auth'),
      'next-auth/providers/credentials': path.resolve(
        __dirname,
        'apps/web/node_modules/next-auth/providers/credentials',
      ),
      '@': path.resolve(__dirname, './apps/web/src'),
    },
  },
})
