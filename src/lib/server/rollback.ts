import { prisma } from "@/lib/prisma"
import crypto from "crypto"
import { writeAuditLog } from "@/lib/server/audit"
import type { Prisma } from "@/generated/prisma-v2/client"

// ==============================
// 顶层常量
// ==============================

export const ROLLBACK_TIMEOUT_MS = 5 * 60 * 1000  // 5 分钟

// ==============================
// 错误类型定义
// ==============================

export class RollbackNotFoundError extends Error {
  constructor(rollbackId: string) {
    super(`HarnessRollback not found: ${rollbackId}`)
    this.name = 'RollbackNotFoundError'
  }
}

export class RollbackAlreadyCompletedError extends Error {
  constructor(rollbackId: string) {
    super(`HarnessRollback ${rollbackId} has already completed`)
    this.name = 'RollbackAlreadyCompletedError'
  }
}

export class RollbackInProgressError extends Error {
  constructor(canaryId: string) {
    super(`A rollback is already in progress for canary: ${canaryId}`)
    this.name = 'RollbackInProgressError'
  }
}

export class SnapshotMissingForRollbackError extends Error {
  constructor(snapshotId: string) {
    super(`HarnessSnapshot not found: ${snapshotId}`)
    this.name = 'SnapshotMissingForRollbackError'
  }
}

export class AgentNotFoundError extends Error {
  constructor(agentId: string) {
    super(`Agent not found: ${agentId}`)
    this.name = 'AgentNotFoundError'
  }
}

export class CanaryNotFoundError extends Error {
  constructor(canaryId: string) {
    super(`Canary not found: ${canaryId}`)
    this.name = 'CanaryNotFoundError'
  }
}

export class CanaryInvalidStateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CanaryInvalidStateError'
  }
}

// ==============================
// 核心类型定义
// ==============================

export type RollbackTriggerType = 'auto' | 'manual' | 'emergency'
export type RollbackStatus = 'pending' | 'in-progress' | 'completed' | 'failed'

export interface HarnessRollback {
  rollbackId: string
  workspaceId: string
  canaryId: string
  proposalId: string
  agentId: string
  snapshotId: string
  reason: string
  triggerType: RollbackTriggerType
  status: RollbackStatus
  restoredFields: RestoredFieldDiff[]
  startedAt: Date
  completedAt?: Date
  triggeredBy: string
  errorMessage?: string
}

export interface RestoredFieldDiff {
  field: string          // 被恢复的字段名
  entity: string         // 'agent' | 'workflowTemplate' | 'skillBinding' | 'connectorBinding'
  entityId: string
  previousValue: unknown // 快照中的值（恢复目标）
  currentValue: unknown  // 回滚前的当前值
}

export interface AuditInput {
  actor: string
  action: string
  targetType: string
  targetId: string
  detail?: string
  riskLevel?: 'low' | 'medium' | 'high'
  workspaceId: string
}

export interface RollbackDeps {
  writeAuditLog: (input: AuditInput) => Promise<void>
}

const defaultDeps: RollbackDeps = {
  writeAuditLog: async (input) => {
    await writeAuditLog(input)
  }
}

// ==============================
// 辅助解析函数
// ==============================

