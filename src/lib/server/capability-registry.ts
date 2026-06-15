import { prisma } from "@/lib/prisma"
import { writeAuditLog } from "@/lib/server/audit"
import type { Prisma, CapabilityVersion } from "@/generated/prisma-v2/client"
import type {
  CapabilityRegistration,
  CapabilityDescriptor,
  ResolvedCapability,
  CapabilityType,
  CapabilityStatus,
  HealthStatus
} from "./contracts"

// 健康度计算阈值（顶层常量，不得内联）
export const HEALTH_SUCCESS_RATE_HEALTHY = 0.95     // 成功率 >= 95% → healthy
export const HEALTH_SUCCESS_RATE_DEGRADED = 0.80    // 成功率 >= 80% → degraded
export const HEALTH_MAX_LATENCY_DEGRADED_MS = 3000  // 平均延迟 > 3s → degraded
export const HEALTH_MAX_LATENCY_UNHEALTHY_MS = 8000 // 平均延迟 > 8s → unhealthy
export const HEALTH_CHECK_WINDOW_MS = 24 * 60 * 60 * 1000  // 滚动 24h 统计窗口
export const CAPABILITY_REGISTRY_VERSION = '1.0'

// 错误类型
export class CapabilityNotFoundError extends Error {
  constructor(capabilityId: string, version?: string) {
    super(`Capability not found: ${capabilityId}${version ? `@${version}` : ''}`)
    this.name = 'CapabilityNotFoundError'
  }
}

export class CapabilityAlreadyRegisteredError extends Error {
  constructor(capabilityId: string, version: string) {
    super(`Capability already registered: ${capabilityId}@${version}`)
    this.name = 'CapabilityAlreadyRegisteredError'
  }
}

export class CapabilityYankedError extends Error {
  constructor(capabilityId: string, version: string) {
    super(`Capability ${capabilityId}@${version} has been yanked and cannot be used`)
    this.name = 'CapabilityYankedError'
  }
}

export class InvalidVersionError extends Error {
  constructor(version: string) {
    super(`Invalid semver version: ${version}`)
    this.name = 'InvalidVersionError'
  }
}

export interface RegistryDeps {
  prisma?: typeof prisma
  writeAuditLog?: typeof writeAuditLog
}

import { parseSemver, compareSemver } from "./utils/semver"
export { parseSemver, compareSemver }

/**
 * 注册一个新的能力版本
 */
