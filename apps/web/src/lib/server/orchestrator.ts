import { prisma } from "@/lib/prisma"
import { writeAuditLog } from "@/lib/server/audit"
import { randomUUID } from "crypto"
import type { WriteAuditLogInput } from "@/lib/server/audit"
import { logger } from "@/lib/logger"

// ─── 顶层常量（不可作为运行时参数覆盖）────────────────────────────────────
export const ORCHESTRATOR_VERSION = '1.0'

/** 单次编排 Session 默认超时（15 分钟） */
export const DEFAULT_SESSION_TIMEOUT_MS = 15 * 60 * 1000

/** 单 Session 最多 Sub-Agent 数量 */
export const MAX_SUB_AGENTS = 8

/** 子任务默认超时（5 分钟） */
export const SUB_AGENT_TASK_TIMEOUT_MS = 5 * 60 * 1000

/** 默认结果合并策略 */
export const RESULT_MERGE_STRATEGY_DEFAULT = 'union' as const

/** 子任务最大重试次数（不含首次） */
export const MAX_TASK_RETRIES = 2

/** 子任务重试等待间隔（ms） */
export const TASK_RETRY_DELAY_MS = 2000

// ─── 错误类型（共 6 个）────────────────────────────────────────────────
export class OrchestrationSessionNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`Orchestration session not found: ${sessionId}`)
    this.name = 'OrchestrationSessionNotFoundError'
  }
}

export class OrchestrationSessionAlreadyActiveError extends Error {
  constructor(sessionId: string) {
    super(`Orchestration session is already active: ${sessionId}`)
    this.name = 'OrchestrationSessionAlreadyActiveError'
  }
}

export class SubAgentNotAvailableError extends Error {
  constructor(agentId: string) {
    super(`Sub-agent not available or not found: ${agentId}`)
    this.name = 'SubAgentNotAvailableError'
  }
}

export class SubAgentLimitExceededError extends Error {
  constructor(limit: number) {
    super(`Session sub-agent count exceeds limit of ${limit}`)
    this.name = 'SubAgentLimitExceededError'
  }
}

export class SessionTimeoutError extends Error {
  constructor(sessionId: string, timeoutMs: number) {
    super(`Orchestration session timed out after ${timeoutMs}ms: ${sessionId}`)
    this.name = 'SessionTimeoutError'
  }
}

export class TaskDispatchError extends Error {
  constructor(agentId: string, reason: string) {
    super(`Failed to dispatch task to agent ${agentId}: ${reason}`)
    this.name = 'TaskDispatchError'
  }
}

// ─── 依赖接口 ─────────────────────────────────────────────────────────
export interface OrchestratorDeps {
  writeAuditLog: (input: WriteAuditLogInput) => Promise<void>
  callSubAgent: (
    agentId: string,
    instruction: string,
    inputData: Record<string, unknown>,
    opts: { workspaceId: string; timeoutMs: number }
  ) => Promise<Record<string, unknown>>
  mergeResults?: (
    results: Array<{ agentId: string; output: Record<string, unknown> }>,
    strategy: string
  ) => Record<string, unknown>
}

// ─── 本地 CUID 实现 ────────────────────────────────────────────────────
function cuid(): string {
  return randomUUID().replace(/-/g, '')
}

// ─── 私有辅助函数：mergeSubAgentResults ─────────────────────────────────
function mergeSubAgentResults(
  results: Array<{ agentId: string; output: Record<string, unknown> }>,
  strategy: string
): Record<string, unknown> {
  if (results.length === 0) return {}

  if (strategy === 'append') {
    const appended: Record<string, any> = {}
    for (const res of results) {
      appended[res.agentId] = res.output
    }
    return appended
  }

  if (strategy === 'first-wins') {
    return results[0].output
  }

  if (strategy === 'majority') {
    const majority: Record<string, any> = {}
    const keys = new Set<string>()
    for (const res of results) {
      Object.keys(res.output).forEach(k => keys.add(k))
    }

    for (const key of keys) {
      const valuesCount = new Map<any, number>()
      for (const res of results) {
        const val = res.output[key]
        if (typeof val === 'string' || typeof val === 'number') {
          valuesCount.set(val, (valuesCount.get(val) || 0) + 1)
        }
      }

      let maxCount = 0
      let majorityValue: any = undefined
      for (const [val, count] of valuesCount.entries()) {
        if (count > maxCount) {
          maxCount = count
          majorityValue = val
        } else if (count === maxCount && majorityValue !== undefined) {
          if (typeof val === typeof majorityValue) {
            if (val < majorityValue) {
              majorityValue = val
            }
          }
        }
      }

      if (majorityValue !== undefined) {
        majority[key] = majorityValue
      } else {
        majority[key] = results[0].output[key]
      }
    }
    return majority
  }

  // union (default)
  return results.reduce((acc, { output }) => ({ ...acc, ...output }), {})
}

