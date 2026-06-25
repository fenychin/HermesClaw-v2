import { prisma } from "@/lib/prisma"
import crypto from "crypto"
import { writeAuditLog } from "@/lib/server/audit"
import type { Prisma } from "@/generated/prisma-v2/client"
import { logger } from "@/lib/logger"
import { DEFAULT_CANARY_THRESHOLDS } from "@hermesclaw/hermes-kernel"

// ==============================
// 顶层常量定义
//
// AGENTS.md §3.5 Canary 唯一阈值源约定：
//   所有阈值从 @hermesclaw/hermes-kernel 的 DEFAULT_CANARY_THRESHOLDS 统一派生，
//   严禁在 apps/ 层面私自硬编码任何数值。
// ==============================

/** 晋级成功率阈值 */
export const CANARY_PROMOTE_SUCCESS_RATE_THRESHOLD = DEFAULT_CANARY_THRESHOLDS.promotionSuccessRate
/** 晋级错误率阈值 */
export const CANARY_PROMOTE_ERROR_RATE_THRESHOLD = DEFAULT_CANARY_THRESHOLDS.promotionErrorRate
/** 自动回滚错误率红线 */
export const CANARY_ROLLBACK_ERROR_RATE_THRESHOLD = DEFAULT_CANARY_THRESHOLDS.abortErrorRate
/** 默认观察窗口 */
export const DEFAULT_OBSERVATION_WINDOW_MS = DEFAULT_CANARY_THRESHOLDS.observationWindowMs
/** 默认灰度流量百分比 */
export const DEFAULT_TRAFFIC_PERCENT = 10

// ==============================
// 错误类型定义
// ==============================

export class CanaryNotFoundError extends Error {
  constructor(canaryId: string) {
    super(`Canary not found: ${canaryId}`)
    this.name = 'CanaryNotFoundError'
  }
}

export class CanaryAlreadyExistsError extends Error {
  constructor(proposalId: string) {
    super(`Canary already exists for proposal: ${proposalId}`)
    this.name = 'CanaryAlreadyExistsError'
  }
}

export class CanaryInvalidStateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CanaryInvalidStateError'
  }
}

export class ProposalNotApprovedError extends Error {
  constructor(proposalId: string) {
    super(`HarnessProposal ${proposalId} is not approved yet`)
    this.name = 'ProposalNotApprovedError'
  }
}

// ==============================
// 核心类型定义
// ==============================

export type CanaryStatus =
  | 'running'
  | 'promoting'
  | 'promoted'
  | 'rolling-back'
  | 'rolled-back'
  | 'failed'

export interface HarnessCanary {
  canaryId: string
  workspaceId: string
  proposalId: string
  agentId: string
  snapshotId: string
  trafficPercent: number
  observationWindowMs: number
  startedAt: Date
  endsAt: Date
  status: CanaryStatus
  promotedAt?: Date
  promotedBy?: string
  rolledBackAt?: Date
  rolledBackBy?: string
  rollbackReason?: string
  observationMetrics?: Record<string, unknown>
}

export interface AuditInput {
  actor: string
  action: string
  targetType: string
  targetId: string
  detail?: string
  riskLevel?: 'low' | 'medium' | 'high'
  workspaceId: string
  contextSnapshot?: Record<string, unknown>
}

export interface CanaryMetrics {
  errorRate: number
  successRate: number
  avgLatencyMs: number
  humanCorrectionRate: number
  connectorSuccessRate: number
}

export interface CanaryDeps {
  writeAuditLog: (input: AuditInput) => Promise<void>
  triggerRollback?: (canaryId: string, reason: string) => Promise<void>
  getLatestMetrics?: (workspaceId: string, agentId: string) => Promise<CanaryMetrics>
}

const defaultDeps: CanaryDeps = {
  writeAuditLog: async (input) => {
    await writeAuditLog(input)
  }
}

// ==============================
// 核心函数实现
// ==============================

/**
 * 启动 Canary 灰度发布
 */
