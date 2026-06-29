import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'
import { config as loadEnv } from 'dotenv'

// 让 vitest 进程在解析配置阶段就拿到 apps/web/.env.local 与 .env 中的
// DATABASE_URL 等关键变量。当从 turbo / monorepo 根目录 spawn 时，Next.js 的
// .env 链路不在生效范围内，会导致 Prisma 适配器拿到空密码并抛 SASL 错误
// （CLAUDE.md §13.4 洞察 3）。dotenv 默认不覆盖已存在的 env 变量，CI 中
// 注入的 DATABASE_URL_TEST 仍优先。
loadEnv({ path: path.resolve(__dirname, '.env.local') })
loadEnv({ path: path.resolve(__dirname, '.env') })

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}', '../../tests/**/*.{test,spec}.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@foreign-trade': path.resolve(__dirname, '../../industry-packs/foreign-trade/src'),
      'bcryptjs': path.resolve(__dirname, './node_modules/bcryptjs'),
    },
  },
  server: {
    deps: {
      external: ['next-auth', '@auth/prisma-adapter'],
      inline: ['@hermesclaw/event-contracts', '@hermesclaw/hermes-kernel', 'bcryptjs'],
    },
  },
})