export async function registerCapability(
  input: Omit<CapabilityRegistration, 'healthStatus' | 'successCount' | 'failureCount' | 'avgLatencyMs' | 'lastHealthCheckAt' | 'status'>,
  deps?: RegistryDeps
): Promise<CapabilityRegistration> {
  const activePrisma = deps?.prisma || prisma
  const activeWriteAuditLog = deps?.writeAuditLog || writeAuditLog

  // 1. 校验 version 为合法 semver 格式 (X.Y.Z)
  if (!parseSemver(input.version)) {
    throw new InvalidVersionError(input.version)
  }

  // 2. 检查 capabilityId + version 是否已存在
  const existing = await activePrisma.capabilityVersion.findFirst({
    where: {
      capabilityId: input.capabilityId,
      version: input.version
    }
  })
  if (existing) {
    throw new CapabilityAlreadyRegisteredError(input.capabilityId, input.version)
  }

  // 3. 若为该 capabilityId 的首个版本，检查 Skill/Connector/Workflow 表中是否存在对应 ID
  const anyVersion = await activePrisma.capabilityVersion.findFirst({
    where: { capabilityId: input.capabilityId }
  })

  if (!anyVersion) {
    let exists = false
    if (input.capabilityType === 'skill') {
      const dbSkill = await activePrisma.skill.findUnique({ where: { id: input.capabilityId } })
      if (dbSkill) exists = true
    } else if (input.capabilityType === 'connector') {
      const dbConn = await activePrisma.connector.findUnique({ where: { id: input.capabilityId } })
      if (dbConn) exists = true
    } else if (input.capabilityType === 'workflow') {
      const dbWorkflow = await activePrisma.workflow.findUnique({ where: { id: input.capabilityId } })
      if (dbWorkflow) exists = true
    }

    if (!exists) {
      throw new CapabilityNotFoundError(input.capabilityId)
    }
  }

  // 4. 写入 CapabilityVersion 记录（status='active'）
  const created = await activePrisma.capabilityVersion.create({
    data: {
      capabilityId: input.capabilityId,
      capabilityType: input.capabilityType as string,
      version: input.version,
      workspaceId: input.workspaceId,
      displayName: input.displayName || '',
      description: input.description || '',
      inputSchema: input.inputSchema as Prisma.InputJsonValue,
      outputSchema: input.outputSchema as Prisma.InputJsonValue,
      tags: JSON.stringify(input.tags),
      status: 'active',
      changelog: input.changelog || '',
      publishedAt: input.publishedAt || new Date(),
      publishedBy: input.publishedBy || 'system'
    }
  })

  // 5. 写入 AuditLog
  await activeWriteAuditLog({
    actor: input.publishedBy || 'system',
    action: 'capability.registered',
    targetType: 'capability',
    targetId: input.capabilityId,
    detail: `Registered capability ${input.capabilityId}@${input.version} (${input.capabilityType})`,
    riskLevel: 'low',
    workspaceId: input.workspaceId
  })

  // 6. 返回 CapabilityRegistration 对象
  return {
    capabilityId: created.capabilityId,
    capabilityType: created.capabilityType as CapabilityType,
    version: created.version,
    workspaceId: created.workspaceId,
    displayName: created.displayName,
    description: created.description,
    inputSchema: created.inputSchema as Record<string, unknown>,
    outputSchema: created.outputSchema as Record<string, unknown>,
    tags: JSON.parse(created.tags),
    status: created.status as CapabilityStatus,
    healthStatus: created.healthStatus as HealthStatus,
    successCount: created.successCount,
    failureCount: created.failureCount,
    avgLatencyMs: created.avgLatencyMs,
    lastHealthCheckAt: created.lastHealthCheckAt || undefined,
    changelog: created.changelog,
    publishedAt: created.publishedAt,
    publishedBy: created.publishedBy,
    deprecatedAt: created.deprecatedAt || undefined,
    deprecatedBy: created.deprecatedBy || undefined,
    deprecationReason: created.deprecationReason || undefined
  }
}

/**
 * 根据描述符解析能力，用于 Agent 调用前的能力发现
 */
export async function resolveCapability(
  descriptor: CapabilityDescriptor,
  deps?: RegistryDeps
): Promise<ResolvedCapability> {
  const activePrisma = deps?.prisma || prisma
  const activeWriteAuditLog = deps?.writeAuditLog || writeAuditLog

  let record: CapabilityVersion | null = null

  // 1. 若 descriptor.version 为空，解析为该 capabilityId 下 semver 最高的 status='active' 版本
  if (!descriptor.version) {
    const activeVersions = await activePrisma.capabilityVersion.findMany({
      where: {
        capabilityId: descriptor.capabilityId,
        workspaceId: descriptor.workspaceId,
        status: 'active'
      }
    })

    if (activeVersions.length === 0) {
      throw new CapabilityNotFoundError(descriptor.capabilityId)
    }

    // 按 semver 语义从高到低排序，取得最高的版本
    activeVersions.sort((a, b) => compareSemver(b.version, a.version))
    record = activeVersions[0]
  } else {
    // 2. 若指定 version，直接查询
    record = await activePrisma.capabilityVersion.findUnique({
      where: {
        capabilityId_version: {
          capabilityId: descriptor.capabilityId,
          version: descriptor.version
        }
      }
    })

    if (!record || record.workspaceId !== descriptor.workspaceId) {
      throw new CapabilityNotFoundError(descriptor.capabilityId, descriptor.version)
    }
  }

  // 3. 若 status='yanked'，抛出 CapabilityYankedError
  if (record.status === 'yanked') {
    throw new CapabilityYankedError(record.capabilityId, record.version)
  }

  // 4. 若 status='deprecated'，写入一条 WARNING 级别的 AuditLog 且不阻断调用
  if (record.status === 'deprecated') {
    await activeWriteAuditLog({
      actor: 'system',
      action: 'capability.warning',
      targetType: 'capability',
      targetId: record.capabilityId,
      detail: `WARNING: Calling deprecated capability ${record.capabilityId}@${record.version}`,
      riskLevel: 'low',
      workspaceId: record.workspaceId
    })
  }

  // 转换为注册对象
  const registration: CapabilityRegistration = {
    capabilityId: record.capabilityId,
    capabilityType: record.capabilityType as CapabilityType,
    version: record.version,
    workspaceId: record.workspaceId,
    displayName: record.displayName,
    description: record.description,
    inputSchema: record.inputSchema as Record<string, unknown>,
    outputSchema: record.outputSchema as Record<string, unknown>,
    tags: JSON.parse(record.tags),
    status: record.status as CapabilityStatus,
    healthStatus: record.healthStatus as HealthStatus,
    successCount: record.successCount,
    failureCount: record.failureCount,
    avgLatencyMs: record.avgLatencyMs,
    lastHealthCheckAt: record.lastHealthCheckAt || undefined,
    changelog: record.changelog,
    publishedAt: record.publishedAt,
    publishedBy: record.publishedBy,
    deprecatedAt: record.deprecatedAt || undefined,
    deprecatedBy: record.deprecatedBy || undefined,
    deprecationReason: record.deprecationReason || undefined
  }

  // 5. 返回 ResolvedCapability
  let endpoint: string | undefined = undefined
  let skillHandler: string | undefined = undefined

  if (registration.capabilityType === 'skill') {
    skillHandler = registration.capabilityId
  } else if (registration.capabilityType === 'connector') {
    const conn = await activePrisma.connector.findUnique({ where: { id: registration.capabilityId } })
    if (conn) {
      endpoint = ((conn as Record<string, unknown>).endpoint as string | undefined) || undefined
    }
  } else if (registration.capabilityType === 'workflow') {
    skillHandler = registration.capabilityId
  }

  return {
    registration,
    endpoint,
    skillHandler
  }
}

