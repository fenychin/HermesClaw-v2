// TIMEOUT STRATEGY NOTE:
// In-process setTimeout is NOT used for timeout enforcement — Vercel Serverless
// functions do not guarantee timer execution after request completion.
// Timeout enforcement is delegated to /api/cron/workflow-timeout (runs every 5 min).
// MAX_WORKFLOW_RUN_DURATION_MS and DEFAULT_STEP_TIMEOUT_MS are used by the Cron job.

import { prisma } from "@/lib/prisma"
import { writeAuditLog } from "@/lib/server/audit"
import { randomUUID } from 'crypto'
import { topoSortFlat } from './utils/topo-sort'
import {
  ToolGrantMissingException,
  GuardrailError,
  GuardrailViolationError
} from "@/lib/server/exceptions"

function resolveEngineDeps(deps?: RuntimeEngineDeps) {
  const activeDeps = deps || defaultDeps
  const activeWriteAuditLog = activeDeps.writeAuditLog || writeAuditLog
  return { activeDeps, activeWriteAuditLog }
}

// 1. 顶层常量
export const RUNTIME_ENGINE_VERSION = '1.0'
export const DEFAULT_STEP_TIMEOUT_MS = 60 * 1000          // 单步默认 60s 超时
export const MAX_PARALLEL_STEPS = 10                       // 并行最多 10 个步骤
export const MAX_WORKFLOW_RUN_DURATION_MS = 30 * 60 * 1000 // 单次 Run 最长 30 分钟
export const STEP_RETRY_DELAY_MS = 3000                    // 步骤重试间隔 3s
export const MAX_STEP_RETRIES = 3                          // 步骤最大重试次数
export const WORKFLOW_HEARTBEAT_INTERVAL_MS = 10 * 1000    // 心跳检测间隔 10s

// 支持的节点类型列表
export const SUPPORTED_NODE_TYPES = [
  'agent-call',
  'skill-call',
  'connector-call',
  'condition',
  'human-approval',
  'merge',
  'branch',
  'delay'
]

// 2. 错误类型
export class WorkflowRunNotFoundError extends Error {
  constructor(runId: string) {
    super(`Workflow run not found: ${runId}`)
    this.name = 'WorkflowRunNotFoundError'
  }
}

export class StepRunNotFoundError extends Error {
  constructor(stepId: string) {
    super(`Step run not found: ${stepId}`)
    this.name = 'StepRunNotFoundError'
  }
}

export class WorkflowRunTimeoutError extends Error {
  constructor(runId: string) {
    super(`Workflow run ${runId} timed out`)
    this.name = 'WorkflowRunTimeoutError'
  }
}

export class WorkflowNodeNotSupportedError extends Error {
  constructor(nodeType: string) {
    super(`Unsupported workflow node type: ${nodeType}`)
    this.name = 'WorkflowNodeNotSupportedError'
  }
}

export class ParallelLimitExceededError extends Error {
  constructor(count: number, limit: number) {
    super(`Parallel execution count ${count} exceeds limit: ${limit}`)
    this.name = 'ParallelLimitExceededError'
  }
}

export class WorkflowRunAlreadyCompletedError extends Error {
  constructor(runId: string, status: string) {
    super(`Workflow run ${runId} is already in a completed state: ${status}`)
    this.name = 'WorkflowRunAlreadyCompletedError'
  }
}

// 3. 依赖接口
export interface RuntimeEngineDeps {
  writeAuditLog: (input: any) => Promise<void>
  callAgent?: (agentId: string, input: Record<string, unknown>, opts?: {
    workspaceId: string
    timeoutMs?: number
  }) => Promise<Record<string, unknown>>
  callCapability?: (capabilityId: string, input: Record<string, unknown>, opts?: {
    workspaceId: string
    version?: string
    timeoutMs?: number
  }) => Promise<Record<string, unknown>>
  evaluateCondition?: (condition: string, context: Record<string, unknown>) => boolean
  requestHumanApproval?: (stepId: string, context: Record<string, unknown>) => Promise<boolean>
}

