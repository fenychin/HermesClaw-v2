/**
 * HarnessBundle 快照工具（CLAUDE.md §4.5 / §8.1）
 *
 * 提供两个对外操作：
 * - {@link createBundleSnapshot}：在关键操作（pre-canary / pre-activation / manual）
 *   前对 Bundle 7 件套 + 灰度配置做深度快照。
 * - {@link rollbackBundleToSnapshot}：将 Bundle 内容恢复到指定快照（或最近一条），
 *   状态转为 ROLLED_BACK，canaryPercent 归零。
 *
 * —— 审计写入由 Route Handler 用 createAuditEntry / updateAuditEntry 包裹，
 *    本工具不负责审计；与现有 src/app/api/harness/proposals/[id]/rollback/route.ts
 *    的边界一致：业务工具只抛领域异常，审计与 HTTP 映射交给 handler。
 */

import { prisma } from "@/lib/prisma"
import { Prisma } from "@/generated/prisma-v2/client"
import type {
  BundleSnapshotReason,
  HarnessBundleStatus,
} from "@hermesclaw/harness-schema"
import { validateTransition } from "./bundle-state-machine"

// ============================================================
// 异常类型
// ============================================================

/** 目标 bundle 没有任何快照可用——回滚被拒绝（HTTP 422）。 */
export class NoSnapshotAvailableError extends Error {
  readonly code = "NO_SNAPSHOT_AVAILABLE" as const
  constructor(bundleId: string) {
    super(`NO_SNAPSHOT_AVAILABLE: bundle ${bundleId} 无可用快照，无法回滚`)
    this.name = "NoSnapshotAvailableError"
  }
}

/** 指定的 snapshotId 不存在或不属于该 bundle（HTTP 404）。 */
export class SnapshotNotFoundError extends Error {
  readonly code = "SNAPSHOT_NOT_FOUND" as const
  constructor(snapshotId: string) {
    super(`SNAPSHOT_NOT_FOUND: ${snapshotId}`)
    this.name = "SnapshotNotFoundError"
  }
}

// ============================================================
// 快照载荷类型
// ============================================================

/**
 * 7 件套 + 灰度配置的深度快照。
 *
 * 字段命名与 Prisma model 完全一致，便于回滚时直接铺回 update payload。
 * 注意：这些 JSON 字段在持久层是 `JsonValue | null`，应用层使用前应通过
 * packages/harness-schema 中的 zod schema 验证。
 */
export interface BundleSnapshotContent {
  version: string
  agentPolicies: Prisma.JsonValue | null
  workflowTemplates: Prisma.JsonValue | null
  skillBindings: Prisma.JsonValue | null
  contextPolicy: Prisma.JsonValue | null
  memoryPolicy: Prisma.JsonValue | null
  connectorPolicies: Prisma.JsonValue | null
  guardrailPolicy: Prisma.JsonValue | null
  evalRuleSet: Prisma.JsonValue | null
  industryBinding: Prisma.JsonValue | null
  canaryPercent: number
  canaryStartedAt: string | null
  canaryEndsAt: string | null
}

/** Prisma 客户端或事务客户端（允许在外层事务内调用）。 */
type Db = typeof prisma | Prisma.TransactionClient

// ============================================================
// 内部工具
// ============================================================

/** 从 bundle 行抽取需要快照的字段（不含关系）。 */
function buildSnapshotContent(
  bundle: {
    version: string
    agentPolicies: Prisma.JsonValue | null
    workflowTemplates: Prisma.JsonValue | null
    skillBindings: Prisma.JsonValue | null
    contextPolicy: Prisma.JsonValue | null
    memoryPolicy: Prisma.JsonValue | null
    connectorPolicies: Prisma.JsonValue | null
    guardrailPolicy: Prisma.JsonValue | null
    evalRuleSet: Prisma.JsonValue | null
    industryBinding: Prisma.JsonValue | null
    canaryPercent: number
    canaryStartedAt: Date | null
    canaryEndsAt: Date | null
  },
): BundleSnapshotContent {
  return {
    version: bundle.version,
    agentPolicies: bundle.agentPolicies,
    workflowTemplates: bundle.workflowTemplates,
    skillBindings: bundle.skillBindings,
    contextPolicy: bundle.contextPolicy,
    memoryPolicy: bundle.memoryPolicy,
    connectorPolicies: bundle.connectorPolicies,
    guardrailPolicy: bundle.guardrailPolicy,
    evalRuleSet: bundle.evalRuleSet,
    industryBinding: bundle.industryBinding,
    canaryPercent: bundle.canaryPercent,
    canaryStartedAt: bundle.canaryStartedAt?.toISOString() ?? null,
    canaryEndsAt: bundle.canaryEndsAt?.toISOString() ?? null,
  }
}