/**
 * 记录一次能力调用结果（遥测写入）
 */
export async function recordCapabilityUsage(
  input: {
    capabilityId: string
    capabilityType: CapabilityType
    version: string
    workspaceId: string
    agentId?: string
    taskId?: string
    status: 'success' | 'failure' | 'timeout'
    latencyMs: number
    errorCode?: string
  },
  deps?: RegistryDeps
): Promise<void> {
  const activePrisma = deps?.prisma || prisma
  try {
    await activePrisma.capabilityUsageLog.create({
      data: {
        capabilityId: input.capabilityId,
        capabilityType: input.capabilityType,
        version: input.version,
        workspaceId: input.workspaceId,
        agentId: input.agentId || null,
        taskId: input.taskId || null,
        status: input.status,
        latencyMs: input.latencyMs,
        errorCode: input.errorCode || null
      }
    })
  } catch (error) {
    console.error('[recordCapabilityUsage] Failed to record usage telemetry:', error)
  }
}

/**
 * 基于 CapabilityUsageLog 滚动统计，刷新能力健康度
 */
export async function refreshCapabilityHealth(
  workspaceId?: string,
  capabilityId?: string,
  deps?: RegistryDeps
): Promise<{ refreshed: number; degraded: number; unhealthy: number }> {
  const activePrisma = deps?.prisma || prisma
  const activeWriteAuditLog = deps?.writeAuditLog || writeAuditLog

  const whereClause: Prisma.CapabilityVersionWhereInput = { status: 'active' }
  if (workspaceId) whereClause.workspaceId = workspaceId
  if (capabilityId) whereClause.capabilityId = capabilityId

  const activeVersions = await activePrisma.capabilityVersion.findMany({
    where: whereClause
  })

  let refreshed = 0
  let degraded = 0
  let unhealthy = 0

  const startTime = new Date(Date.now() - HEALTH_CHECK_WINDOW_MS)

  for (const versionRecord of activeVersions) {
    const logs = await activePrisma.capabilityUsageLog.findMany({
      where: {
        capabilityId: versionRecord.capabilityId,
        version: versionRecord.version,
        calledAt: { gte: startTime }
      }
    })

    let successCount = 0
    let failureCount = 0
    let avgLatencyMs = 0
    let healthStatus: HealthStatus = 'unknown'

    if (logs.length > 0) {
      successCount = logs.filter(l => l.status === 'success').length
      failureCount = logs.filter(l => l.status === 'failure' || l.status === 'timeout').length
      avgLatencyMs = logs.reduce((acc, curr) => acc + curr.latencyMs, 0) / logs.length

      const successRate = successCount / logs.length

      if (successRate >= HEALTH_SUCCESS_RATE_HEALTHY && avgLatencyMs < HEALTH_MAX_LATENCY_DEGRADED_MS) {
        healthStatus = 'healthy'
      } else if (successRate >= HEALTH_SUCCESS_RATE_DEGRADED || avgLatencyMs < HEALTH_MAX_LATENCY_UNHEALTHY_MS) {
        healthStatus = 'degraded'
      } else {
        healthStatus = 'unhealthy'
      }
    }

    const oldStatus = versionRecord.healthStatus as HealthStatus

    await activePrisma.capabilityVersion.update({
      where: { id: versionRecord.id },
      data: {
        successCount,
        failureCount,
        avgLatencyMs,
        lastHealthCheckAt: new Date(),
        healthStatus
      }
    })

    refreshed++
    if (healthStatus === 'degraded') {
      degraded++
    } else if (healthStatus === 'unhealthy') {
      unhealthy++
    }

    // 若健康度从 healthy/unknown 变为 unhealthy，写入 AuditLog
    if ((oldStatus === 'healthy' || oldStatus === 'unknown') && healthStatus === 'unhealthy') {
      await activeWriteAuditLog({
        actor: 'system',
        action: 'capability.health.degraded',
        targetType: 'capability',
        targetId: versionRecord.capabilityId,
        detail: `Capability ${versionRecord.capabilityId}@${versionRecord.version} health degraded from ${oldStatus} to unhealthy (successRate: ${Math.round((successCount/logs.length)*100)}%, latency: ${Math.round(avgLatencyMs)}ms)`,
        riskLevel: 'medium',
        workspaceId: versionRecord.workspaceId
      })
    }
  }

  return {
    refreshed,
    degraded,
    unhealthy
  }
}