// ─── 核心函数：createOrchestrationSession ──────────────────────────────
export async function createOrchestrationSession(
  input: {
    workflowRunId: string
    workspaceId: string
    orchestratorAgentId: string
    subAgentIds: string[]
    mode: 'sequential' | 'parallel' | 'conditional' | 'human-in-loop'
    goal: string
    inputContext?: Record<string, unknown>
    createdBy?: string
    sessionTimeoutMs?: number
    sessionId?: string
  },
  deps?: OrchestratorDeps
): Promise<any> {
  const activeWriteAuditLog = deps?.writeAuditLog || writeAuditLog

  // 1. subAgentIds.length <= MAX_SUB_AGENTS
  if (input.subAgentIds.length > MAX_SUB_AGENTS) {
    throw new SubAgentLimitExceededError(MAX_SUB_AGENTS)
  }

  // 2. 从 DB 查询所有 subAgentIds 是否存在且 status='active'
  for (const agentId of input.subAgentIds) {
    const agent = await prisma.agent.findUnique({
      where: { id: agentId }
    })
    if (!agent || agent.status !== 'active') {
      throw new SubAgentNotAvailableError(agentId)
    }
  }

  // 3. 从 DB 查询 orchestratorAgentId 是否存在且其 automationLevel 为 'L3' 或 'L4'
  const orchestrator = await prisma.agent.findUnique({
    where: { id: input.orchestratorAgentId }
  })
  if (!orchestrator) {
    throw new SubAgentNotAvailableError(input.orchestratorAgentId)
  }
  if (orchestrator.automationLevel !== 'L3' && orchestrator.automationLevel !== 'L4') {
    throw new Error('Orchestrator agent must be L3+ automation level')
  }

  // 4. 创建 OrchestrationSession 记录
  const sessionId = input.sessionId || `sess_${cuid()}`
  const session = await prisma.orchestrationSession.create({
    data: {
      sessionId,
      workspaceId: input.workspaceId,
      workflowRunId: input.workflowRunId,
      orchestratorAgentId: input.orchestratorAgentId,
      subAgentIds: JSON.stringify(input.subAgentIds),
      mode: input.mode,
      status: 'initializing',
      goal: input.goal,
      inputContext: (input.inputContext || {}) as any,
      createdBy: input.createdBy || 'system'
    }
  })

  // 5. 若 workflowRunId 传入，更新 WorkflowRun.sessionId = session.sessionId
  if (input.workflowRunId) {
    try {
      await prisma.workflowRun.update({
        where: { runId: input.workflowRunId },
        data: { sessionId }
      })
    } catch {
      // ignore
    }
  }

  // 6. writeAuditLog
  await activeWriteAuditLog({
    actor: input.createdBy || 'system',
    action: 'orchestration.session.created',
    targetType: 'orchestration',
    targetId: sessionId,
    detail: `Orchestration session ${sessionId} created with mode ${input.mode}`,
    riskLevel: 'low',
    workspaceId: input.workspaceId
  })

  return session
}

