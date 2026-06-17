import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

/**
 * Root Vitest 配置 — 仅作为后备（Fallback）。
 *
 * 在 Turbo 模式下，每个包通过自己的 vitest.config.ts 独立运行，
 * root 配置不会被使用。此文件的 @ 别名指向 apps/web/src，
 * 仅在开发者从仓库根目录直接运行 `vitest` 且测试文件位于根目录时生效。
 *
 * 推荐：始终通过 `turbo test` 或切到对应包目录运行测试。
 */
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './apps/web/src'),
    },
  },
})