// 默认依赖配置，用于生产运行时环境
export const defaultDeps: RuntimeEngineDeps = {
  writeAuditLog,
  callAgent: async (agentId, input, opts) => {
    const { executeAgentAction } = await import('@/lib/server/agent-execute-service')
    const action = (input.instruction as string) || (input.action as string) || ''
    const result = await executeAgentAction({
      agentId,
      workspaceId: opts?.workspaceId || '',
      action,
    })
    return result as Record<string, unknown>
  },
  callCapability: async (capabilityId, input, opts) => {
    const isSkill = await prisma.skill.findUnique({ where: { id: capabilityId } })
    if (isSkill) {
      const { executeSkillNode } = await import('./skill-executor')
      const node = { id: 'temp-node', config: { skillId: capabilityId } }
      const ctx = { workspaceId: opts?.workspaceId || 'default', industryId: (input.industryId as string) }
      const result = await executeSkillNode(node as any, ctx as any)
      if (result.status === 'failed') {
        throw new Error(result.error || 'Skill execution failed')
      }
      return result.output || {}
    } else {
      if (capabilityId === 'built-in.email') {
        const { sendEmail } = await import('../connectors/email-connector')
        const emailInput = {
          connectorId: capabilityId,
          workspaceId: opts?.workspaceId || 'default',
          from: (input.from as any),
          to: (input.to as any),
          cc: (input.cc as any),
          subject: (input.subject as string) || '',
          bodyHtml: (input.bodyHtml as string) || '',
          bodyText: (input.bodyText as string),
          attachments: (input.attachments as any),
          templateId: (input.templateId as string),
          templateVariables: (input.templateVariables as any),
          agentId: (input.agentId as string),
          taskId: (input.taskId as string),
          leaseToken: (input.leaseToken as string),
          injectUnsubscribeLink: (input.injectUnsubscribeLink as boolean),
          unsubscribeUrl: (input.unsubscribeUrl as string),
          workflowRunId: (input.workflowRunId as string),
        }
        const result = await sendEmail(emailInput)
        return result as any
      } else {
        throw new Error(`Capability not found: ${capabilityId}`)
      }
    }
  }
}

// 内部辅助函数：处理失败工作流状态与审计
async function failWorkflowRunAndAudit(
  runId: string,
  workflowId: string,
  workspaceId: string,
  errorMessage: string,
  errorCode: string,
  failedStepId: string | undefined,
  activeWriteAuditLog: any
) {
  try {
    await prisma.workflowRun.update({
      where: { runId },
      data: {
        status: 'failed',
        errorMessage,
        completedAt: new Date()
      }
    })
  } catch (dbErr) {
    console.error(`[runtime-engine] CRITICAL: Failed to update WorkflowRun ${runId} to failed status:`, dbErr)
  }

  try {
    await activeWriteAuditLog({
      actor: 'system',
      action: 'workflow.run.error', // changed from failed to error to align with dag-engine / high risk
      targetType: 'workflow',
      targetId: workflowId,
      detail: `Workflow run ${runId} failed: ${errorMessage}`,
      riskLevel: 'high',
      workspaceId,
      contextSnapshot: { runId, errorCode, failedStepId },
      workflowRunId: runId
    })
  } catch (auditErr) {
    console.error(`[runtime-engine] CRITICAL: failed to write AuditLog for workflow run error`, auditErr)
  }
}

