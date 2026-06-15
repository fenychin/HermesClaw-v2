import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      // 契约层独立 packages 的测试（CLAUDE.md §3.3 渐进式拆分）
      'packages/*/__tests__/**/*.{test,spec}.{ts,tsx}',
    ],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