export async function startCanary(
  input: {
    proposalId: string
    workspaceId: string
    agentId: string
    snapshotId: string
    trafficPercent?: number
    observationWindowMs?: number
    startedBy?: string
  },
  deps?: CanaryDeps
): Promise<HarnessCanary> {
  const activeDeps = { ...defaultDeps, ...deps }
  const { proposalId, workspaceId, agentId, snapshotId } = input
  const trafficPercent = input.trafficPercent ?? DEFAULT_TRAFFIC_PERCENT
  const observationWindowMs = input.observationWindowMs ?? DEFAULT_OBSERVATION_WINDOW_MS
  const startedBy = input.startedBy || 'system'

  // 校验 trafficPercent 范围
  if (trafficPercent < 1 || trafficPercent > 100) {
    throw new RangeError(`trafficPercent must be between 1 and 100, got: ${trafficPercent}`)
  }

  // 1. 验证 proposal 存在且状态为 approved
  const proposal = await prisma.harnessProposal.findUnique({
    where: { id: proposalId }
  })
  if (!proposal) {
    throw new Error(`HarnessProposal not found: ${proposalId}`)
  }
  if (proposal.status !== 'approved') {
    throw new ProposalNotApprovedError(proposalId)
  }

  // 2. 检查同提案是否已存在 canary
  const existingCanary = await prisma.harnessCanary.findUnique({
    where: { proposalId }
  })
  if (existingCanary) {
    throw new CanaryAlreadyExistsError(proposalId)
  }

  // 3. 验证 snapshot 存在
  const snapshot = await prisma.harnessSnapshot.findUnique({
    where: { snapshotId }
  })
  if (!snapshot) {
    throw new Error(`Snapshot not found: ${snapshotId}`)
  }

  const canaryId = `hca-${crypto.randomUUID()}`
  const startedAt = new Date()
  const endsAt = new Date(startedAt.getTime() + observationWindowMs)

  // 4. 在同一个事务中创建 canary 并更新 proposal 状态
  const createdRecord = await prisma.$transaction(async (tx) => {
    const canary = await tx.harnessCanary.create({
      data: {
        canaryId,
        workspaceId,
        proposalId,
        agentId,
        snapshotId,
        trafficPercent,
        observationWindowMs,
        startedAt,
        endsAt,
        status: 'running'
      }
    })

    await tx.harnessProposal.update({
      where: { id: proposalId },
      data: { status: 'canary' }
    })

    return canary
  })

  // 5. 写入审计日志
  await activeDeps.writeAuditLog({
    actor: startedBy,
    action: 'canary.started',
    targetType: 'canary',
    targetId: canaryId,
    detail: `Canary started for proposal ${proposalId} (agent: ${agentId}, traffic: ${trafficPercent}%, endsAt: ${endsAt.toISOString()})`,
    riskLevel: 'low',
    workspaceId,
    contextSnapshot: { canaryId, snapshotId: createdRecord.snapshotId, trafficPercent }
  })

  return {
    canaryId: createdRecord.canaryId,
    workspaceId: createdRecord.workspaceId,
    proposalId: createdRecord.proposalId,
    agentId: createdRecord.agentId,
    snapshotId: createdRecord.snapshotId,
    trafficPercent: createdRecord.trafficPercent,
    observationWindowMs: createdRecord.observationWindowMs,
    startedAt: createdRecord.startedAt,
    endsAt: createdRecord.endsAt,
    status: createdRecord.status as CanaryStatus,
    promotedAt: createdRecord.promotedAt || undefined,
    promotedBy: createdRecord.promotedBy || undefined,
    rolledBackAt: createdRecord.rolledBackAt || undefined,
    rolledBackBy: createdRecord.rolledBackBy || undefined,
    rollbackReason: createdRecord.rollbackReason || undefined,
    observationMetrics: createdRecord.observationMetrics ? (createdRecord.observationMetrics as Record<string, unknown>) : undefined
  }
}

/**
 * 评估 Canary 的当前健康状况，决定是否晋级/回滚
 */