// 4. startWorkflowRun
export async function startWorkflowRun(
  input: {
    workflowId: string
    workspaceId: string
    mode?: 'sequential' | 'parallel' | 'conditional' | 'human-in-loop'
    inputContext?: Record<string, unknown>
    triggeredBy?: string
    triggerType?: 'manual' | 'scheduled' | 'event' | 'agent-dispatch'
    agentId?: string
    sessionId?: string
    workflowRunId?: string
  },
  deps?: RuntimeEngineDeps
): Promise<any> {
  const { activeDeps, activeWriteAuditLog } = resolveEngineDeps(deps)

  // 0. 幂等查重：检查是否已存在该 taskId 的运行记录
  const taskId = (input as any).taskId || (input.inputContext?.taskId as string)
  if (taskId) {
    const existing = await prisma.workflowRun.findFirst({
      where: {
        workspaceId: input.workspaceId,
        workflowId: input.workflowId,
      }
    })
    if (existing) {
      try {
        const parsedInput = JSON.parse(existing.input)
        if (parsedInput.taskId === taskId || existing.runId === taskId) {
          return existing
        }
      } catch {}
      const contextObj = existing.inputContext as Record<string, any>
      if (contextObj && contextObj.taskId === taskId) {
        return existing
      }
    }
  }

  // 1. 加载 Workflow 定义
  const workflow = await prisma.workflow.findUnique({
    where: { id: input.workflowId }
  })
  if (!workflow) {
    throw new Error(`Workflow not found: ${input.workflowId}`)
  }

  const nodes = JSON.parse(workflow.nodes) as any[]
  const edges = JSON.parse(workflow.edges) as any[]

  // 2. 校验所有的 nodeType (或者 kind)
  for (const node of nodes) {
    const nodeType = node.config?.nodeType || node.kind
    if (!SUPPORTED_NODE_TYPES.includes(nodeType)) {
      throw new WorkflowNodeNotSupportedError(nodeType)
    }
  }

  // 计算拓扑排序
  const sortedNodes = topoSortFlat(nodes, edges)

  let runId = input.workflowRunId || (input.inputContext?.workflowRunId as string) || `run-${randomUUID()}`
  if (!runId.startsWith('run-')) {
    runId = `run-${runId}`
  }

  // 3. 创建 WorkflowRun 记录
  const run = await prisma.workflowRun.create({
    data: {
      runId,
      workspaceId: input.workspaceId,
      workflowId: input.workflowId,
      status: 'running',
      mode: input.mode || 'sequential',
      triggeredBy: input.triggeredBy || 'system',
      triggerType: input.triggerType || 'manual',
      inputContext: (input.inputContext || {}) as any,
      agentId: input.agentId || null,
      sessionId: input.sessionId || null,
      // 旧字段兼容
      trigger: input.triggerType || 'manual',
      input: JSON.stringify(input.inputContext || {}),
    }
  })

  // 4. 创建 StepRun 记录
  // 建立 parent/child 关系表
  const stepIdMap = new Map<string, string>() // nodeId -> stepId
  for (const node of sortedNodes) {
    stepIdMap.set(node.id, `step-${runId}-${node.id}`)
  }

  for (const node of sortedNodes) {
    const stepId = stepIdMap.get(node.id)!
    const nodeType = node.config?.nodeType || node.kind

    // 寻找 parent 和 child
    const parentEdges = edges.filter(e => e.to === node.id)
    const childEdges = edges.filter(e => e.from === node.id)

    const parentStepId = parentEdges.length > 0 ? stepIdMap.get(parentEdges[0].from) : null
    const childStepIds = childEdges.map(e => stepIdMap.get(e.to)!)

    await prisma.stepRun.create({
      data: {
        stepId,
        runId,
        workspaceId: input.workspaceId,
        nodeId: node.id,
        nodeType,
        status: 'pending',
        inputData: node.config?.inputData || {},
        parentStepId,
        childStepIds: JSON.stringify(childStepIds),
        agentId: node.config?.agentId || null,
        capabilityId: node.config?.capabilityId || null,
      }
    })
  }

  // 5. 更新 WorkflowRun.status = 'running'
  const updatedRun = await prisma.workflowRun.update({
    where: { runId },
    data: {
      status: 'running',
      startedAt: new Date()
    }
  })

  // 6. 写入 AuditLog
  await activeWriteAuditLog({
    actor: input.triggeredBy || 'system',
    action: 'workflow.run.started',
    targetType: 'workflow',
    targetId: input.workflowId,
    detail: `Workflow run ${runId} started`,
    riskLevel: 'low',
    workspaceId: input.workspaceId,
    contextSnapshot: { runId, workflowId: input.workflowId, triggeredBy: input.triggeredBy || 'system' },
    workflowRunId: runId
  })

  return updatedRun
}

