/**
 * 统一 RuntimeMode 配置 — 收敛 4 套 env 判定。
 *
 * 落地全局架构审查 P1-#6。
 *
 * 使用方式：
 *   import { runtimeMode } from "@/config/runtime-mode"
 *
 * 规则优先级（三态）：
 *   env 显式 true  >  env 显式 false  >  NODE_ENV === 'development' 兜底
 *
 * 禁止：任何模块直接读 HERMES_USE_MOCK / OPENCLAW_USE_MOCK / WORKFLOW_ROUTING_MODE；
 *       统一通过本模块获取。
 */

// ─── 基础环境 ─────────────────────────────────────────────────────

const isDev = process.env.NODE_ENV === "development"
const isProd = process.env.NODE_ENV === "production"
const isTest = process.env.NODE_ENV === "test"

// ─── Adapter Mock 三态判定 ────────────────────────────────────────

function resolveMock(envKey: string): boolean {
  switch (process.env[envKey]) {
    case "true":
      return true
    case "false":
      return false
    default:
      return isDev // 开发环境默认启用 mock，其它环境默认关闭
  }
}

// ─── Workflow 引擎路由 ────────────────────────────────────────────

type WorkflowEngine = "local" | "hermes"

function resolveWorkflowEngine(): WorkflowEngine {
  const mode = process.env.WORKFLOW_ROUTING_MODE
  if (mode === "hermes") return "hermes"
  if (mode === "local") return "local"
  return isDev ? "local" : "hermes" // 开发默认 local，生产默认 hermes
}

// ─── 汇总模式（可用于日志/调试） ─────────────────────────────────

export type RuntimeModeLabel =
  | "all-mock"
  | "all-real"
  | "hermes-real-openclaw-mock"
  | "hermes-mock-openclaw-real"

function resolveModeLabel(): RuntimeModeLabel {
  const h = resolveMock("HERMES_USE_MOCK")
  const o = resolveMock("OPENCLAW_USE_MOCK")
  if (h && o) return "all-mock"
  if (!h && !o) return "all-real"
  if (!h && o) return "hermes-real-openclaw-mock"
  return "hermes-mock-openclaw-real"
}

// ─── 唯一出口 ─────────────────────────────────────────────────────

export const runtimeMode = {
  /** 基础环境判断 */
  isDev,
  isProd,
  isTest,

  /** Hermes adapter 运行模式 */
  hermes: {
    useMock: resolveMock("HERMES_USE_MOCK"),
  },

  /** OpenClaw adapter 运行模式 */
  openclaw: {
    useMock: resolveMock("OPENCLAW_USE_MOCK"),
  },

  /** 工作流引擎路由 */
  workflow: {
    engine: resolveWorkflowEngine(),
  },

  /** 汇总模式标签（用于启动日志/健康检查） */
  label: resolveModeLabel(),
} as const
