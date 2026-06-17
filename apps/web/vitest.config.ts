import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // 排除需要原生 SQLite 绑定和完整 DB 环境的测试
    exclude: [
      'src/lib/server/**/__tests__/**/*.test.ts',
      'src/test/**/*.test.ts',
      'src/app/api/**/__tests__/**/*.test.ts',
      'src/**/e2e/**/*.test.ts',
      'src/**/*.e2e*.test.ts',
    ],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