// 辅助等待函数
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// 5. executeWorkflowRun
export async function executeWorkflowRun(
  runId: string,
  workspaceId: string,
  deps?: RuntimeEngineDeps
): Promise<any> {
  const { activeDeps, activeWriteAuditLog } = resolveEngineDeps(deps)

  // 1. 读取 WorkflowRun
  const run = await prisma.workflowRun.findUnique({
    where: { runId },
    include: { steps: true }
  })

  if (!run) {
    throw new WorkflowRunNotFoundError(runId)
  }

  if (['completed', 'failed', 'cancelled'].includes(run.status)) {
    throw new WorkflowRunAlreadyCompletedError(runId, run.status)
  }

  return (async () => {
    let currentInput = { ...(run.inputContext as Record<string, any>) }

    // 开始执行
    try {
      while (true) {
        // 动态加载最新的 steps 状态
        const steps = await prisma.stepRun.findMany({
          where: { runId }
        })

        // 检查是否有失败的步骤且没有重试机会，若有则直接标记整体运行失败
        const failedStep = steps.find(s => s.status === 'failed')
        if (failedStep) {
          throw new Error(`Step ${failedStep.nodeId} failed: ${failedStep.errorMessage}`)
        }

        // 判断是否全部完成
        const allFinished = steps.every(s => ['completed', 'skipped'].includes(s.status))
        if (allFinished) {
          break
        }

        // 找出所有前置步骤都已完成（且自身为 pending 状态）的步骤
        const executableSteps = steps.filter(s => {
          if (s.status !== 'pending') return false
          if (!s.parentStepId) return true
          const parent = steps.find(p => p.stepId === s.parentStepId)
          return parent && ['completed', 'skipped'].includes(parent.status)
        })

        if (executableSteps.length === 0) {
          // 如果有正在运行的步骤，等待一下继续轮询
          const runningSteps = steps.filter(s => s.status === 'running')
          if (runningSteps.length > 0) {
            await sleep(500)
            continue
          }
          // 检查是否有处于 waiting-human 状态的步骤，说明暂停了
          const waitingStep = steps.find(s => s.status === 'waiting')
          if (waitingStep) {
            // 更新 WorkflowRun 为 waiting-human 并暂停
            await prisma.workflowRun.update({
              where: { runId },
              data: { status: 'waiting' }
            })
            return await prisma.workflowRun.findUnique({ where: { runId } })
          }
          // 否则就是死锁或无路可走，直接退出
          break
        }

        // 执行模式分支
        if (run.mode === 'sequential') {
          // 串行执行
          const step = executableSteps[0]
          // 合并前置节点的输出
          if (step.parentStepId) {
            const parent = steps.find(p => p.stepId === step.parentStepId)
            if (parent && parent.outputData) {
              currentInput = { ...currentInput, ...(parent.outputData as Record<string, any>) }
            }
          }
          try {
            const output = await executeStep(step.stepId, currentInput, activeDeps)
            // 更新本节点的数据
            currentInput = { ...currentInput, ...output }
          } catch (err) {
            // 步骤执行抛错
            await failWorkflowRunAndAudit(
              runId,
              run.workflowId,
              workspaceId,
              err instanceof Error ? err.message : 'Step failed',
              err instanceof Error ? err.name || 'Error' : 'UNKNOWN_ERROR',
              step.nodeId,
              activeWriteAuditLog
            )
            throw err
          }
        } else if (run.mode === 'parallel' || run.mode === 'conditional' || run.mode === 'human-in-loop') {
          // 并行模式
          if (executableSteps.length > MAX_PARALLEL_STEPS) {
            throw new ParallelLimitExceededError(executableSteps.length, MAX_PARALLEL_STEPS)
          }

          // 同层并行执行
          const results = await Promise.allSettled(
            executableSteps.map(async (step) => {
              // 寻找前置节点数据
              let stepInput = { ...currentInput }
              if (step.parentStepId) {
                const parent = steps.find(p => p.stepId === step.parentStepId)
                if (parent && parent.outputData) {
                  stepInput = { ...stepInput, ...(parent.outputData as Record<string, any>) }
                }
              }
              return {
                stepId: step.stepId,
                output: await executeStep(step.stepId, stepInput, activeDeps)
              }
            })
          )

          // 收集执行结果。若有步骤失败，抛出错误中止循环
          let hasFailure = false
          const failMessages: string[] = []
          for (const res of results) {
            if (res.status === 'rejected') {
              hasFailure = true
              failMessages.push(res.reason?.message || 'Parallel step execution failed')
            } else {
              currentInput = { ...currentInput, ...res.value.output }
            }
          }

          if (hasFailure) {
            const failMessage = failMessages.join('; ')
            await failWorkflowRunAndAudit(
              runId,
              run.workflowId,
              workspaceId,
              failMessage,
              'PARALLEL_ERROR',
              undefined,
              activeWriteAuditLog
            )
            throw new Error(failMessage)
          }
        }
      }

      // 聚合所有步骤输出
      const finalSteps = await prisma.stepRun.findMany({ where: { runId } })
      const stepOutputs: Record<string, any> = {}
      for (const s of finalSteps) {
        if (s.status === 'completed' && s.outputData) {
          stepOutputs[s.nodeId] = s.outputData
        }
      }

      const durationMs = Date.now() - (run.startedAt ? run.startedAt.getTime() : Date.now())

      // 更新 WorkflowRun 为 completed
      const finalRun = await prisma.workflowRun.update({
        where: { runId },
        data: {
          status: 'completed',
          outputContext: stepOutputs as any,
          completedAt: new Date(),
          durationMs,
          // 旧字段兼容
          output: JSON.stringify(stepOutputs),
          finishedAt: new Date()
        }
      })

      // 写入 AuditLog
      const successCount = finalSteps.filter(s => s.status === 'completed').length
      const skippedCount = finalSteps.filter(s => s.status === 'skipped').length
      await activeWriteAuditLog({
        actor: 'system',
        action: 'workflow.run.completed',
        targetType: 'workflow',
        targetId: run.workflowId,
        detail: `Workflow run ${runId} completed. Total steps: ${finalSteps.length}, Success: ${successCount}, Skipped: ${skippedCount}`,
        riskLevel: 'low',
        workspaceId,
        contextSnapshot: { runId, durationMs, stepCount: finalSteps.length },
        workflowRunId: runId
      })

      return finalRun
    } catch (err) {
      // 容错并标记失败
      await failWorkflowRunAndAudit(
        runId,
        run.workflowId,
        workspaceId,
        err instanceof Error ? err.message : 'Unknown execution error',
        'UNKNOWN_EXECUTION_ERROR',
        undefined,
        activeWriteAuditLog
      )
      throw err
    }
  })()
}

