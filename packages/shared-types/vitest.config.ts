import { defineConfig } from 'vitest/config'

/**
 * @hermesclaw/shared-types 当前为纯类型定义包，无运行时测试。
 *
 * 之所以仍声明一个独立的 vitest config：
 *   - `package.json` 的 `test` 脚本是 `vitest run`，没有本地配置时 vitest 会
 *     向上搜索根 `vitest.config.ts`，把其中相对路径的 `projects: ['apps/web/...']`
 *     按当前 cwd 解析，落到 `packages/shared-types/apps/web/...` 不存在的路径并崩溃。
 *   - 与 event-contracts / hermes-kernel / industry-pack-sdk / openclaw-adapter
 *     的 vitest 配置保持同构。
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
  },
})
