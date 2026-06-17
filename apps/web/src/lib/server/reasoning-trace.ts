import crypto from 'crypto'
import type { ReasoningTrace, TraceStep, TraceStepType, TraceStepStatus } from '@hermesclaw/event-contracts'

// 敏感字段黑名单（在 inputs/outputs 中自动脱敏）
const SENSITIVE_KEYS = [
  'password', 'token', 'secret', 'apiKey', 'api_key',
  'bodyHtml', 'bodyText', 'Authorization', 'cookie',
]

function redactSensitive(obj: Record<string, unknown>): Record<string, unknown> {
  if (!obj || typeof obj !== 'object') return obj
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => {
      const isSecret = SENSITIVE_KEYS.some(s => k.toLowerCase().includes(s.toLowerCase()))
      if (isSecret) return [k, '[REDACTED]']
      if (typeof v === 'object' && v !== null) return [k, redactSensitive(v as any)]
      return [k, v]
    })
  )
}

/**
 * 创建一个新的 ReasoningTrace 实例（仅内存，不写库）
 * 调用方在整个请求链路中传递此对象，完成后一次性持久化
 */
export function createTrace(params: {
  conversationId: string
  workspaceId: string
  messageId?: string
  agentId?: string
}): ReasoningTrace {
  return {
    traceId: crypto.randomUUID(),
    conversationId: params.conversationId,
    messageId: params.messageId,
    workspaceId: params.workspaceId,
    agentId: params.agentId,
    steps: [],
    createdAt: new Date().toISOString(),
  }
}

/**
 * 向 trace 追加一个步骤（自动计算耗时）
 */
export function addTraceStep(
  trace: ReasoningTrace,
  step: Omit<TraceStep, 'id' | 'startedAt'>
): TraceStep {
  let safeInputs: Record<string, unknown> | undefined
  try {
    safeInputs = step.inputs ? redactSensitive(step.inputs) : undefined
  } catch {
    safeInputs = { _redact_error: 'inputs serialization failed' }
  }

  const s: TraceStep = {
    id: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    ...step,
    inputs: safeInputs,
    outputs: step.outputs ? redactSensitive(step.outputs) : undefined,
  }
  trace.steps.push(s)
  return s
}

/**
 * 完成一个步骤（更新状态和耗时）
 */
export function completeTraceStep(
  step: TraceStep,
  update: Partial<Pick<TraceStep, 'status' | 'outputs' | 'reasoning' | 'dataSources' | 'blockedReason' | 'fallbackReason' | 'modelUsed'>>
): void {
  const now = new Date()
  step.completedAt = now.toISOString()
  step.durationMs = now.getTime() - new Date(step.startedAt).getTime()
  if (update.status) step.status = update.status

  if (update.outputs) {
    try {
      step.outputs = redactSensitive(update.outputs)
    } catch {
      step.outputs = { _redact_error: 'outputs serialization failed' }
    }
  }

  if (update.reasoning) step.reasoning = update.reasoning
  if (update.dataSources) step.dataSources = update.dataSources
  if (update.blockedReason) step.blockedReason = update.blockedReason
  if (update.fallbackReason) step.fallbackReason = update.fallbackReason
  if (update.modelUsed) step.modelUsed = update.modelUsed
}

/**
 * 完成整个 trace（计算总耗时）
 */
export function finalizeTrace(trace: ReasoningTrace): ReasoningTrace {
  const start = new Date(trace.createdAt).getTime()
  trace.totalDurationMs = Date.now() - start
  return trace
}

/**
 * withTraceStep — 推理步骤安全包裹函数（标准埋点 API）
 *
 * 解决三个问题：
 * 1. Fail-safe：trace 代码内部异常绝不向外抛出，不阻断主链路（三域隔离）
 * 2. 状态闭环：无论业务成功/失败/抛错，step 状态必须最终结束（不卡 running）
 * 3. 去重复：消除各调用方的 if(trace)/try/finally 样板代码
 *
 * 用法：
 *   const result = await withTraceStep(
 *     trace,
 *     { type: 'model.route', label: '选择推理模型', inputs: { taskType } },
 *     async (step) => {
 *       const routing = await selectModel(params)
 *       // 在回调内通过 step 追加输出（可选）
 *       step._pendingUpdate = {
 *         outputs: { model: routing.model },
 *         reasoning: routing.reason,
 *       }
 *       return routing
 *     }
 *   )
 *
 * @param trace  ReasoningTrace 对象，为 null/undefined 时直接执行 fn 不产生 trace
 * @param config 步骤配置（type/label/inputs 等，不含 id/startedAt）
 * @param fn     业务逻辑回调，接收 step 引用用于中途追加输出
 * @returns      fn 的返回值（trace 代码异常不影响返回值）
 */