// 6. executeStep
export async function executeStep(
  stepId: string,
  inputData: Record<string, unknown>,
  deps?: RuntimeEngineDeps
): Promise<Record<string, unknown>> {
  const { activeDeps, activeWriteAuditLog } = resolveEngineDeps(deps)

  // 1. 获取 StepRun
  const step = await prisma.stepRun.findUnique({
    where: { stepId }
  })
  if (!step) {
    throw new StepRunNotFoundError(stepId)
  }

  // 1.5 幂等保护：若已完成直接短路返回其 outputData，避免重复执行
  if (step.status === 'completed') {
    return (step.outputData as Record<string, unknown>) || {}
  }

  // 2. 状态更新为 running
  await prisma.stepRun.update({
    where: { stepId },
    data: {
      status: 'running',
      startedAt: new Date(),
      inputData: inputData as any
    }
  })

  const startTime = Date.now()

  return (async () => {
    let output: Record<string, unknown> = {}
    let retries = 0

    while (true) {
      try {
        if (step.nodeType === 'agent-call') {
          const nodeConfig = (step.inputData || {}) as any
          if (nodeConfig.subAgentIds && Array.isArray(nodeConfig.subAgentIds) && nodeConfig.subAgentIds.length > 0) {
            // 多 Agent 协同场景
            const { runOrchestration } = await import('../orchestrator')
            const session = await runOrchestration({
              workflowRunId: step.runId,
              workspaceId: step.workspaceId,
              orchestratorAgentId: step.agentId || nodeConfig.agentId,
              subAgentIds: nodeConfig.subAgentIds,
              mode: nodeConfig.orchestrationMode || 'sequential',
              goal: nodeConfig.goal || step.nodeId,
              inputContext: inputData,
              createdBy: 'workflow-runtime',
            }, {
              writeAuditLog: activeDeps.writeAuditLog,
              callSubAgent: async (agentId, instruction, data, opts) => {
                if (!activeDeps.callAgent) throw new Error('callAgent not configured')
                return activeDeps.callAgent(agentId, { instruction, ...data }, opts)
              },
            })
            output = (session.mergedOutput as Record<string, unknown>) || {}
          } else {
            if (!activeDeps.callAgent) throw new Error('callAgent not configured')
            output = await activeDeps.callAgent(step.agentId!, inputData, {
              workspaceId: step.workspaceId
            })
          }
        } else if (step.nodeType === 'skill-call' || step.nodeType === 'connector-call') {
          if (!activeDeps.callCapability) throw new Error('callCapability not configured')
          output = await activeDeps.callCapability(step.capabilityId!, inputData, {
            workspaceId: step.workspaceId
          })
        } else if (step.nodeType === 'condition') {
          if (!activeDeps.evaluateCondition) {
            // 内置条件匹配
            const config = (inputData.conditionConfig || {}) as any
            const varName = config.variable
            const expected = config.expected
            const actual = inputData[varName]
            const matched = String(actual) === String(expected)
            output = { result: matched }
          } else {
            const config = (inputData.conditionConfig || {}) as any
            const matched = activeDeps.evaluateCondition(config.expression || '', inputData)
            output = { result: matched }
          }

          // 条件处理：非匹配分支需要标记为 skipped
          const matched = !!output.result
          const childIds = JSON.parse(step.childStepIds) as string[]
          if (childIds.length > 0) {
            // 条件节点后面如果有 true 分支和 false 分支
            // 假设我们约定 childStepIds[0] 是 true 分支，childStepIds[1] 是 false 分支
            // 或者通过递归 propagateSkip 将所有未激活的分支置为 skipped
            const skippedStepId = matched ? childIds[1] : childIds[0]
            if (skippedStepId) {
              await propagateSkip(skippedStepId, step.runId)
            }
          }
        } else if (step.nodeType === 'human-approval') {
          // 人工介入
          if (!activeDeps.requestHumanApproval) {
            // 默认暂停并等待
            await prisma.stepRun.update({
              where: { stepId },
              data: { status: 'waiting' }
            })
            // 抛出暂停信号让 executeWorkflowRun 知晓
            throw new Error('Approval pending')
          } else {
            const approved = await activeDeps.requestHumanApproval(stepId, inputData)
            output = { approved }
            if (!approved) {
              // 拒绝则直接终止
              throw new Error('Human approval rejected')
            }
          }
        } else if (step.nodeType === 'merge') {
          // 合并输入
          const results = (inputData.results || []) as any[]
          const merged: Record<string, any> = {}
          for (const res of results) {
            if (res && typeof res === 'object') {
              Object.assign(merged, res)
            }
          }
          output = merged
        } else if (step.nodeType === 'branch') {
          // 透传
          output = { ...inputData }
        } else if (step.nodeType === 'delay') {
          // 延迟节点
          let delayMs = (inputData.delayMs as number) || 1000
          if (delayMs > 30000) {
            delayMs = 30000
            await activeWriteAuditLog({
              actor: 'system',
              action: 'workflow.step.warning',
              targetType: 'workflow',
              targetId: step.nodeId,
              detail: `Delay time truncated to 30s for step ${step.nodeId}`,
              riskLevel: 'low',
              workspaceId: step.workspaceId,
              workflowRunId: step.runId
            })
          }
          await sleep(delayMs)
          output = { delayedMs: delayMs }
        }

        // 执行成功，更新 StepRun
        const durationMs = Date.now() - startTime
        await prisma.stepRun.update({
          where: { stepId },
          data: {
            status: 'completed',
            outputData: output as any,
            completedAt: new Date(),
            durationMs
          }
        })

        return output
      } catch (err) {
        if (err instanceof Error && err.message === 'Approval pending') {
          throw err
        }

        const isFastFail = err instanceof Error && (
          err.message === 'Human approval rejected' ||
          err instanceof ToolGrantMissingException ||
          err instanceof GuardrailError ||
          err instanceof GuardrailViolationError ||
          err.name.includes('Grant') ||
          err.name.includes('Policy')
        )

        // 重试逻辑
        if (!isFastFail && retries < MAX_STEP_RETRIES) {
          retries++
          await prisma.stepRun.update({
            where: { stepId },
            data: { retryCount: retries }
          })
          await sleep(STEP_RETRY_DELAY_MS)
        } else {
          // 重试耗尽或命中短路，失败
          const durationMs = Date.now() - startTime
          const errorMessage = err instanceof Error ? err.message : 'Execution error'
          const errorCode = isFastFail ? 'STEP_EXECUTION_REJECTED' : 'STEP_EXECUTION_ERROR'

          await prisma.stepRun.update({
            where: { stepId },
            data: {
              status: 'failed',
              errorCode,
              errorMessage,
              completedAt: new Date(),
              durationMs
            }
          })

          try {
            await activeWriteAuditLog({
              actor: 'system',
              action: 'workflow.step.error',
              targetType: 'workflow',
              targetId: step.nodeId,
              detail: `Step ${step.nodeId} failed: ${errorMessage}`,
              riskLevel: 'high',
              workspaceId: step.workspaceId,
              contextSnapshot: { stepId, errorCode },
              workflowRunId: step.runId
            })
          } catch (auditErr) {
            console.error(`[runtime-engine] CRITICAL: failed to write AuditLog for step error`, auditErr)
          }

          throw err
        }
      }
    }
  })()
}