function parseJsonArray(str: string | null | undefined): string[] {
  if (!str) return []
  try {
    const parsed = JSON.parse(str)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// ==============================
// 核心函数实现
// ==============================

/**
 * 执行 Harness 回滚：将 Agent 配置恢复至指定快照状态
 */
export async function executeRollback(
  input: {
    canaryId: string
    workspaceId: string
    reason: string
    triggerType: RollbackTriggerType
    triggeredBy: string
  },
  deps?: RollbackDeps
): Promise<HarnessRollback> {
  const activeDeps = { ...defaultDeps, ...deps }
  const { canaryId, workspaceId, reason, triggerType, triggeredBy } = input

  // 1. 验证 HarnessCanary 存在且 status 符合状态机约束
  const canary = await prisma.harnessCanary.findUnique({
    where: { canaryId }
  })
  if (!canary) {
    throw new CanaryNotFoundError(canaryId)
  }
  if (canary.status !== 'running' && canary.status !== 'rolling-back') {
    throw new CanaryInvalidStateError(`Cannot trigger rollback from canary state: ${canary.status}`)
  }

  const snapshotId = canary.snapshotId
  const proposalId = canary.proposalId
  const agentId = canary.agentId

  // 2. 读取关联的快照
  const snapshot = await prisma.harnessSnapshot.findUnique({
    where: { snapshotId }
  })
  if (!snapshot) {
    await activeDeps.writeAuditLog({
      actor: triggeredBy,
      action: 'proposal.rollback',
      targetType: 'canary',
      targetId: canaryId,
      detail: `快照不存在，无法回滚。快照ID: ${snapshotId}`,
      riskLevel: 'high',
      workspaceId
    })
    throw new SnapshotMissingForRollbackError(snapshotId)
  }

  // 检查是否存在正在运行且未超时的回滚记录（自愈与超时熔断）
  const existingRollback = await prisma.harnessRollback.findFirst({
    where: {
      canaryId,
      status: 'in-progress'
    }
  })
  if (existingRollback) {
    const elapsed = Date.now() - existingRollback.startedAt.getTime()
    if (elapsed < ROLLBACK_TIMEOUT_MS) {
      throw new RollbackInProgressError(canaryId)
    } else {
      // 已经超时，将其标记为 failed 以允许发起新的回滚
      try {
        await prisma.harnessRollback.update({
          where: { rollbackId: existingRollback.rollbackId },
          data: {
            status: 'failed',
            errorMessage: `Rollback timed out after exceeding ${ROLLBACK_TIMEOUT_MS}ms`
          }
        })
      } catch (err) {
        console.error(`[executeRollback] Failed to mark timed-out rollback ${existingRollback.rollbackId} as failed:`, err)
      }
    }
  }

  // 3. 创建 HarnessRollback 记录 (status='pending')
  const rollbackId = `hrb-${crypto.randomUUID()}`
  
  await prisma.harnessRollback.create({
    data: {
      rollbackId,
      workspaceId,
      canaryId,
      proposalId,
      agentId,
      snapshotId,
      reason,
      triggerType,
      status: 'pending',
      triggeredBy,
      restoredFields: [] as unknown as Prisma.InputJsonValue
    }
  })

  // 4. 更新状态为 'in-progress'
  await prisma.harnessRollback.update({
    where: { rollbackId },
    data: { status: 'in-progress' }
  })

  const restoredFields: RestoredFieldDiff[] = []

  try {
    // 5. 单个 Prisma 事务原子执行全部恢复操作
    await prisma.$transaction(async (tx) => {
      // 5a. 恢复 Agent 配置
      const agent = await tx.agent.findUnique({
        where: { id: agentId }
      })
      if (!agent) {
        throw new AgentNotFoundError(agentId)
      }

      const snapshotAgentConfig = snapshot.agentConfig as Record<string, unknown>
      const fieldsToRestore = [
        'name',
        'description',
        'bindSkills',
        'bindConnectors',
        'memoryPermission',
        'harnessVersion',
        'automationLevel',
        'canDo',
        'cannotDo',
        'statsJson'
      ]

      const currentAgentConfig: Record<string, unknown> = {
        name: agent.name,
        description: agent.description,
        bindSkills: parseJsonArray(agent.bindSkills),
        bindConnectors: parseJsonArray(agent.bindConnectors),
        memoryPermission: agent.memoryPermission,
        harnessVersion: agent.harnessVersion,
        automationLevel: agent.automationLevel,
        canDo: parseJsonArray(agent.canDo),
        cannotDo: parseJsonArray(agent.cannotDo),
        statsJson: agent.statsJson ? JSON.parse(agent.statsJson) : {}
      }

      const agentUpdateData: Record<string, unknown> = {}

      for (const field of fieldsToRestore) {
        const snapshotVal = snapshotAgentConfig[field]
        const currentVal = currentAgentConfig[field]

        const isDifferent = JSON.stringify(snapshotVal) !== JSON.stringify(currentVal)
        if (isDifferent) {
          restoredFields.push({
            field,
            entity: 'agent',
            entityId: agentId,
            previousValue: snapshotVal,
            currentValue: currentVal
          })
        }

        // 格式化写入数据：如果原字段是 JSON 属性，需要转字符串写回数据库
        if (field === 'bindSkills' || field === 'bindConnectors' || field === 'canDo' || field === 'cannotDo' || field === 'statsJson') {
          agentUpdateData[field] = JSON.stringify(snapshotVal ?? (field === 'statsJson' ? {} : []))
        } else {
          agentUpdateData[field] = snapshotVal
        }
      }

      await tx.agent.update({
        where: { id: agentId },
        data: agentUpdateData
      })

      // 5b. 恢复 WorkflowTemplate 列表
      const snapshotWorkflows = (snapshot.workflowTemplates as Record<string, unknown>[]) || []
      const snapshotWorkflowIds = snapshotWorkflows.map(w => w.templateId as string)

      // 查询数据库中当前 workspace 下的所有 Workflow
      const currentWorkflows = await tx.workflow.findMany({
        where: { workspaceId }
      })

      for (const tpl of snapshotWorkflows) {
        const tplId = tpl.templateId as string
        const tplName = tpl.name as string
        const tplDesc = tpl.description as string
        const tplNodes = tpl.nodes
        const tplEdges = tpl.edges

        const currentWf = currentWorkflows.find(w => w.id === tplId)

        if (currentWf) {
          // 若存在，判定是否改变以记录 diff，并 upsert
          const isNodesDiff = JSON.stringify(parseJsonArray(currentWf.nodes)) !== JSON.stringify(tplNodes)
          const isEdgesDiff = JSON.stringify(parseJsonArray(currentWf.edges)) !== JSON.stringify(tplEdges)
          const isNameDiff = currentWf.name !== tplName

          if (isNameDiff || isNodesDiff || isEdgesDiff) {
            restoredFields.push({
              field: 'workflowTemplate',
              entity: 'workflowTemplate',
              entityId: tplId,
              previousValue: tpl,
              currentValue: {
                templateId: currentWf.id,
                name: currentWf.name,
                description: currentWf.description ?? "",
                nodes: parseJsonArray(currentWf.nodes),
                edges: parseJsonArray(currentWf.edges)
              }
            })
          }

          await tx.workflow.update({
            where: { id: tplId },
            data: {
              name: tplName,
              description: tplDesc,
              nodes: JSON.stringify(tplNodes),
              edges: JSON.stringify(tplEdges),
              status: 'active'
            }
          })
        } else {
          // 若不存在，则创建
          restoredFields.push({
            field: 'workflowTemplate',
            entity: 'workflowTemplate',
            entityId: tplId,
            previousValue: tpl,
            currentValue: null
          })

          await tx.workflow.create({
            data: {
              id: tplId,
              workspaceId,
              name: tplName,
              description: tplDesc,
              nodes: JSON.stringify(tplNodes),
              edges: JSON.stringify(tplEdges),
              status: 'active'
            }
          })
        }
      }

      // 灰度期间新增但快照中没有的关联工作流 -> 将状态设为 'deprecated'
      const agentSkills = parseJsonArray(agent.bindSkills)
      for (const curWf of currentWorkflows) {
        if (!snapshotWorkflowIds.includes(curWf.id)) {
          // 判定该 Workflow 是否与此 Agent 关联
          let isAssociated = false
          if (agent.industryId && curWf.industryId === agent.industryId) {
            isAssociated = true
          } else {
            try {
              const nodes = JSON.parse(curWf.nodes)
              if (Array.isArray(nodes)) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                isAssociated = nodes.some((node: any) => {
                  if (node.config?.agentId === agentId) return true
                  if (node.config?.skillId && agentSkills.includes(node.config.skillId)) return true
                  return false
                })
              }
            } catch {
              // ignore
            }
          }

          if (isAssociated && curWf.status !== 'deprecated') {
            restoredFields.push({
              field: 'status',
              entity: 'workflowTemplate',
              entityId: curWf.id,
              previousValue: 'deprecated',
              currentValue: curWf.status
            })

            await tx.workflow.update({
              where: { id: curWf.id },
              data: { status: 'deprecated' }
            })
          }
        }
      }

      // 5c. 恢复 SkillBinding 列表
      const snapshotSkillBindings = (snapshot.skillBindings as Record<string, unknown>[]) || []
      const snapshotSkillIds = snapshotSkillBindings.map(b => b.skillId as string)

      // 查询数据库中，所有 usedByAgents 包含该 agentId 的 Skill
      const currentSkills = await tx.skill.findMany({
        where: { workspaceId }
      })

      // 处理快照里的技能绑定关系，若没有则追加绑定关系
      for (const skillId of snapshotSkillIds) {
        const curSkill = currentSkills.find(s => s.id === skillId)
        if (curSkill) {
          const usedBy = parseJsonArray(curSkill.usedByAgents)
          if (!usedBy.includes(agentId)) {
            const updatedUsedBy = [...usedBy, agentId]
            
            restoredFields.push({
              field: 'usedByAgents',
              entity: 'skillBinding',
              entityId: skillId,
              previousValue: updatedUsedBy,
              currentValue: usedBy
            })

            await tx.skill.update({
              where: { id: skillId },
              data: {
                usedByAgents: JSON.stringify(updatedUsedBy)
              }
            })
          }
        }
      }

      // 处理灰度新加的技能绑定，从 usedByAgents 移除该 agentId 并标记 Skill 为 deprecated
      for (const curSkill of currentSkills) {
        const usedBy = parseJsonArray(curSkill.usedByAgents)
        if (usedBy.includes(agentId) && !snapshotSkillIds.includes(curSkill.id)) {
          const updatedUsedBy = usedBy.filter(id => id !== agentId)

          restoredFields.push({
            field: 'usedByAgents',
            entity: 'skillBinding',
            entityId: curSkill.id,
            previousValue: updatedUsedBy,
            currentValue: usedBy
          })

          await tx.skill.update({
            where: { id: curSkill.id },
            data: {
              usedByAgents: JSON.stringify(updatedUsedBy),
              status: 'deprecated'
            }
          })
        }
      }

      // 5d. 恢复 ConnectorBinding 列表
      const snapshotConnectorBindings = (snapshot.connectorBindings as Record<string, unknown>[]) || []
      const snapshotConnectorIds = snapshotConnectorBindings.map(b => b.connectorId as string)

      // 查询数据库下所有的 Connector 记录
      const currentConnectors = await tx.connector.findMany({
        where: { workspaceId }
      })

      // 恢复快照里已有的连接器绑定
      for (const connId of snapshotConnectorIds) {
        const curConn = currentConnectors.find(c => c.id === connId)
        if (curConn) {
          const usedBy = parseJsonArray(curConn.usedByAgents)
          if (!usedBy.includes(agentId)) {
            const updatedUsedBy = [...usedBy, agentId]

            restoredFields.push({
              field: 'usedByAgents',
              entity: 'connectorBinding',
              entityId: connId,
              previousValue: updatedUsedBy,
              currentValue: usedBy
            })

            await tx.connector.update({
              where: { id: connId },
              data: {
                usedByAgents: JSON.stringify(updatedUsedBy)
              }
            })
          }
        }
      }

      // 解绑灰度新加的连接器，并将其 deprecated
      for (const curConn of currentConnectors) {
        const usedBy = parseJsonArray(curConn.usedByAgents)
        if (usedBy.includes(agentId) && !snapshotConnectorIds.includes(curConn.id)) {
          const updatedUsedBy = usedBy.filter(id => id !== agentId)

          restoredFields.push({
            field: 'usedByAgents',
            entity: 'connectorBinding',
            entityId: curConn.id,
            previousValue: updatedUsedBy,
            currentValue: usedBy
          })

          await tx.connector.update({
            where: { id: curConn.id },
            data: {
              usedByAgents: JSON.stringify(updatedUsedBy),
              status: 'deprecated'
            }
          })
        }
      }

      // 6. 更新 HarnessCanary 状态为 rolled-back
      await tx.harnessCanary.update({
        where: { canaryId },
        data: {
          status: 'rolled-back',
          rolledBackAt: new Date(),
          rolledBackBy: triggeredBy,
          rollbackReason: reason
        }
      })
    })

    // 7. 调用 markSnapshotAsRestoredTo 标志快照已被使用
    const { markSnapshotAsRestoredTo } = await import("./harness-snapshot")
    await markSnapshotAsRestoredTo(snapshotId, triggeredBy)

    // 8. 更新 HarnessRollback.status = 'completed'，写入 restoredFields
    const completedRecord = await prisma.harnessRollback.update({
      where: { rollbackId },
      data: {
        status: 'completed',
        completedAt: new Date(),
        restoredFields: restoredFields as unknown as Prisma.InputJsonValue
      }
    })

    // 9. 写入 AuditLog 审计日志（使用 proposal.rollback 对齐 AGENTS.md §6.2）
    await activeDeps.writeAuditLog({
      actor: triggeredBy,
      action: 'proposal.rollback',
      targetType: 'canary',
      targetId: canaryId,
      detail: `Rollback completed for canary ${canaryId} (agent: ${agentId}, trigger: ${triggerType}, restored fields: ${restoredFields.length})`,
      riskLevel: 'high',
      workspaceId
    })

    // 10. 返回完整 HarnessRollback 对象
    return {
      rollbackId: completedRecord.rollbackId,
      workspaceId: completedRecord.workspaceId,
      canaryId: completedRecord.canaryId,
      proposalId: completedRecord.proposalId,
      agentId: completedRecord.agentId,
      snapshotId: completedRecord.snapshotId,
      reason: completedRecord.reason,
      triggerType: completedRecord.triggerType as RollbackTriggerType,
      status: completedRecord.status as RollbackStatus,
      restoredFields: completedRecord.restoredFields as unknown as RestoredFieldDiff[],
      startedAt: completedRecord.startedAt,
      completedAt: completedRecord.completedAt || undefined,
      triggeredBy: completedRecord.triggeredBy,
      errorMessage: completedRecord.errorMessage || undefined
    }

  } catch (error) {
    // 异常处理：标记 rollback 失败（增加防御性 try-catch 保护，防止二次数据库失败阻断主流程）
    const errorMessage = error instanceof Error ? error.message : String(error)
    
    try {
      await prisma.harnessRollback.update({
        where: { rollbackId },
        data: {
          status: 'failed',
          errorMessage
        }
      })
    } catch (dbError) {
      console.error("[executeRollback] Failed to mark rollback as failed in DB:", dbError)
    }

    try {
      await activeDeps.writeAuditLog({
        actor: triggeredBy,
        action: 'proposal.rollback',
        targetType: 'canary',
        targetId: canaryId,
        detail: `Rollback failed for canary ${canaryId}. Error: ${errorMessage}`,
        riskLevel: 'high',
        workspaceId
      })
    } catch (auditError) {
      console.error("[executeRollback] Failed to write failure audit log:", auditError)
    }

    throw error
  }
}

/**
 * 重试失败的回滚操作
 */
export async function retryFailedRollback(
  rollbackId: string,
  retriedBy: string,
  deps?: RollbackDeps
): Promise<HarnessRollback> {
  const record = await prisma.harnessRollback.findUnique({
    where: { rollbackId }
  })
  if (!record) {
    throw new RollbackNotFoundError(rollbackId)
  }

  // 幂等设计：若回滚已 completed，直接返回，不重复执行
  if (record.status === 'completed') {
    return {
      rollbackId: record.rollbackId,
      workspaceId: record.workspaceId,
      canaryId: record.canaryId,
      proposalId: record.proposalId,
      agentId: record.agentId,
      snapshotId: record.snapshotId,
      reason: record.reason,
      triggerType: record.triggerType as RollbackTriggerType,
      status: record.status as RollbackStatus,
      restoredFields: record.restoredFields as unknown as RestoredFieldDiff[],
      startedAt: record.startedAt,
      completedAt: record.completedAt || undefined,
      triggeredBy: record.triggeredBy,
      errorMessage: record.errorMessage || undefined
    }
  }

  // 若为 failed/pending 状态重新触发回滚
  return await executeRollback({
    canaryId: record.canaryId,
    workspaceId: record.workspaceId,
    reason: `Retry failed rollback: ${record.reason}`,
    triggerType: record.triggerType as RollbackTriggerType,
    triggeredBy: retriedBy
  }, deps)
}

/**
 * 读取单个 Rollback 详情
 */
export async function getRollback(
  rollbackId: string,
  workspaceId: string
): Promise<HarnessRollback | null> {
  const record = await prisma.harnessRollback.findFirst({
    where: { rollbackId, workspaceId }
  })
  if (!record) return null

  return {
    rollbackId: record.rollbackId,
    workspaceId: record.workspaceId,
    canaryId: record.canaryId,
    proposalId: record.proposalId,
    agentId: record.agentId,
    snapshotId: record.snapshotId,
    reason: record.reason,
    triggerType: record.triggerType as RollbackTriggerType,
    status: record.status as RollbackStatus,
    restoredFields: record.restoredFields as unknown as RestoredFieldDiff[],
    startedAt: record.startedAt,
    completedAt: record.completedAt || undefined,
    triggeredBy: record.triggeredBy,
    errorMessage: record.errorMessage || undefined
  }
}

/**
 * 列出指定 Agent 的回滚历史（分页）
 */
export async function listRollbacks(
  workspaceId: string,
  options?: {
    agentId?: string
    status?: RollbackStatus
    page?: number
    pageSize?: number
  }
): Promise<{ rollbacks: HarnessRollback[]; total: number }> {
  const page = options?.page ?? 1
  const pageSize = options?.pageSize ?? 10
  const skip = (page - 1) * pageSize

  const whereClause = {
    workspaceId,
    ...(options?.agentId ? { agentId: options.agentId } : {}),
    ...(options?.status ? { status: options.status } : {})
  }

  const [records, total] = await Promise.all([
    prisma.harnessRollback.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize
    }),
    prisma.harnessRollback.count({
      where: whereClause
    })
  ])

  const rollbacks = records.map(record => ({
    rollbackId: record.rollbackId,
    workspaceId: record.workspaceId,
    canaryId: record.canaryId,
    proposalId: record.proposalId,
    agentId: record.agentId,
    snapshotId: record.snapshotId,
    reason: record.reason,
    triggerType: record.triggerType as RollbackTriggerType,
    status: record.status as RollbackStatus,
    restoredFields: record.restoredFields as unknown as RestoredFieldDiff[],
    startedAt: record.startedAt,
    completedAt: record.completedAt || undefined,
    triggeredBy: record.triggeredBy,
    errorMessage: record.errorMessage || undefined
  }))

  return { rollbacks, total }
}

/**
 * 统一将回滚逻辑中抛出的业务异常映射为标准的 API Response
 */
export function formatRollbackError(error: unknown): Response {
  const message = error instanceof Error ? error.message : String(error)

  if (
    error instanceof CanaryNotFoundError ||
    error instanceof AgentNotFoundError ||
    error instanceof SnapshotMissingForRollbackError ||
    error instanceof RollbackNotFoundError
  ) {
    return Response.json({ success: false, error: message }, { status: 404 })
  }
  if (error instanceof RollbackAlreadyCompletedError) {
    return Response.json({ success: false, error: message }, { status: 409 })
  }
  if (error instanceof CanaryInvalidStateError || error instanceof RollbackInProgressError) {
    return Response.json({ success: false, error: message }, { status: 400 })
  }

  return Response.json(
    { success: false, error: message },
    { status: 500 }
  )
}
