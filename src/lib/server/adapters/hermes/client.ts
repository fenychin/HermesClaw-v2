/**
 * Hermes HTTP 客户端（版本锁定）
 *
 * 负责与 Hermes API 的通信，自动处理：
 * - 版本路由：请求路径中嵌入锁定版本号
 * - Mock 降级：开发环境自动切换至 Mock 模式
 * - 超时控制：使用 AbortSignal.timeout 防止请求挂起
 * - 版本头注入：X-Hermes-Version 用于服务端版本校验
 */

import { ADAPTER_CONFIG } from '../../config/adapter-config'
import { runtimeMode } from '@/config/runtime-mode'
import type {
  HermesRunWorkflowRequest,
  HermesRunWorkflowResponse,
  HermesHarnessEvaluateRequest,
  HermesHarnessProposal,
  HermesMemoryWriteRequest,
  HermesMemoryReadRequest,
  HermesMemoryReadResponse,
  HermesCreateSessionRequest,
  HermesSessionIdentifier,
  HermesReportToolCallsRequest,
  HermesSubmitReportRequest,
  HermesHealthCheckResponse,
  HermesPromptAssemblyRequest,
  HermesAssembledPrompt,
} from './types'
import { hermesMock } from './mock'
import { assembleHermesPrompt } from './prompt-assembler'

/**
 * Hermes 统一 HTTP 客户端
 *
 * 遵循 AGENTS.md §4.3 受控工具接入规范：
 * - 所有请求均带版本头
 * - 错误响应抛出明确异常
 * - Mock 模式完全透明
 */
class HermesClient {
  private readonly config = ADAPTER_CONFIG.hermes

  /**
   * 动态读取 Mock 模式开关（统一从 runtimeMode 获取，全局架构审查 P1-#6）。
   */
  private get useMock(): boolean {
    return runtimeMode.hermes.useMock
  }

  /**
   * 发送请求至 Hermes API
   * @param path - API 端点路径（不含版本前缀）
   * @param body - 请求体
   * @returns 响应数据
   */
  private async request<T>(path: string, body: unknown): Promise<T> {
    // Mock 模式：直接返回模拟数据，不发起网络请求
    if (this.useMock) {
      return hermesMock.handle(path, body) as T
    }

    const url = `${this.config.baseUrl}/v${this.config.version}${path}`

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hermes-Version': this.config.version,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeout),
    })

    if (!res.ok) {
      const errorBody = await res.text().catch(() => '无法读取错误响应体')
      throw new Error(
        `[Hermes API 错误] ${res.status} ${res.statusText} — ${url}\n${errorBody}`
      )
    }

    return res.json() as T
  }

  /**
   * 执行工作流
   * @param req - 工作流执行请求
   */
  async runWorkflow(
    req: HermesRunWorkflowRequest
  ): Promise<HermesRunWorkflowResponse> {
    return this.request('/workflows/run', req)
  }

  /**
   * 触发 Harness 评估（对应 AGENTS.md §3.2 进化触发）
   * @param req - 评估触发请求
   */
  async evaluateHarness(
    req: HermesHarnessEvaluateRequest
  ): Promise<HermesHarnessProposal> {
    return this.request('/harness/evaluate', req)
  }

  /**
   * 写入记忆
   * @param req - 记忆写入请求
   */
  async writeMemory(
    req: HermesMemoryWriteRequest
  ): Promise<{ success: boolean }> {
    return this.request('/memory/write', req)
  }

  /**
   * 读取记忆
   * @param req - 记忆读取请求
   */
  async readMemory(
    req: HermesMemoryReadRequest
  ): Promise<HermesMemoryReadResponse> {
    return this.request('/memory/read', req)
  }

  // ─── P2 新增：Agent 会话管理 ──────────────────────────────

  /**
   * 创建（或恢复）一个 Hermes Agent 会话。
   *
   * Hermes 单 agent loop 模式：一个 agent 对应一个 session，
   * session 内维护工具调用轨迹 + 三级记忆上下文。
   */
  async createSession(
    req: HermesCreateSessionRequest,
  ): Promise<HermesSessionIdentifier> {
    return this.request('/sessions/create', req)
  }

  /**
   * 结束会话并归档工具调用轨迹。
   */
  async closeSession(
    sessionId: string,
  ): Promise<{ archived: boolean }> {
    return this.request('/sessions/close', { sessionId })
  }

  // ─── P2 新增：Prompt 组装（本地执行） ──────────────────────

  /**
   * 组装完整 Prompt。
   *
   * 此方法为本地纯函数，不发起网络请求，但遵循 Hermes 定义的 Prompt
   * 组装规则：系统角色注入 → 上下文策略应用 → 记忆条目注入 → 工具清单注入。
   *
   * 当未来 Hermes 侧 Prompt 组装规则升级时，此方法作为稳定接口契约存在，
   * 调用方无需修改即可使用更新后的规则。
   */
  /**
   * 组装完整 Prompt（委托独立纯函数 assembleHermesPrompt）。
   *
   * 此方法作为 HermesClient 的便捷入口，保持向后兼容。
   * 无需网络状态时可直接使用 `assembleHermesPrompt` 纯函数。
   */
  assemblePrompt(req: HermesPromptAssemblyRequest): HermesAssembledPrompt {
    return assembleHermesPrompt(req)
  }

  // ─── P2 新增：工具调用回传 ─────────────────────────────────

  /**
   * 将本轮工具调用轨迹上报 Hermes（供记忆更新与策略调整）。
   */
  async reportToolCalls(
    req: HermesReportToolCallsRequest,
  ): Promise<{ accepted: boolean }> {
    return this.request('/sessions/tool-calls', req)
  }

  // ─── P2 新增：评估报告提交 ─────────────────────────────────

  /**
   * 提交 Harness 评估报告到 Hermes。
   *
   * Hermes 是 EvaluationReport 的 Source of Truth（CLAUDE.md §4.2）。
   */
  async submitEvaluationReport(
    req: HermesSubmitReportRequest,
  ): Promise<{ reportId: string }> {
    return this.request('/harness/report', req)
  }

  // ─── P2 新增：健康检查 ─────────────────────────────────────

  /**
   * 检查 Hermes 服务可达性。
   *
   * 不经过 Mock 层——健康检查必须验证真实的网络可达性。
   */
  async healthCheck(): Promise<HermesHealthCheckResponse> {
    if (this.useMock) {
      return { ok: true, version: `mock-${this.config.version}`, latencyMs: 0 }
    }

    const url = `${this.config.baseUrl}/v${this.config.version}/health`
    const start = Date.now()

    try {
      const res = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      })
      return {
        ok: res.ok,
        version: this.config.version,
        latencyMs: Date.now() - start,
      }
    } catch {
      return { ok: false, version: this.config.version, latencyMs: Date.now() - start }
    }
  }
}

/** Hermes 客户端单例 */
export const hermesClient = new HermesClient()