// 递归标记后续依赖节点为 skipped
async function propagateSkip(startStepId: string, runId: string): Promise<void> {
  const steps = await prisma.stepRun.findMany({ where: { runId } })
  const queue = [startStepId]
  const visited = new Set<string>()

  while (queue.length > 0) {
    const currId = queue.shift()!
    if (visited.has(currId)) continue
    visited.add(currId)

    const step = steps.find(s => s.stepId === currId)
    if (step && step.status === 'pending') {
      await prisma.stepRun.update({
        where: { stepId: currId },
        data: { status: 'skipped' }
      })
      // 把它的所有子节点也推入 queue
      const childIds = JSON.parse(step.childStepIds) as string[]
      queue.push(...childIds)
    }
  }
}

// 7. resumeWorkflowRun
export async function resumeWorkflowRun(
  runId: string,
  workspaceId: string,
  approved: boolean,
  resumedBy: string,
  deps?: RuntimeEngineDeps
): Promise<any> {
  const { activeDeps, activeWriteAuditLog } = resolveEngineDeps(deps)

  const run = await prisma.workflowRun.findUnique({
    where: { runId }
  })
  if (!run) {
    throw new WorkflowRunNotFoundError(runId)
  }

  // 寻找处于 waiting 状态的 step
  const waitingStep = await prisma.stepRun.findFirst({
    where: { runId, status: 'waiting' }
  })

  if (!waitingStep) {
    if (!approved) {
      // 容错机制：如果没有找到 waiting 状态的步骤且是被拒绝，直接取消整个工作流即可
      await cancelWorkflowRun(runId, workspaceId, resumedBy, activeDeps)
      await activeWriteAuditLog({
        actor: resumedBy,
        action: 'workflow.run.rejected',
        targetType: 'workflow',
        targetId: run.workflowId,
        detail: `Workflow run ${runId} rejected by human approval (no waiting step)`,
        riskLevel: 'medium',
        workspaceId,
        workflowRunId: runId
      })
      return await prisma.workflowRun.findUnique({ where: { runId } })
    }
    throw new Error(`No waiting step found for workflow run: ${runId}`)
  }

  if (approved) {
    // 审批通过，更新该 step 状态为 completed 并设 output
    await prisma.stepRun.update({
      where: { stepId: waitingStep.stepId },
      data: {
        status: 'completed',
        outputData: { approved: true },
        completedAt: new Date()
      }
    })
    // 将 WorkflowRun 改回 running
    await prisma.workflowRun.update({
      where: { runId },
      data: { status: 'running' }
    })
    await activeWriteAuditLog({
      actor: resumedBy,
      action: 'workflow.run.resumed',
      targetType: 'workflow',
      targetId: run.workflowId,
      detail: `Workflow run ${runId} resumed with approval`,
      riskLevel: 'low',
      workspaceId,
      workflowRunId: runId
    })
    // 异步触发继续执行
    executeWorkflowRun(runId, workspaceId, activeDeps).catch(() => {})
  } else {
    // 审批拒绝，取消工作流
    await prisma.stepRun.update({
      where: { stepId: waitingStep.stepId },
      data: {
        status: 'failed',
        errorCode: 'APPROVAL_REJECTED',
        errorMessage: 'Human approval rejected',
        completedAt: new Date()
      }
    })
    await cancelWorkflowRun(runId, workspaceId, resumedBy, activeDeps)
    await activeWriteAuditLog({
      actor: resumedBy,
      action: 'workflow.run.rejected',
      targetType: 'workflow',
      targetId: run.workflowId,
      detail: `Workflow run ${runId} rejected by human approval`,
      riskLevel: 'medium',
      workspaceId,
      workflowRunId: runId
    })
  }

  return await prisma.workflowRun.findUnique({ where: { runId } })
}

