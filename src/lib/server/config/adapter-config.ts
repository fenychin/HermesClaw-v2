/**
 * 适配器全局配置
 *
 * 版本号锁定策略：Hermes / OpenClaw 版本升级须经 HEP 审批流程，
 * 禁止在未经审批的情况下修改 version 字段。
 */

export const ADAPTER_CONFIG = {
  hermes: {
    /** 锁定版本，升级须经 HEP 审批 */
    version: '0.3.2',
    /** Hermes API 基础地址 */
    baseUrl: process.env.HERMES_API_URL ?? 'http://localhost:8000',
    /** 请求超时时间（毫秒） */
    timeout: 30000,
    /** 是否启用 Mock 模式（开发环境默认启用） */
    useMock:
      process.env.HERMES_USE_MOCK === 'true' ||
      process.env.NODE_ENV === 'development',
  },
  openclaw: {
    /** 锁定版本，升级须经 HEP 审批 */
    version: '0.2.1',
    /** OpenClaw API 基础地址 */
    baseUrl: process.env.OPENCLAW_API_URL ?? 'http://localhost:8001',
    /** 请求超时时间（毫秒） */
    timeout: 15000,
    /** 是否启用 Mock 模式（开发环境默认启用） */
    useMock:
      process.env.OPENCLAW_USE_MOCK === 'true' ||
      process.env.NODE_ENV === 'development',
  },
} as const

export type AdapterConfig = typeof ADAPTER_CONFIG