export async function evaluateCanaryHealth(
  workspaceId?: string,
  deps?: CanaryDeps
): Promise<{
  promoted: number
  rolledBack: number
  ambiguous: number
  earlyAborted: number
}> {
  const activeDeps = { ...defaultDeps, ...deps }
  const now = new Date()

  // 获取正在运行的所有 canary
  const runningCanaries = await prisma.harnessCanary.findMany({
    where: {
      status: 'running',
      ...(workspaceId ? { workspaceId } : {})
    }
  })

  let promoted = 0
  let rolledBack = 0
  let ambiguous = 0
  let earlyAborted = 0

  for (const canary of runningCanaries) {
    if (!activeDeps.getLatestMetrics) {
      logger.warn(`[evaluateCanaryHealth] getLatestMetrics is not configured, skipping canary evaluation: ${canary.canaryId}`, {
        service: 'canary',
        action: 'canary.health.skip',
        traceId: canary.canaryId,
        workspaceId: canary.workspaceId
      })
      continue
    }

    let metrics: CanaryMetrics
    try {
      metrics = await activeDeps.getLatestMetrics(canary.workspaceId, canary.agentId)
    } catch (err) {
      logger.error(`[evaluateCanaryHealth] Failed to load metrics for canary: ${canary.canaryId}`, {
        service: 'canary',
        action: 'canary.health.failed',
        traceId: canary.canaryId,
        workspaceId: canary.workspaceId,
        errorCode: 'METRICS_LOAD_FAILED',
        errorMessage: err instanceof Error ? err.message : String(err),
        errorStack: err instanceof Error ? err.stack : undefined
      })
      continue
    }

    const isWindowEnded = canary.endsAt <= now

    // A. 仍在观察窗口内，但 errorRate 恶化已超过回滚红线 (Early Abort 紧急中止)
    if (!isWindowEnded && metrics.errorRate > CANARY_ROLLBACK_ERROR_RATE_THRESHOLD) {
      await abortCanary(
        canary.canaryId,
        `Early abort triggered. Current errorRate ${metrics.errorRate.toFixed(3)} exceeded threshold ${CANARY_ROLLBACK_ERROR_RATE_THRESHOLD}`,
        'auto',
        metrics,
        activeDeps
      )
      earlyAborted++
      continue
    }

    // B. 观察窗口到期，进行常规决策
    if (isWindowEnded) {
      if (metrics.errorRate < CANARY_PROMOTE_ERROR_RATE_THRESHOLD && metrics.successRate > CANARY_PROMOTE_SUCCESS_RATE_THRESHOLD) {
        // 指标正常，自动晋级
        await promoteCanary(canary.canaryId, 'auto', metrics, activeDeps)
        promoted++
      } else if (metrics.errorRate > CANARY_ROLLBACK_ERROR_RATE_THRESHOLD) {
        // 指标恶化，自动回滚
        await abortCanary(
          canary.canaryId,
          `Canary observation window ended but errorRate ${metrics.errorRate.toFixed(3)} exceeded threshold ${CANARY_ROLLBACK_ERROR_RATE_THRESHOLD}`,
          'auto',
          metrics,
          activeDeps
        )
        rolledBack++
      } else {
        // 指标居中 (Ambiguous)，等待手动介入或下次评估
        await activeDeps.writeAuditLog({
          actor: 'system',
          action: 'canary.ambiguous',
          targetType: 'canary',
          targetId: canary.canaryId,
          detail: `Canary observation window ended but metrics are ambiguous. errorRate: ${metrics.errorRate.toFixed(3)}, successRate: ${metrics.successRate.toFixed(3)}. Manual intervention needed.`,
          riskLevel: 'medium',
          workspaceId: canary.workspaceId
        })
        ambiguous++
      }
    }
  }

  return { promoted, rolledBack, ambiguous, earlyAborted }
}

/**
 * 将 Canary 晋级为全量 active
 */
export async function promoteCanary(
  canaryId: string,
  promotedBy: string,
  observationMetrics?: CanaryMetrics,
  deps?: CanaryDeps
): Promise<HarnessCanary> {
  const activeDeps = { ...defaultDeps, ...deps }

  const canary = await prisma.harnessCanary.findUnique({
    where: { canaryId }
  })
  if (!canary) {
    throw new CanaryNotFoundError(canaryId)
  }

  // 状态转移强约束: 必须为 running 或者是正在 promoting
  if (canary.status !== 'running' && canary.status !== 'promoting') {
    throw new CanaryInvalidStateError(`Cannot promote canary from state: ${canary.status}`)
  }

  const updatedRecord = await prisma.$transaction(async (tx) => {
    const updated = await tx.harnessCanary.update({
      where: { canaryId },
      data: {
        status: 'promoted',
        promotedAt: new Date(),
        promotedBy,
        observationMetrics: observationMetrics as unknown as Prisma.InputJsonValue
      }
    })

    await tx.harnessProposal.update({
      where: { id: canary.proposalId },
      data: { status: 'active' }
    })

    return updated
  })

  await activeDeps.writeAuditLog({
    actor: promotedBy,
    action: 'canary.promoted',
    targetType: 'canary',
    targetId: canaryId,
    detail: `Canary ${canaryId} promoted to active by ${promotedBy}.`,
    riskLevel: 'low',
    workspaceId: updatedRecord.workspaceId
  })

  return {
    canaryId: updatedRecord.canaryId,
    workspaceId: updatedRecord.workspaceId,
    proposalId: updatedRecord.proposalId,
    agentId: updatedRecord.agentId,
    snapshotId: updatedRecord.snapshotId,
    trafficPercent: updatedRecord.trafficPercent,
    observationWindowMs: updatedRecord.observationWindowMs,
    startedAt: updatedRecord.startedAt,
    endsAt: updatedRecord.endsAt,
    status: updatedRecord.status as CanaryStatus,
    promotedAt: updatedRecord.promotedAt || undefined,
    promotedBy: updatedRecord.promotedBy || undefined,
    rolledBackAt: updatedRecord.rolledBackAt || undefined,
    rolledBackBy: updatedRecord.rolledBackBy || undefined,
    rollbackReason: updatedRecord.rollbackReason || undefined,
    observationMetrics: updatedRecord.observationMetrics ? (updatedRecord.observationMetrics as Record<string, unknown>) : undefined
  }
}