/**
 * 将某版本能力标记为 deprecated
 */
export async function deprecateCapability(
  capabilityId: string,
  version: string,
  reason: string,
  deprecatedBy: string,
  deps?: RegistryDeps
): Promise<CapabilityRegistration> {
  const activePrisma = deps?.prisma || prisma
  const activeWriteAuditLog = deps?.writeAuditLog || writeAuditLog

  const record = await activePrisma.capabilityVersion.findUnique({
    where: {
      capabilityId_version: {
        capabilityId,
        version
      }
    }
  })

  if (!record) {
    throw new CapabilityNotFoundError(capabilityId, version)
  }

  const updated = await activePrisma.capabilityVersion.update({
    where: { id: record.id },
    data: {
      status: 'deprecated',
      deprecatedAt: new Date(),
      deprecatedBy,
      deprecationReason: reason
    }
  })

  await activeWriteAuditLog({
    actor: deprecatedBy,
    action: 'capability.deprecated',
    targetType: 'capability',
    targetId: capabilityId,
    detail: `Deprecated capability ${capabilityId}@${version}. Reason: ${reason}`,
    riskLevel: 'medium',
    workspaceId: record.workspaceId
  })

  return {
    capabilityId: updated.capabilityId,
    capabilityType: updated.capabilityType as CapabilityType,
    version: updated.version,
    workspaceId: updated.workspaceId,
    displayName: updated.displayName,
    description: updated.description,
    inputSchema: updated.inputSchema as Record<string, unknown>,
    outputSchema: updated.outputSchema as Record<string, unknown>,
    tags: JSON.parse(updated.tags),
    status: updated.status as CapabilityStatus,
    healthStatus: updated.healthStatus as HealthStatus,
    successCount: updated.successCount,
    failureCount: updated.failureCount,
    avgLatencyMs: updated.avgLatencyMs,
    lastHealthCheckAt: updated.lastHealthCheckAt || undefined,
    changelog: updated.changelog,
    publishedAt: updated.publishedAt,
    publishedBy: updated.publishedBy,
    deprecatedAt: updated.deprecatedAt || undefined,
    deprecatedBy: updated.deprecatedBy || undefined,
    deprecationReason: updated.deprecationReason || undefined
  }
}

/**
 * 紧急下线（yanked）
 */