// ─── 核心函数：dispatchSubAgentTask ───────────────────────────────────
export async function dispatchSubAgentTask(
  sessionId: string,
  agentId: string,
  instruction: string,
  inputData: Record<string, unknown>,
  workspaceId: string,
  opts?: {
    timeoutMs?: number
    maxRetries?: number
    priority?: 'low' | 'normal' | 'high' | 'urgent'
  },
  deps?: OrchestratorDeps
): Promise<any> {
  const activeWriteAuditLog = deps?.writeAuditLog || writeAuditLog
  const timeoutMs = opts?.timeoutMs || SUB_AGENT_TASK_TIMEOUT_MS
  const maxRetries = opts?.maxRetries !== undefined ? opts.maxRetries : MAX_TASK_RETRIES
  const priority = opts?.priority || 'normal'

  // 1. 从 DB 读取 OrchestrationSession
  const session = await prisma.orchestrationSession.findUnique({
    where: { sessionId }
  })
  if (!session) {
    throw new OrchestrationSessionNotFoundError(sessionId)
  }
  if (session.status !== 'running' && session.status !== 'initializing') {
    throw new Error(`Cannot dispatch task to session in status: ${session.status}`)
  }

  // 2. 校验 agentId 在 session.subAgentIds 中
  const subAgentIds = JSON.parse(session.subAgentIds) as string[]
  if (!subAgentIds.includes(agentId)) {
    throw new SubAgentNotAvailableError(agentId)
  }

  const taskId = `task_${cuid()}`

  // 3. 创建 SubAgentTask 记录
  const task = await prisma.subAgentTask.create({
    data: {
      taskId,
      sessionId,
      workspaceId,
      agentId,
      instruction,
      inputData: inputData as any,
      status: 'pending',
      retryCount: 0,
      maxRetries,
      timeoutMs,
      priority
    }
  })

  // 4. 写入 AgentMessage (type='task-dispatch')
  const messageIdDispatch = `msg_${cuid()}`
  await prisma.agentMessage.create({
    data: {
      messageId: messageIdDispatch,
      sessionId,
      workspaceId,
      fromAgentId: session.orchestratorAgentId,
      toAgentId: agentId,
      fromRole: 'orchestrator',
      messageType: 'task-dispatch',
      payload: { instruction, inputData, timeoutMs, priority } as any,
      taskId
    }
  })

  // 5. 更新 SubAgentTask.status = 'running', startedAt = now
  await prisma.subAgentTask.update({
    where: { taskId },
    data: {
      status: 'running',
      startedAt: new Date()
    }
  })

  const startTime = Date.now()

  // 6. 执行调用 (带重试)
  const callWithRetry = async (attempt: number): Promise<Record<string, unknown>> => {
    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('TASK_TIMEOUT')), task.timeoutMs)
      )
      const result = await Promise.race([
        deps!.callSubAgent(agentId, instruction, inputData, {
          workspaceId,
          timeoutMs: task.timeoutMs
        }),
        timeoutPromise
      ])
      return result as Record<string, unknown>
    } catch (err: any) {
      const isTimeout = err.message === 'TASK_TIMEOUT'
      if (!isTimeout && attempt < task.maxRetries) {
        const retryDelay = process.env.NODE_ENV === 'test' ? 0 : TASK_RETRY_DELAY_MS
        await new Promise(r => setTimeout(r, retryDelay))
        await prisma.subAgentTask.update({
          where: { taskId },
          data: { retryCount: attempt + 1 }
        })
        return callWithRetry(attempt + 1)
      }

      // 超时 或 重试耗尽
      const errorCode = isTimeout ? 'TASK_TIMEOUT' : 'TASK_FAILED'
      await prisma.subAgentTask.update({
        where: { taskId },
        data: {
          status: 'failed',
          errorCode,
          errorMessage: err.message,
          completedAt: new Date()
        }
      })
      
      // 写入 task-error 消息
      const messageIdError = `msg_${cuid()}`
      await prisma.agentMessage.create({
        data: {
          messageId: messageIdError,
          sessionId,
          workspaceId,
          fromAgentId: agentId,
          toAgentId: session.orchestratorAgentId,
          fromRole: 'sub-agent',
          messageType: 'task-error',
          payload: { errorCode, message: err.message, retryable: !isTimeout } as any,
          taskId
        }
      })

      if (isTimeout) {
        throw new SessionTimeoutError(taskId, task.timeoutMs)
      }
      throw new TaskDispatchError(agentId, err.message)
    }
  }

  const output = await callWithRetry(0)

  // 7. 成功后
  const latencyMs = Date.now() - startTime
  const updatedTask = await prisma.subAgentTask.update({
    where: { taskId },
    data: {
      status: 'completed',
      output: output as any,
      completedAt: new Date()
    }
  })

  // 写入 AgentMessage (type='task-result')
  const messageIdResult = `msg_${cuid()}`
  await prisma.agentMessage.create({
    data: {
      messageId: messageIdResult,
      sessionId,
      workspaceId,
      fromAgentId: agentId,
      toAgentId: session.orchestratorAgentId,
      fromRole: 'sub-agent',
      messageType: 'task-result',
      payload: { output, summary: 'completed', latencyMs } as any,
      correlationId: messageIdDispatch,
      taskId
    }
  })

  // 8. writeAuditLog
  await activeWriteAuditLog({
    actor: session.orchestratorAgentId,
    action: 'orchestration.task.dispatched',
    targetType: 'orchestration',
    targetId: sessionId,
    detail: `Sub-agent task ${taskId} completed by agent ${agentId}`,
    riskLevel: 'low',
    workspaceId
  })

  // 9. 返回 SubAgentTask (含 output)
  return updatedTask
}