// 8. cancelWorkflowRun
export async function cancelWorkflowRun(
  runId: string,
  workspaceId: string,
  cancelledBy: string,
  deps?: RuntimeEngineDeps
): Promise<any> {
  const activeDeps = deps || defaultDeps
  const activeWriteAuditLog = activeDeps.writeAuditLog || writeAuditLog

  const run = await prisma.workflowRun.findUnique({
    where: { runId }
  })
  if (!run) {
    throw new WorkflowRunNotFoundError(runId)
  }

  // 把所有 pending / running / waiting 的 steps 置为 skipped
  await prisma.stepRun.updateMany({
    where: {
      runId,
      status: { in: ['pending', 'running', 'waiting'] }
    },
    data: {
      status: 'skipped'
    }
  })

  const updatedRun = await prisma.workflowRun.update({
    where: { runId },
    data: {
      status: 'cancelled',
      completedAt: new Date(),
      // 旧字段兼容
      finishedAt: new Date()
    }
  })

  await activeWriteAuditLog({
    actor: cancelledBy,
    action: 'workflow.run.cancelled',
    targetType: 'workflow',
    targetId: run.workflowId,
    detail: `Workflow run ${runId} cancelled`,
    riskLevel: 'low',
    workspaceId,
    workflowRunId: runId
  })

  return updatedRun
}

