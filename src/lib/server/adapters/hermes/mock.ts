/**
 * Hermes Mock 模式实现
 *
 * 开发阶段使用，模拟 Hermes API 的响应行为。
 * 当 ADAPTER_CONFIG.hermes.useMock 为 true 时自动启用。
 */

import type {
  HermesRunWorkflowResponse,
  HermesHarnessProposal,
  HermesMemoryReadResponse,
} from './types'

/** Mock 内存存储（模拟记忆层） */
const mockMemoryStore = new Map<string, { value: unknown; writtenAt: string }>()

/** Mock 路由处理器映射 */
const mockHandlers: Record<string, (body: unknown) => unknown> = {
  '/workflows/run': (): HermesRunWorkflowResponse => ({
    executionId: 'mock-exec-001',
    status: 'completed',
    outputs: {
      summary: '模拟工作流执行完成',
      generatedContent: '这是 Mock 模式生成的示例内容',
      confidence: 0.92,
      timestamp: new Date().toISOString(),
    },
    durationMs: 1234,
  }),

  '/harness/evaluate': (): HermesHarnessProposal => ({
    proposalId: `HEP-${Date.now()}`,
    triggeredBy: '自动评估',
    problemStatement: '模拟检测到工具调用成功率低于阈值（82%），需要评估当前 Harness 配置',
    proposedChange: '建议调整超时阈值并增加重试机制，优化工具接入层的容错能力',
    riskLevel: 'mid',
    requiresHumanApproval: true,
    estimatedImpact: '预计将工具调用成功率提升至 95% 以上，降低任务中断频率',
    createdAt: new Date().toISOString(),
  }),

  '/memory/write': (body): { success: boolean } => {
    const req = body as { key?: string; value?: unknown }
    if (req.key) {
      mockMemoryStore.set(req.key, {
        value: req.value,
        writtenAt: new Date().toISOString(),
      })
    }
    return { success: true }
  },

  '/memory/read': (body): HermesMemoryReadResponse => {
    const req = body as { key?: string; level?: string }
    const stored = req.key ? mockMemoryStore.get(req.key) : undefined
    return {
      key: req.key ?? '',
      value: stored?.value ?? null,
      level: (req.level as 'short' | 'mid' | 'long') ?? 'short',
      writtenAt: stored?.writtenAt,
    }
  },
}

/**
 * Hermes Mock 客户端
 *
 * 通过路由匹配返回对应的 Mock 数据，
 * 未注册路由会抛出错误以便及时发现遗漏。
 */
export const hermesMock = {
  /**
   * 处理 Mock 请求
   * @param path - API 路径（如 '/workflows/run'）
   * @param body - 请求体
   * @returns 模拟响应数据
   */
  handle(path: string, body: unknown): unknown {
    const handler = mockHandlers[path]
    if (!handler) {
      throw new Error(
        `[Hermes Mock] 未注册的 Mock 路由: ${path}，请在 mock.ts 中添加对应处理器`
      )
    }
    console.info(`[Hermes Mock] ${path} →`, JSON.stringify(body).slice(0, 200))
    return handler(body)
  },
}