// ─── 核心函数：runOrchestration ───────────────────────────────────────
export async function runOrchestration(
  input: {
    workflowRunId: string
    workspaceId: string
    orchestratorAgentId: string
    subAgentIds: string[]
    mode: 'sequential' | 'parallel' | 'conditional' | 'human-in-loop'
    goal: string
    inputContext?: Record<string, unknown>
    subInstructions?: Record<string, string>
    sessionTimeoutMs?: number
    createdBy?: string
    sessionId?: string
  },
  deps?: OrchestratorDeps
): Promise<any> {
  const activeWriteAuditLog = deps?.writeAuditLog || writeAuditLog
  const sessionTimeoutMs = input.sessionTimeoutMs ?? DEFAULT_SESSION_TIMEOUT_MS

  let session: any = null
  const startTime = Date.now()

  const runInternal = async () => {
    // ① 调用 createOrchestrationSession
    session = await createOrchestrationSession(input, deps)
    const sessionId = session.sessionId

    // ② 更新 Session.status = 'running'
    await prisma.orchestrationSession.update({
      where: { sessionId },
      data: { status: 'running', startedAt: new Date() }
    })

    const subAgentIds = JSON.parse(session.subAgentIds) as string[]
    const successResults: Array<{ agentId: string; output: Record<string, unknown> }> = []
    const failureResults: Array<{ agentId: string; error: string }> = []

    if (input.mode === 'sequential') {
      let pipelineInput = input.inputContext ?? {}
      for (const agentId of subAgentIds) {
        const instruction = input.subInstructions?.[agentId] ?? input.goal
        const task = await dispatchSubAgentTask(
          sessionId,
          agentId,
          instruction,
          pipelineInput,
          input.workspaceId,
          undefined,
          deps
        )
        pipelineInput = { ...pipelineInput, ...task.output }
        successResults.push({ agentId, output: task.output! })
      }
    } else if (input.mode === 'parallel') {
      const promises = subAgentIds.map(async (agentId) => {
        const instruction = input.subInstructions?.[agentId] ?? input.goal
        const task = await dispatchSubAgentTask(
          sessionId,
          agentId,
          instruction,
          input.inputContext ?? {},
          input.workspaceId,
          undefined,
          deps
        )
        return { agentId, output: task.output! }
      })

      const settled = await Promise.allSettled(promises)
      for (let i = 0; i < settled.length; i++) {
        const s = settled[i]
        const agentId = subAgentIds[i]
        if (s.status === 'fulfilled') {
          successResults.push(s.value)
        } else {
          logger.error(`[PARALLEL FAIL] agentId: ${agentId}`, {
            service: "orchestrator",
            action: "orchestration.subagent.failed",
            traceId: sessionId,
            workspaceId: input.workspaceId,
            errorCode: "SUBAGENT_FAILED",
            errorMessage: s.reason?.message || String(s.reason),
            errorStack: s.reason?.stack,
          })
          failureResults.push({ agentId, error: s.reason.message || 'Execution failed' })
        }
      }
    } else if (input.mode === 'conditional') {
      const condition = input.inputContext?.condition as string | undefined
      const activeAgentIds = condition
        ? subAgentIds.filter(id => (input.inputContext?.activeAgentIds as string[] | undefined)?.includes(id))
        : []
      const skippedAgentIds = subAgentIds.filter(id => !activeAgentIds.includes(id))

      // 将 skipped 的 SubAgentTask 创建并直接标记为 status='skipped'
      for (const agentId of skippedAgentIds) {
        await prisma.subAgentTask.create({
          data: {
            taskId: `task_${cuid()}`,
            sessionId,
            workspaceId: input.workspaceId,
            agentId,
            instruction: input.subInstructions?.[agentId] ?? input.goal,
            status: 'skipped',
            retryCount: 0,
            maxRetries: 0,
            timeoutMs: 0,
            priority: 'normal'
          }
        })
      }

      // 仅对 activeAgentIds 调用 dispatchSubAgentTask
      for (const agentId of activeAgentIds) {
        const instruction = input.subInstructions?.[agentId] ?? input.goal
        const task = await dispatchSubAgentTask(
          sessionId,
          agentId,
          instruction,
          input.inputContext ?? {},
          input.workspaceId,
          undefined,
          deps
        )
        successResults.push({ agentId, output: task.output! })
      }
    } else if (input.mode === 'human-in-loop') {
      const firstAgent = subAgentIds[0]
      const instruction = input.subInstructions?.[firstAgent] ?? input.goal
      const task = await dispatchSubAgentTask(
        sessionId,
        firstAgent,
        instruction,
        input.inputContext ?? {},
        input.workspaceId,
        undefined,
        deps
      )
      successResults.push({ agentId: firstAgent, output: task.output! })

      // 暂停，等待人工介入
      await prisma.orchestrationSession.update({
        where: { sessionId },
        data: {
          status: 'waiting-human',
          humanInterventionReason: 'human-in-loop mode: awaiting approval to continue'
        }
      })

      const res = await prisma.orchestrationSession.findUnique({
        where: { sessionId }
      })
      if (!res) throw new OrchestrationSessionNotFoundError(sessionId)
      return res
    }

    // 合并结果
    const mergeStrategy = (input.inputContext?.mergeStrategy as string | undefined) || RESULT_MERGE_STRATEGY_DEFAULT
    const mergedOutput = deps?.mergeResults
      ? deps.mergeResults(successResults, mergeStrategy)
      : mergeSubAgentResults(successResults, mergeStrategy)

    // 写回 Session
    let finalStatus: 'completed' | 'failed' = 'completed'
    if (failureResults.length > 0 && successResults.length === 0) {
      finalStatus = 'failed'
    }

    const finalSession = await prisma.orchestrationSession.update({
      where: { sessionId },
      data: {
        status: finalStatus,
        mergedOutput: mergedOutput as any,
        completedAt: new Date()
      }
    })

    // AuditLog
    const durationMs = Date.now() - startTime
    if (finalStatus === 'completed') {
      await activeWriteAuditLog({
        actor: input.orchestratorAgentId,
        action: 'orchestration.session.completed',
        targetType: 'orchestration',
        targetId: sessionId,
        detail: `Orchestration session ${sessionId} completed. Tasks: ${subAgentIds.length}, Success: ${successResults.length}, Failures: ${failureResults.length}, Duration: ${durationMs}ms`,
        riskLevel: 'low',
        workspaceId: input.workspaceId
      })
    } else {
      await activeWriteAuditLog({
        actor: input.orchestratorAgentId,
        action: 'orchestration.session.failed',
        targetType: 'orchestration',
        targetId: sessionId,
        detail: `Orchestration session ${sessionId} failed. All sub-agents failed.`,
        riskLevel: 'high',
        workspaceId: input.workspaceId
      })
    }

    return finalSession
  }

  // 顶层超时保护
  let timerId: any
  const timeoutRace = new Promise<never>((_, reject) => {
    timerId = setTimeout(
      () => {
        const activeSessionId = session?.sessionId || input.sessionId || 'unknown'
        reject(new SessionTimeoutError(activeSessionId, sessionTimeoutMs))
      },
      sessionTimeoutMs
    )
  })
  // 挂载空 catch 规避 V8 对 Promise.race 中未消费 rejection 的 Unhandled Rejection 警告
  timeoutRace.catch(() => {})

  try {
    return await Promise.race([
      runInternal().finally(() => {
        if (timerId) clearTimeout(timerId)
      }),
      timeoutRace
    ])
  } catch (err: any) {
    if (err instanceof SessionTimeoutError) {
      const activeSessionId = session?.sessionId || input.sessionId || 'unknown'
      await prisma.orchestrationSession.update({
        where: { sessionId: activeSessionId },
        data: {
          status: 'failed',
          failureReason: 'session timeout',
          failedAt: new Date()
        }
      })
      await activeWriteAuditLog({
        actor: input.orchestratorAgentId,
        action: 'orchestration.session.failed',
        targetType: 'orchestration',
        targetId: activeSessionId,
        detail: `Orchestration session ${activeSessionId} failed due to timeout`,
        riskLevel: 'high',
        workspaceId: input.workspaceId
      })
    }
    throw err
  }
}