export async function yankCapability(
  capabilityId: string,
  version: string,
  reason: string,
  yankedBy: string,
  deps?: RegistryDeps
): Promise<CapabilityRegistration> {
  const activePrisma = deps?.prisma || prisma
  const activeWriteAuditLog = deps?.writeAuditLog || writeAuditLog

  const record = await activePrisma.capabilityVersion.findUnique({
    where: {
      capabilityId_version: {
        capabilityId,
        version
      }
    }
  })

  if (!record) {
    throw new CapabilityNotFoundError(capabilityId, version)
  }

  const updated = await activePrisma.capabilityVersion.update({
    where: { id: record.id },
    data: {
      status: 'yanked',
      deprecatedAt: new Date(),
      deprecatedBy: yankedBy,
      deprecationReason: reason
    }
  })

  await activeWriteAuditLog({
    actor: yankedBy,
    action: 'capability.yanked',
    targetType: 'capability',
    targetId: capabilityId,
    detail: `Emergency yanked capability ${capabilityId}@${version}. Reason: ${reason}`,
    riskLevel: 'high',
    workspaceId: record.workspaceId
  })

  return {
    capabilityId: updated.capabilityId,
    capabilityType: updated.capabilityType as CapabilityType,
    version: updated.version,
    workspaceId: updated.workspaceId,
    displayName: updated.displayName,
    description: updated.description,
    inputSchema: updated.inputSchema as Record<string, unknown>,
    outputSchema: updated.outputSchema as Record<string, unknown>,
    tags: JSON.parse(updated.tags),
    status: updated.status as CapabilityStatus,
    healthStatus: updated.healthStatus as HealthStatus,
    successCount: updated.successCount,
    failureCount: updated.failureCount,
    avgLatencyMs: updated.avgLatencyMs,
    lastHealthCheckAt: updated.lastHealthCheckAt || undefined,
    changelog: updated.changelog,
    publishedAt: updated.publishedAt,
    publishedBy: updated.publishedBy,
    deprecatedAt: updated.deprecatedAt || undefined,
    deprecatedBy: updated.deprecatedBy || undefined,
    deprecationReason: updated.deprecationReason || undefined
  }
}

/**
 * 列出 workspace 下的能力（分页 + 过滤）
 */
export async function listCapabilities(
  workspaceId: string,
  options?: {
    capabilityType?: CapabilityType
    status?: CapabilityStatus
    healthStatus?: HealthStatus
    tags?: string[]
    page?: number
    pageSize?: number
  },
  deps?: RegistryDeps
): Promise<{ capabilities: CapabilityRegistration[]; total: number }> {
  const activePrisma = deps?.prisma || prisma
  const page = options?.page || 1
  const pageSize = options?.pageSize || 10
  const skip = (page - 1) * pageSize

  const whereClause: Prisma.CapabilityVersionWhereInput = { workspaceId }
  if (options?.capabilityType) {
    whereClause.capabilityType = options.capabilityType
  }
  if (options?.status) {
    whereClause.status = options.status
  }
  if (options?.healthStatus) {
    whereClause.healthStatus = options.healthStatus
  }

  // 标签过滤：任意一个 tag 匹配即返回。tags 存储为 JSON 字符串
  if (options?.tags && options.tags.length > 0) {
    whereClause.OR = options.tags.map(tag => ({
      tags: { contains: tag }
    }))
  }

  const [records, total] = await Promise.all([
    activePrisma.capabilityVersion.findMany({
      where: whereClause,
      orderBy: { version: 'desc' }, // 或者 createdAt
      skip,
      take: pageSize
    }),
    activePrisma.capabilityVersion.count({
      where: whereClause
    })
  ])

  const capabilities = records.map(record => ({
    capabilityId: record.capabilityId,
    capabilityType: record.capabilityType as CapabilityType,
    version: record.version,
    workspaceId: record.workspaceId,
    displayName: record.displayName,
    description: record.description,
    inputSchema: record.inputSchema as Record<string, unknown>,
    outputSchema: record.outputSchema as Record<string, unknown>,
    tags: JSON.parse(record.tags),
    status: record.status as CapabilityStatus,
    healthStatus: record.healthStatus as HealthStatus,
    successCount: record.successCount,
    failureCount: record.failureCount,
    avgLatencyMs: record.avgLatencyMs,
    lastHealthCheckAt: record.lastHealthCheckAt || undefined,
    changelog: record.changelog,
    publishedAt: record.publishedAt,
    publishedBy: record.publishedBy,
    deprecatedAt: record.deprecatedAt || undefined,
    deprecatedBy: record.deprecatedBy || undefined,
    deprecationReason: record.deprecationReason || undefined
  }))

  return {
    capabilities,
    total
  }
}
