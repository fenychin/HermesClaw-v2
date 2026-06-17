import { prisma } from "@/lib/prisma"
import crypto from "crypto"
import { writeAuditLog } from "@/lib/server/audit"
import type { Prisma } from "@/generated/prisma-v2/client"
import { resolveCapability } from "./capability-registry"

// ==============================
// 错误类型定义
// ==============================

export class SnapshotNotFoundError extends Error {
  constructor(identifier: string) {
    super(`No active HarnessSnapshot found for: ${identifier}`)
    this.name = 'SnapshotNotFoundError'
  }
}

export class AgentNotFoundError extends Error {
  constructor(agentId: string) {
    super(`Agent not found: ${agentId}`)
    this.name = 'AgentNotFoundError'
  }
}

// ==============================
// 核心类型定义
// ==============================

export type SnapshotType = 'pre-canary' | 'pre-active' | 'manual' | 'scheduled'
export type SnapshotStatus = 'active' | 'superseded' | 'rolled-back-to'

export interface HarnessSnapshot {
  snapshotId: string
  workspaceId: string
  agentId: string
  proposalId?: string
  snapshotType: SnapshotType
  agentConfig: Record<string, unknown>
  workflowTemplates: Record<string, unknown>[]
  skillBindings: Record<string, unknown>[]
  connectorBindings: Record<string, unknown>[]
  memoryPolicy?: Record<string, unknown>
  policySnapshotVersion: string
  status: SnapshotStatus
  createdAt: Date
  createdBy: string
  restoredAt?: Date
  restoredBy?: string
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

export interface SnapshotDeps {
  writeAuditLog: (input: AuditInput) => Promise<void>
}

const defaultDeps: SnapshotDeps = {
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
 * 捕获指定 Agent 的当前 Harness 运行时状态并持久化为快照。
 * 
 * 1. 从数据库读取 Agent 的完整配置
 * 2. 读取关联 of WorkflowTemplate 列表
 * 3. 读取关联 of Skill 绑定列表
 * 4. 读取关联 of Connector 绑定列表
 * 5. 读取 Agent 的 memoryPolicy
 * 6. 将旧 active 快照更新为 superseded，并在同一事务中创建新快照
 * 7. 写入 AuditLog 审计日志
 */
export async function captureSnapshot(
  input: {
    workspaceId: string
    agentId: string
    proposalId?: string
    snapshotType?: SnapshotType
    createdBy?: string
    policySnapshotVersion?: string
  },
  deps?: SnapshotDeps
): Promise<HarnessSnapshot> {
  const activeDeps = { ...defaultDeps, ...deps }
  const { workspaceId, agentId } = input

  // 1. 读取 Agent 完整配置
  const agent = await prisma.agent.findUnique({
    where: { id: agentId }
  })
  if (!agent) {
    throw new AgentNotFoundError(agentId)
  }
  if (agent.workspaceId !== workspaceId) {
    throw new AgentNotFoundError(`Agent ${agentId} does not belong to workspace ${workspaceId}`)
  }

  // 构造 Agent 配置的序列化快照
  const agentConfig: Record<string, unknown> = {
    id: agent.id,
    name: agent.name,
    role: agent.role,
    description: agent.description,
    status: agent.status,
    source: agent.source,
    category: parseJsonArray(agent.category),
    bindSkills: parseJsonArray(agent.bindSkills),
    bindConnectors: parseJsonArray(agent.bindConnectors),
    memoryPermission: agent.memoryPermission,
    harnessVersion: agent.harnessVersion,
    automationLevel: agent.automationLevel,
    canDo: parseJsonArray(agent.canDo),
    cannotDo: parseJsonArray(agent.cannotDo),
    statsJson: agent.statsJson ? JSON.parse(agent.statsJson) : {}
  }

  // 2. 读取关联的 WorkflowTemplate 列表
  const dbWorkflows = await prisma.workflow.findMany({
    where: { workspaceId }
  })
  const agentSkills = parseJsonArray(agent.bindSkills)
  const associatedWorkflows = dbWorkflows.filter(wf => {
    if (agent.industryId && wf.industryId === agent.industryId) {
      return true
    }
    try {
      const nodes = JSON.parse(wf.nodes)
      if (Array.isArray(nodes)) {
        return (nodes as Array<{ config?: { agentId?: string; skillId?: string } }>).some((node) => {
          if (node.config?.agentId === agentId) return true
          if (node.config?.skillId && agentSkills.includes(node.config.skillId)) return true
          return false
        })
      }
    } catch {
      // ignore
    }
    return false
  })

  const workflowTemplates = associatedWorkflows.map(wf => ({
    templateId: wf.id,
    name: wf.name,
    description: wf.description ?? "",
    nodes: parseJsonArray(wf.nodes),
    edges: parseJsonArray(wf.edges),
    version: "1.0.0"
  }))

  // 3. 读取关联的 Skill 绑定列表
  let skillBindings: Record<string, unknown>[] = []
  if (agentSkills.length > 0) {
    const skills = await prisma.skill.findMany({
      where: {
        id: { in: agentSkills },
        workspaceId
      }
    })
    skillBindings = await Promise.all(
      skills.map(async (skill) => {
        let registeredVersion = skill.version || '1.0.0'
        try {
          const resolved = await resolveCapability({
            capabilityId: skill.id,
            capabilityType: 'skill',
            workspaceId
          })
          registeredVersion = resolved.registration.version
        } catch {
          // Registry 无记录时降级到 skill.version
        }
        return {
          bindingId: `sb-${agentId}-${skill.id}`,
          skillId: skill.id,
          targetType: 'agent',
          targetId: agentId,
          overrides: {},
          version: registeredVersion
        }
      })
    )
  }

  // 4. 读取关联的 Connector 绑定列表
  const agentConnectors = parseJsonArray(agent.bindConnectors)
  let connectorBindings: Record<string, unknown>[] = []
  if (agentConnectors.length > 0) {
    const connectors = await prisma.connector.findMany({
      where: {
        id: { in: agentConnectors },
        workspaceId
      }
    })
    connectorBindings = await Promise.all(
      connectors.map(async (conn) => {
        let registeredVersion = '1.0.0'
        try {
          const resolved = await resolveCapability({
            capabilityId: conn.id,
            capabilityType: 'connector',
            workspaceId
          })
          registeredVersion = resolved.registration.version
        } catch {
          // Registry 无记录时降级
        }
        return {
          policyId: `cp-${agentId}-${conn.id}`,
          connectorId: conn.id,
          allowedScopes: parseJsonArray(conn.permissions),
          riskLevel: 'medium',
          requiresApproval: false,
          version: registeredVersion
        }
      })
    )
  }

  // 5. 构造默认 Memory 策略 (Agent 本身没有直接对应的字段，赋予 Zod 默认策略)
  const defaultMemoryPolicy = {
    policyId: `mp-${agentId}`,
    shortTermTtl: 3600,
    midTermTtl: 86400,
    longTermRetention: 'forever',
    retrievalStrategy: 'hybrid',
    version: '1.0.0'
  }

  const snapshotId = `hss-${crypto.randomUUID()}`
  const createdBy = input.createdBy || 'system'
  const policySnapshotVersion = input.policySnapshotVersion || agent.harnessVersion || 'v1.0.0'
  const snapshotType = input.snapshotType || 'pre-canary'

  // 6. Prisma 事务，确保原子性
  const createdDbRecord = await prisma.$transaction(async (tx) => {
    // 标记旧快照为 superseded
    await tx.harnessSnapshot.updateMany({
      where: {
        workspaceId,
        agentId,
        status: 'active'
      },
      data: {
        status: 'superseded'
      }
    })

    // 创建新快照
    return await tx.harnessSnapshot.create({
      data: {
        snapshotId,
        workspaceId,
        agentId,
        proposalId: input.proposalId || null,
        snapshotType,
        agentConfig: agentConfig as Prisma.InputJsonValue,
        workflowTemplates: workflowTemplates as Prisma.InputJsonValue,
        skillBindings: skillBindings as Prisma.InputJsonValue,
        connectorBindings: connectorBindings as Prisma.InputJsonValue,
        memoryPolicy: defaultMemoryPolicy as Prisma.InputJsonValue,
        policySnapshotVersion,
        status: 'active',
        createdBy
      }
    })
  })

  // 7. 写入 AuditLog 审计日志
  await activeDeps.writeAuditLog({
    actor: createdBy,
    action: "harness.snapshot.created",
    targetType: "agent",
    targetId: agentId,
    detail: `Harness snapshot created: ${snapshotId} (type: ${snapshotType}, version: ${policySnapshotVersion})`,
    riskLevel: "low",
    workspaceId
  })

  // 8. 返回规范的 HarnessSnapshot 对象
  return {
    snapshotId: createdDbRecord.snapshotId,
    workspaceId: createdDbRecord.workspaceId,
    agentId: createdDbRecord.agentId,
    proposalId: createdDbRecord.proposalId || undefined,
    snapshotType: createdDbRecord.snapshotType as SnapshotType,
    agentConfig: createdDbRecord.agentConfig as Record<string, unknown>,
    workflowTemplates: createdDbRecord.workflowTemplates as Record<string, unknown>[],
    skillBindings: createdDbRecord.skillBindings as Record<string, unknown>[],
    connectorBindings: createdDbRecord.connectorBindings as Record<string, unknown>[],
    memoryPolicy: createdDbRecord.memoryPolicy ? (createdDbRecord.memoryPolicy as Record<string, unknown>) : undefined,
    policySnapshotVersion: createdDbRecord.policySnapshotVersion,
    status: createdDbRecord.status as SnapshotStatus,
    createdAt: createdDbRecord.createdAt,
    createdBy: createdDbRecord.createdBy,
    restoredAt: createdDbRecord.restoredAt || undefined,
    restoredBy: createdDbRecord.restoredBy || undefined
  }
}

/**
 * 获取指定 Agent 的最新 active 快照
 */
export async function getLatestSnapshot(
  workspaceId: string,
  agentId: string
): Promise<HarnessSnapshot | null> {
  const record = await prisma.harnessSnapshot.findFirst({
    where: {
      workspaceId,
      agentId,
      status: 'active'
    }
  })
  if (!record) return null

  return {
    snapshotId: record.snapshotId,
    workspaceId: record.workspaceId,
    agentId: record.agentId,
    proposalId: record.proposalId || undefined,
    snapshotType: record.snapshotType as SnapshotType,
    agentConfig: record.agentConfig as Record<string, unknown>,
    workflowTemplates: record.workflowTemplates as Record<string, unknown>[],
    skillBindings: record.skillBindings as Record<string, unknown>[],
    connectorBindings: record.connectorBindings as Record<string, unknown>[],
    memoryPolicy: record.memoryPolicy ? (record.memoryPolicy as Record<string, unknown>) : undefined,
    policySnapshotVersion: record.policySnapshotVersion,
    status: record.status as SnapshotStatus,
    createdAt: record.createdAt,
    createdBy: record.createdBy,
    restoredAt: record.restoredAt || undefined,
    restoredBy: record.restoredBy || undefined
  }
}

/**
 * 列出指定 Agent 的快照历史（分页）
 */
export async function listSnapshots(
  workspaceId: string,
  agentId: string,
  options?: {
    status?: SnapshotStatus
    page?: number
    pageSize?: number
  }
): Promise<{ snapshots: HarnessSnapshot[]; total: number }> {
  const page = options?.page ?? 1
  const pageSize = options?.pageSize ?? 10
  const skip = (page - 1) * pageSize

  const whereClause = {
    workspaceId,
    agentId,
    ...(options?.status ? { status: options.status } : {})
  }

  const [records, total] = await Promise.all([
    prisma.harnessSnapshot.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize
    }),
    prisma.harnessSnapshot.count({
      where: whereClause
    })
  ])