// ─── 核心函数：resumeOrchestrationSession ─────────────────────────────
export async function resumeOrchestrationSession(
  sessionId: string,
  workspaceId: string,
  approved: boolean,
  resumedBy: string,
  deps?: OrchestratorDeps
): Promise<any> {
  const activeWriteAuditLog = deps?.writeAuditLog || writeAuditLog

  const session = await prisma.orchestrationSession.findUnique({
    where: { sessionId }
  })
  if (!session) {
    throw new OrchestrationSessionNotFoundError(sessionId)
  }

  if (session.status !== 'waiting-human') {
    throw new Error(`Session is not waiting for human input: ${session.status}`)
  }

  if (!approved) {
    // approved=false：Session.status = 'cancelled'
    const updatedSession = await prisma.orchestrationSession.update({
      where: { sessionId },
      data: {
        status: 'cancelled',
        failedAt: new Date(),
        failureReason: 'Human approval rejected second batch execution'
      }
    })

    await activeWriteAuditLog({
      actor: resumedBy,
      action: 'orchestration.session.cancelled',
      targetType: 'orchestration',
      targetId: sessionId,
      detail: `Orchestration session ${sessionId} cancelled by human`,
      riskLevel: 'low',
      workspaceId
    })

    return updatedSession
  } else {
    // approved=true：Session.status = 'running'
    await prisma.orchestrationSession.update({
      where: { sessionId },
      data: { status: 'running' }
    })

    const subAgentIds = JSON.parse(session.subAgentIds) as string[]
    
    // 获取已经执行过的子任务
    const existingTasks = await prisma.subAgentTask.findMany({
      where: { sessionId }
    })
    const executedAgentIds = existingTasks.map(t => t.agentId)
    const remainingAgentIds = subAgentIds.filter(id => !executedAgentIds.includes(id))

    const successResults: Array<{ agentId: string; output: Record<string, unknown> }> = []
    
    // 加载已有完成的任务结果
    const completedTasks = existingTasks.filter(t => t.status === 'completed')
    for (const t of completedTasks) {
      successResults.push({ agentId: t.agentId, output: (t.output as Record<string, unknown>) || {} })
    }

    // 顺序执行剩余的
    let pipelineInput = (session.inputContext as Record<string, unknown>) || {}
    for (const res of successResults) {
      pipelineInput = { ...pipelineInput, ...res.output }
    }

    for (const agentId of remainingAgentIds) {
      const instruction = `Process task for goal: ${session.goal}`
      const task = await dispatchSubAgentTask(
        sessionId,
        agentId,
        instruction,
        pipelineInput,
        workspaceId,
        undefined,
        deps
      )
      pipelineInput = { ...pipelineInput, ...task.output }
      successResults.push({ agentId, output: task.output! })
    }

    // 合并结果
    const mergeStrategy = RESULT_MERGE_STRATEGY_DEFAULT
    const mergedOutput = deps?.mergeResults
      ? deps.mergeResults(successResults, mergeStrategy)
      : mergeSubAgentResults(successResults, mergeStrategy)

    const updatedSession = await prisma.orchestrationSession.update({
      where: { sessionId },
      data: {
        status: 'completed',
        mergedOutput: mergedOutput as any,
        completedAt: new Date()
      }
    })

    await activeWriteAuditLog({
      actor: resumedBy,
      action: 'orchestration.session.completed',
      targetType: 'orchestration',
      targetId: sessionId,
      detail: `Orchestration session ${sessionId} completed after human approval`,
      riskLevel: 'low',
      workspaceId
    })

    return updatedSession
  }
}

// ─── 核心函数：getOrchestrationSession ────────────────────────────────
export async function getOrchestrationSession(
  sessionId: string,
  workspaceId: string
): Promise<any | null> {
  return await prisma.orchestrationSession.findFirst({
    where: { sessionId, workspaceId },
    include: { subAgentTasks: true }
  })
}