// ============================================================
// 公共 API
// ============================================================

/**
 * 在 bundle 上创建一份深度快照，并将 bundle.currentSnapshotId 指向它。
 *
 * 若调用方传入 `tx`（事务客户端），全部写入将在该事务内进行；
 * 否则在内部用 `prisma.$transaction` 保证两步原子性。
 */
export async function createBundleSnapshot(
  bundleId: string,
  createdBy: string,
  reason: BundleSnapshotReason,
  tx?: Prisma.TransactionClient,
): Promise<{ snapshotId: string }> {
  const run = async (db: Db): Promise<{ snapshotId: string }> => {
    const bundle = await db.harnessBundle.findUnique({
      where: { bundleId },
    })
    if (!bundle) {
      throw new Error(`HARNESS_BUNDLE_NOT_FOUND: ${bundleId}`)
    }

    const content = buildSnapshotContent(bundle)

    const snapshot = await db.harnessBundleSnapshot.create({
      data: {
        bundleId,
        version: bundle.version,
        content: content as unknown as Prisma.InputJsonValue,
        reason,
        createdBy,
      },
    })

    await db.harnessBundle.update({
      where: { bundleId },
      data: { currentSnapshotId: snapshot.snapshotId },
    })

    return { snapshotId: snapshot.snapshotId }
  }

  if (tx) {
    return run(tx)
  }
  return prisma.$transaction(run)
}

/**
 * 将 bundle 回滚到指定快照（不传则回滚到该 bundle 最近一条）。
 *
 * 校验链：
 * 1. bundle 存在
 * 2. 目标快照存在且属于该 bundle（防止跨 bundle 误回滚）
 * 3. {@link validateTransition}(currentStatus → ROLLED_BACK) 合法
 *
 * 全过程在单事务中完成；任一步抛错事务整体回滚。
 *
 * 不会写入 AuditLog——审计由调用方（Route Handler）以预记录两段式承担。
 */
export async function rollbackBundleToSnapshot(
  bundleId: string,
  _operatorId: string,
  opts: { snapshotId?: string },
): Promise<{ snapshotId: string; restoredVersion: string }> {
  return prisma.$transaction(async (tx) => {
    const bundle = await tx.harnessBundle.findUnique({
      where: { bundleId },
    })
    if (!bundle) {
      throw new Error(`HARNESS_BUNDLE_NOT_FOUND: ${bundleId}`)
    }

    // 解析目标快照
    let snapshot
    if (opts.snapshotId) {
      snapshot = await tx.harnessBundleSnapshot.findUnique({
        where: { snapshotId: opts.snapshotId },
      })
      if (!snapshot) {
        throw new SnapshotNotFoundError(opts.snapshotId)
      }
      if (snapshot.bundleId !== bundleId) {
        // 防止跨 bundle 误用快照——视同未找到
        throw new SnapshotNotFoundError(opts.snapshotId)
      }
    } else {
      snapshot = await tx.harnessBundleSnapshot.findFirst({
        where: { bundleId },
        orderBy: { createdAt: "desc" },
      })
      if (!snapshot) {
        throw new NoSnapshotAvailableError(bundleId)
      }
    }

    // 状态机校验：当前状态必须能够走向 ROLLED_BACK
    validateTransition(bundle.status as HarnessBundleStatus, "ROLLED_BACK")

    // 还原 7 件套 + 灰度配置。
    // —— Prisma 7 的可空 JSON 字段：null 值需写为 Prisma.JsonNull，
    //    非空值用 InputJsonValue。这里统一通过 toJsonField 做转换。
    const content = snapshot.content as unknown as BundleSnapshotContent
    const toJsonField = (
      v: Prisma.JsonValue | null,
    ): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue =>
      v === null ? Prisma.JsonNull : (v as Prisma.InputJsonValue)

    await tx.harnessBundle.update({
      where: { bundleId },
      data: {
        status: "ROLLED_BACK",
        agentPolicies: toJsonField(content.agentPolicies),
        workflowTemplates: toJsonField(content.workflowTemplates),
        skillBindings: toJsonField(content.skillBindings),
        contextPolicy: toJsonField(content.contextPolicy),
        memoryPolicy: toJsonField(content.memoryPolicy),
        connectorPolicies: toJsonField(content.connectorPolicies),
        guardrailPolicy: toJsonField(content.guardrailPolicy),
        evalRuleSet: toJsonField(content.evalRuleSet),
        industryBinding: toJsonField(content.industryBinding),
        canaryPercent: 0,
        canaryStartedAt: null,
        canaryEndsAt: null,
      },
    })

    return {
      snapshotId: snapshot.snapshotId,
      restoredVersion: snapshot.version,
    }
  })
}