  const snapshots = records.map(record => ({
    snapshotId: record.snapshotId,
    workspaceId: record.workspaceId,
    agentId: record.agentId,
    proposalId: record.proposalId || undefined,
    snapshotType: record.snapshotType as SnapshotType,
    agentConfig: record.agentConfig as Record<string, unknown>,
    workflowTemplates: record.workflowTemplates as Record<string, unknown>[],
    skillBindings: record.skillBindings as Record<string, unknown>[],
    connectorBindings: record.connectorBindings as Record<string, unknown>[],
    memoryPolicy: record.memoryPolicy ? (record.memoryPolicy as Record<string, unknown>) : undefined,
    policySnapshotVersion: record.policySnapshotVersion,
    status: record.status as SnapshotStatus,
    createdAt: record.createdAt,
    createdBy: record.createdBy,
    restoredAt: record.restoredAt || undefined,
    restoredBy: record.restoredBy || undefined
  }))

  return { snapshots, total }
}

/**
 * 将快照标记为"已被用于回滚"
 */
export async function markSnapshotAsRestoredTo(
  snapshotId: string,
  restoredBy: string,
  deps?: SnapshotDeps
): Promise<HarnessSnapshot> {
  const activeDeps = { ...defaultDeps, ...deps }

  const record = await prisma.harnessSnapshot.findUnique({
    where: { snapshotId }
  })
  if (!record) {
    throw new SnapshotNotFoundError(snapshotId)
  }

  const updatedRecord = await prisma.harnessSnapshot.update({
    where: { snapshotId },
    data: {
      status: 'rolled-back-to',
      restoredAt: new Date(),
      restoredBy
    }
  })

  await activeDeps.writeAuditLog({
    actor: restoredBy,
    action: 'harness.snapshot.restored',
    targetType: 'agent',
    targetId: updatedRecord.agentId,
    detail: `Harness snapshot restored: ${snapshotId} for agent ${updatedRecord.agentId} by ${restoredBy}`,
    riskLevel: 'low',
    workspaceId: updatedRecord.workspaceId
  })

  return {
    snapshotId: updatedRecord.snapshotId,
    workspaceId: updatedRecord.workspaceId,
    agentId: updatedRecord.agentId,
    proposalId: updatedRecord.proposalId || undefined,
    snapshotType: updatedRecord.snapshotType as SnapshotType,
    agentConfig: updatedRecord.agentConfig as Record<string, unknown>,
    workflowTemplates: updatedRecord.workflowTemplates as Record<string, unknown>[],
    skillBindings: updatedRecord.skillBindings as Record<string, unknown>[],
    connectorBindings: updatedRecord.connectorBindings as Record<string, unknown>[],
    memoryPolicy: updatedRecord.memoryPolicy ? (updatedRecord.memoryPolicy as Record<string, unknown>) : undefined,
    policySnapshotVersion: updatedRecord.policySnapshotVersion,
    status: updatedRecord.status as SnapshotStatus,
    createdAt: updatedRecord.createdAt,
    createdBy: updatedRecord.createdBy,
    restoredAt: updatedRecord.restoredAt || undefined,
    restoredBy: updatedRecord.restoredBy || undefined
  }
}