export async function withTraceStep<T>(
  trace: ReasoningTrace | null | undefined,
  config: Omit<TraceStep, 'id' | 'startedAt' | 'status'> & {
    inputs?: Record<string, unknown>
  },
  fn: (step: TraceStep & { _pendingUpdate?: Partial<Parameters<typeof completeTraceStep>[1]> }) => Promise<T>
): Promise<T> {
  // 没有 trace 时，直接执行业务逻辑，零开销
  if (!trace) return fn({ id: '', startedAt: '', type: config.type, status: 'running', label: config.label } as any)

  let step: TraceStep & { _pendingUpdate?: Partial<Parameters<typeof completeTraceStep>[1]> }

  // ── 创建步骤（fail-safe：创建失败不阻断业务）────────────────
  try {
    step = addTraceStep(trace, {
      ...config,
      status: 'running',
    }) as any
  } catch (traceErr) {
    // trace 创建失败，静默降级，直接执行业务
    console.warn('[ReasoningTrace] addTraceStep failed (ignored):', traceErr)
    return fn({ id: '', startedAt: '', type: config.type, status: 'running', label: config.label } as any)
  }

  // ── 执行业务逻辑（核心：try/finally 保证状态闭环）───────────
  let businessError: unknown = undefined
  let result: T

  try {
    result = await fn(step)
  } catch (err) {
    businessError = err
    // 业务异常时，先完成步骤状态，再重新抛出（不吞业务错误）
    try {
      completeTraceStep(step, {
        status: 'error',
        ...(step._pendingUpdate ?? {}),
        outputs: {
          ...(step._pendingUpdate?.outputs ?? {}),
          errorMessage: err instanceof Error ? err.message : String(err),
        },
      })
    } catch (traceErr) {
      console.warn('[ReasoningTrace] completeTraceStep (error branch) failed (ignored):', traceErr)
    }
    throw err  // 重新抛出业务异常，不吞掉
  }

  // ── 业务成功：完成步骤（fail-safe：完成失败不影响返回值）────
  try {
    const pendingUpdate = step._pendingUpdate ?? {}
    completeTraceStep(step, {
      status: pendingUpdate.status ?? 'passed',
      ...pendingUpdate,
    })
  } catch (traceErr) {
    console.warn('[ReasoningTrace] completeTraceStep (success branch) failed (ignored):', traceErr)
  }

  return result!
}

/**
 * 获取单条推理轨迹
 */
export async function getReasoningTrace(traceId: string, workspaceId: string): Promise<ReasoningTrace | null> {
  const { prisma } = await import('@/lib/prisma')
  const record = await prisma.reasoningTrace.findUnique({
    where: { traceId }
  })
  
  if (!record || record.workspaceId !== workspaceId) {
    return null
  }

  return {
    traceId: record.traceId,
    conversationId: record.conversationId,
    messageId: record.messageId ?? undefined,
    workspaceId: record.workspaceId,
    agentId: record.agentId ?? undefined,
    steps: typeof record.steps === 'string' ? JSON.parse(record.steps) : record.steps,
    totalDurationMs: record.totalDurationMs ?? undefined,
    createdAt: record.createdAt.toISOString(),
  } as ReasoningTrace
}

/**
 * 获取推理轨迹列表
 */
export async function listReasoningTraces(
  workspaceId: string, 
  options: { workflowRunId: string, page: number, pageSize: number }
): Promise<{ traces: ReasoningTrace[], total: number, page: number, pageSize: number }> {
  const { prisma } = await import('@/lib/prisma')
  const { workflowRunId, page, pageSize } = options
  const skip = (page - 1) * pageSize

  // 注意：Schema 中对应的是 conversationId，对于 workflow run 其上下文通常存放在这里
  const where = {
    workspaceId,
    conversationId: workflowRunId,
  }

  const [records, total] = await Promise.all([
    prisma.reasoningTrace.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.reasoningTrace.count({ where }),
  ])

  const traces = records.map(record => ({
    traceId: record.traceId,
    conversationId: record.conversationId,
    messageId: record.messageId ?? undefined,
    workspaceId: record.workspaceId,
    agentId: record.agentId ?? undefined,
    steps: typeof record.steps === 'string' ? JSON.parse(record.steps) : record.steps,
    totalDurationMs: record.totalDurationMs ?? undefined,
    createdAt: record.createdAt.toISOString(),
  })) as ReasoningTrace[]

  return { traces, total, page, pageSize }
}