// 9. getWorkflowRunStatus
export async function getWorkflowRunStatus(
  runId: string,
  workspaceId: string
): Promise<{
  run: any
  steps: any[]
  summary: {
    total: number
    pending: number
    running: number
    completed: number
    failed: number
    skipped: number
  }
}> {
  const run = await prisma.workflowRun.findUnique({
    where: { runId }
  })
  if (!run) {
    throw new WorkflowRunNotFoundError(runId)
  }

  const steps = await prisma.stepRun.findMany({
    where: { runId }
  })

  const total = steps.length
  const pending = steps.filter(s => s.status === 'pending').length
  const running = steps.filter(s => s.status === 'running').length
  const completed = steps.filter(s => s.status === 'completed').length
  const failed = steps.filter(s => s.status === 'failed').length
  const skipped = steps.filter(s => s.status === 'skipped').length

  return {
    run,
    steps,
    summary: {
      total,
      pending,
      running,
      completed,
      failed,
      skipped
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// dispatchEnvelope — TD-004: First-class TaskEnvelope dispatch API
//
// Replaces the `inputContext: { envelope } as any` hack in
// workflow-run-starter.ts. The envelope is a typed top-level param
// and is persisted to WorkflowRun.envelopeSnapshot for audit/policy.
// ─────────────────────────────────────────────────────────────────

export interface DispatchEnvelopeInput {
  envelope: {
    taskId: string
    workspaceId: string
    agentId?: string
    actionType?: string
    riskLevel?: string
    automationLevel?: string
    input?: Record<string, unknown>
    policySnapshotVersion?: string
    [key: string]: unknown   // allow extra fields from event-contracts evolution
  }
  workflowId: string
  workspaceId: string
  triggeredBy?: string
  agentId?: string
  mode?: 'sequential' | 'parallel' | 'conditional' | 'human-in-loop'
}

export async function dispatchEnvelope(
  input: DispatchEnvelopeInput,
  deps?: RuntimeEngineDeps,
): Promise<{ run: any; envelopeTaskId: string }> {
  const { envelope, ...runInput } = input

  const { activeWriteAuditLog } = resolveEngineDeps(deps)

  const rawRisk = envelope.riskLevel as string
  const auditRiskLevel: any = rawRisk === 'critical' ? 'high' : (['low', 'medium', 'high'].includes(rawRisk) ? rawRisk : 'low')

  await activeWriteAuditLog({
    actor: envelope.agentId || 'system',
    action: 'workflow.run.dispatched',
    targetType: 'workflow',
    targetId: runInput.workflowId,
    detail: `Dispatching TaskEnvelope (taskId: ${envelope.taskId}) to Workflow (workflowId: ${runInput.workflowId})`,
    riskLevel: auditRiskLevel,
    workspaceId: runInput.workspaceId,
    workflowRunId: envelope.taskId,
    contextSnapshot: {
      envelope,
      mode: runInput.mode,
      triggeredBy: runInput.triggeredBy
    }
  })

  // 1. Start the workflow run — envelope.taskId is the idempotency key
  const run = await startWorkflowRun(
    {
      workflowId: runInput.workflowId,
      workspaceId: runInput.workspaceId,
      agentId: runInput.agentId ?? envelope.agentId,
      mode: runInput.mode,
      triggeredBy: runInput.triggeredBy,
      triggerType: 'agent-dispatch',
      workflowRunId: (envelope.workflowRunId as string | undefined) ?? undefined,
      // Pass clean, typed inputContext — no more `as any`
      inputContext: {
        taskId: envelope.taskId,
        workflowRunId: envelope.workflowRunId,
        actionType: envelope.actionType ?? 'unknown',
        riskLevel: envelope.riskLevel ?? 'low',
        automationLevel: envelope.automationLevel ?? 'L2',
        ...(envelope.input ?? {}),
      },
    },
    deps,
  )

  // 2. Persist the full envelope snapshot on the run record for audit/policy
  await prisma.workflowRun.update({
    where: { runId: run.runId },
    data: {
      envelopeSnapshot: envelope as any,  // Json field — safe cast, no business logic
    },
  })

  return { run, envelopeTaskId: envelope.taskId }
}