/**
 * 中止 Canary（触发回滚前的状态标记）
 */
export async function abortCanary(
  canaryId: string,
  reason: string,
  abortedBy: string,
  metricsOrDeps?: CanaryMetrics | CanaryDeps,
  deps?: CanaryDeps
): Promise<HarnessCanary> {
  let metrics: CanaryMetrics | undefined = undefined
  let activeDeps = defaultDeps
  if (metricsOrDeps) {
    if ('getLatestMetrics' in metricsOrDeps || 'writeAuditLog' in metricsOrDeps) {
      activeDeps = { ...defaultDeps, ...metricsOrDeps as CanaryDeps }
    } else {
      metrics = metricsOrDeps as CanaryMetrics
      if (deps) activeDeps = { ...defaultDeps, ...deps }
    }
  }

  const canary = await prisma.harnessCanary.findUnique({
    where: { canaryId }
  })
  if (!canary) {
    throw new CanaryNotFoundError(canaryId)
  }

  // 状态转移强约束: 必须为 running 或者是正在 rolling-back
  if (canary.status !== 'running' && canary.status !== 'rolling-back') {
    throw new CanaryInvalidStateError(`Cannot abort canary from state: ${canary.status}`)
  }

  const updatedRecord = await prisma.$transaction(async (tx) => {
    const updated = await tx.harnessCanary.update({
      where: { canaryId },
      data: {
        status: 'rolling-back',
        rolledBackAt: new Date(),
        rolledBackBy: abortedBy,
        rollbackReason: reason
      }
    })

    await tx.harnessProposal.update({
      where: { id: canary.proposalId },
      data: { status: 'rolled_back' }
    })

    return updated
  })

  await activeDeps.writeAuditLog({
    actor: abortedBy,
    action: 'canary.aborted',
    targetType: 'canary',
    targetId: canaryId,
    detail: `Canary ${canaryId} aborted by ${abortedBy}. Reason: ${reason}`,
    riskLevel: 'low',
    workspaceId: updatedRecord.workspaceId,
    contextSnapshot: { canaryId, reason, metrics }
  })

  // 触发回滚钩子 (P1-C)
  if (activeDeps.triggerRollback) {
    await activeDeps.triggerRollback(canaryId, reason)
  }

  return {
    canaryId: updatedRecord.canaryId,
    workspaceId: updatedRecord.workspaceId,
    proposalId: updatedRecord.proposalId,
    agentId: updatedRecord.agentId,
    snapshotId: updatedRecord.snapshotId,
    trafficPercent: updatedRecord.trafficPercent,
    observationWindowMs: updatedRecord.observationWindowMs,
    startedAt: updatedRecord.startedAt,
    endsAt: updatedRecord.endsAt,
    status: updatedRecord.status as CanaryStatus,
    promotedAt: updatedRecord.promotedAt || undefined,
    promotedBy: updatedRecord.promotedBy || undefined,
    rolledBackAt: updatedRecord.rolledBackAt || undefined,
    rolledBackBy: updatedRecord.rolledBackBy || undefined,
    rollbackReason: updatedRecord.rollbackReason || undefined,
    observationMetrics: updatedRecord.observationMetrics ? (updatedRecord.observationMetrics as Record<string, unknown>) : undefined
  }
}

/**
 * 读取单个 Canary 详情
 */
export async function getCanary(
  canaryId: string,
  workspaceId: string
): Promise<HarnessCanary | null> {
  const record = await prisma.harnessCanary.findFirst({
    where: { canaryId, workspaceId }
  })
  if (!record) return null

  return {
    canaryId: record.canaryId,
    workspaceId: record.workspaceId,
    proposalId: record.proposalId,
    agentId: record.agentId,
    snapshotId: record.snapshotId,
    trafficPercent: record.trafficPercent,
    observationWindowMs: record.observationWindowMs,
    startedAt: record.startedAt,
    endsAt: record.endsAt,
    status: record.status as CanaryStatus,
    promotedAt: record.promotedAt || undefined,
    promotedBy: record.promotedBy || undefined,
    rolledBackAt: record.rolledBackAt || undefined,
    rolledBackBy: record.rolledBackBy || undefined,
    rollbackReason: record.rollbackReason || undefined,
    observationMetrics: record.observationMetrics ? (record.observationMetrics as Record<string, unknown>) : undefined
  }
}
