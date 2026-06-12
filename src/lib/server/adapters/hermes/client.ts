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
import type {
  HermesRunWorkflowRequest,
  HermesRunWorkflowResponse,
  HermesHarnessEvaluateRequest,
  HermesHarnessProposal,
  HermesMemoryWriteRequest,
  HermesMemoryReadRequest,
  HermesMemoryReadResponse,
} from './types'
import { hermesMock } from './mock'

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
   * 发送请求至 Hermes API
   * @param path - API 端点路径（不含版本前缀）
   * @param body - 请求体
   * @returns 响应数据
   */
  private async request<T>(path: string, body: unknown): Promise<T> {
    // Mock 模式：直接返回模拟数据，不发起网络请求
    if (this.config.useMock) {
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
}

/** Hermes 客户端单例 */
export const hermesClient = new HermesClient()
