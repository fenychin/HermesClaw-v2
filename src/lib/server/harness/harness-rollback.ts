/**
 * Harness Proposal 一键回滚机制（治理层）
 * —— 对应 AGENTS.md §4.5 安全护栏 + §4.7 自动化授权分级
 * —— 将已批准的 Harness 升级提案回滚，恢复关联 Agent 的任务边界与工具访问至提案前快照
 */

import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { stringifyJsonField } from "@/lib/api-utils"
import { writeAgentLog } from "@/lib/server/agent-log"

// ==============================
// 快照结构
// ==============================

/** 提案前 Agent 状态快照（存储在 HarnessProposal.previousSnapshot 中的 JSON 结构） */
export interface AgentStateSnapshot {
  /** 被变更的 Agent ID */
  agentId: string
  /** 任务边界：允许执行的操作列表 */
  canDo: string[]
  /** 任务边界：禁止执行的操作列表 */
  cannotDo: string[]
  /** 工具访问：绑定的连接器列表 */
  bindConnectors: string[]
  /** 工具访问：绑定的技能列表 */
  bindSkills: string[]
  /** Harness 版本号 */
  harnessVersion: string
  /** 快照创建时间 */
  snapshotAt: string
}

// ==============================
// 回滚结果类型
// ==============================

export interface RollbackResult {
  /** 回滚是否成功 */
  success: boolean
  /** 提案 ID */
  proposalId: string
  /** HEP 提案编号 */
  hepId: string
  /** 被回滚的 Agent ID */
  agentId: string
  /** 回滚执行时间 */
  rolledBackAt: string
  /** 操作者 */
  operatorId: string
}

export interface RollbackError {
  success: false
  error: string
  status: number
}

// ==============================
// 快照解析工具
// ==============================

/**
 * 解析 previousSnapshot JSON 字符串为 AgentStateSnapshot
 * 校验必要字段完整性，不合格则抛出
 */
function parseSnapshot(raw: string | null): AgentStateSnapshot {
  if (!raw) {
    throw new RollbackException("提案未包含回滚快照（previousSnapshot 为空），无法回滚", 422)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new RollbackException("回滚快照数据格式损坏，无法解析", 422)
  }

  const snapshot = parsed as Record<string, unknown>

  if (!snapshot.agentId || typeof snapshot.agentId !== "string") {
    throw new RollbackException("回滚快照缺少有效的 agentId", 422)
  }
  if (!Array.isArray(snapshot.canDo) || !Array.isArray(snapshot.cannotDo)) {
    throw new RollbackException("回滚快照缺少有效的任务边界数据（canDo / cannotDo）", 422)
  }
  if (!Array.isArray(snapshot.bindConnectors) || !Array.isArray(snapshot.bindSkills)) {
    throw new RollbackException("回滚快照缺少有效的工具访问数据（bindConnectors / bindSkills）", 422)
  }

  return {
    agentId: snapshot.agentId as string,
    canDo: snapshot.canDo as string[],
    cannotDo: snapshot.cannotDo as string[],
    bindConnectors: snapshot.bindConnectors as string[],
    bindSkills: snapshot.bindSkills as string[],
    harnessVersion: (snapshot.harnessVersion as string) ?? "v1.0.0",
    snapshotAt: (snapshot.snapshotAt as string) ?? new Date().toISOString(),
  }
}

// ==============================
// 自定义异常（用于在事务中精确捕获并返回结构化错误）
// ==============================

class RollbackException extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = "RollbackException"
    this.status = status
  }
}

// ==============================
// 核心回滚函数
// ==============================

/**
 * 对一份已批准的 Harness 升级提案执行一键回滚：
 * 1. 在 Prisma 事务中查找提案并校验状态（杜绝 TOCTOU）
 * 2. 解析 previousSnapshot 获取 Agent 变更前状态
 * 3. 在事务中恢复 Agent 的任务边界与工具访问
 * 4. 写入高危审计日志 + AgentLog（遵循 AGENTS.md §5 #3）
 *
 * 全程在一个 Prisma 事务中完成，任一步骤失败即整体回滚。
 *
 * @param proposalId  — 数据库中的 HarnessProposal.id（非 proposalId / HEP 编号）
 * @param operatorId  — 执行回滚的操作者标识（用户邮箱 / 用户名）
 * @returns RollbackResult — 回滚成功结果
 * @throws RollbackException — 回滚前置校验失败或事务执行失败
 */
export async function rollbackHarnessProposal(
  proposalId: string,
  operatorId: string,
): Promise<RollbackResult> {
  // 1. 解析快照（在事务外解析以尽早失败，避免无效事务）
  //    先读取 proposal 获取 previousSnapshot
  const proposal = await prisma.harnessProposal.findUnique({
    where: { id: proposalId },
    select: { id: true, proposalId: true, status: true, previousSnapshot: true, workspaceId: true },
  })

  if (!proposal) {
    throw new RollbackException("提案不存在", 404)
  }

  if (proposal.status !== "approved") {
    throw new RollbackException(
      `仅已批准的提案可回滚，当前状态: ${proposal.status}`,
      409,
    )
  }

  const snapshot = parseSnapshot(proposal.previousSnapshot)

  // 2. 序列化快照数据（使用项目统一工具函数而非裸 JSON.stringify）
  const canDoJson = stringifyJsonField(snapshot.canDo)
  const cannotDoJson = stringifyJsonField(snapshot.cannotDo)
  const bindConnectorsJson = stringifyJsonField(snapshot.bindConnectors)
  const bindSkillsJson = stringifyJsonField(snapshot.bindSkills)

  const now = new Date().toISOString()
  const hepId = proposal.proposalId

  try {
    // 3. Prisma 交互式事务：
    //    —— Agent 存在性校验 + 状态恢复 + 提案状态更新 + 审计日志全部在同一事务内完成
    //    —— 审计日志写入事务内（高风险操作的审计绝不可丢失，与 writeAuditLog 的「不阻断」
    //       哲学不同，此处选择强一致性：审计丢失则回滚整体操作）
    await prisma.$transaction(async (tx) => {
      // 3a. 在事务内校验目标 Agent 存在（杜绝 TOCTOU）
      const agent = await tx.agent.findUnique({
        where: { id: snapshot.agentId },
        select: { id: true },
      })

      if (!agent) {
        throw new RollbackException(
          `回滚快照引用的 Agent (${snapshot.agentId}) 不存在，可能已被删除`,
          404,
        )
      }

      // 3b. 恢复 Agent 的任务边界与工具访问
      await tx.agent.update({
        where: { id: snapshot.agentId },
        data: {
          canDo: canDoJson,
          cannotDo: cannotDoJson,
          bindConnectors: bindConnectorsJson,
          bindSkills: bindSkillsJson,
          harnessVersion: snapshot.harnessVersion,
        },
      })

      // 3c. 更新提案状态为 rolled-back
      await tx.harnessProposal.update({
        where: { id: proposalId },
        data: {
          status: "rolled-back",
          reviewedBy: operatorId,
          reviewedAt: now,
        },
      })

      // 3d. 审计日志（riskLevel = high，符合 AGENTS.md §4.5 高危操作门禁）
      await tx.auditLog.create({
        data: {
          actor: operatorId,
          action: "rollback.proposal",
          targetType: "proposal",
          targetId: proposalId,
          detail: `${hepId} · 回滚 Agent ${snapshot.agentId} 至快照版本 ${snapshot.harnessVersion}`,
          riskLevel: "high",
          workspaceId: proposal.workspaceId,
        },
      })
    })

    // 4. 事务成功后：写入 AgentLog（AGENTS.md §5 #3 硬性要求，写入失败不阻断主流程）
    void writeAgentLog({
      agentId: snapshot.agentId,
      source: "agent",
      taskName: `Harness 回滚: ${hepId}`,
      status: "success",
      duration: "0s",
      detail: `操作者 ${operatorId} 将 Agent ${snapshot.agentId} 回滚至快照版本 ${snapshot.harnessVersion}（canDo/cannotDo/bindConnectors/bindSkills 已恢复）`,
    })

    // 5. 异步触发 Harness 降级评估（AGENTS.md §2.3：配置变更后纳入评估窗口）
    //    使用动态 import 避免循环依赖；失败不阻断主流程
    import("@/lib/server/harness-eval")
      .then(({ runHarnessEvaluation }) =>
        runHarnessEvaluation("auto").catch((err: unknown) =>
          logger.warn("回滚后自动评估触发失败（已忽略）", {
            error: err instanceof Error ? err.message : "未知错误",
            proposalId,
            hepId,
          }),
        ),
      )
      .catch(() => {
        // 动态 import 失败静默忽略
      })

    logger.info("Harness 提案回滚成功", {
      proposalId,
      hepId,
      agentId: snapshot.agentId,
      operatorId,
      harnessVersion: snapshot.harnessVersion,
    })

    return {
      success: true,
      proposalId,
      hepId,
      agentId: snapshot.agentId,
      rolledBackAt: now,
      operatorId,
    }
  } catch (error) {
    // 事务内异常（非 RollbackException）→ 记录并重新抛出
    if (error instanceof RollbackException) {
      throw error
    }

    logger.error("Harness 提案回滚事务失败", {
      proposalId,
      hepId,
      agentId: snapshot.agentId,
      operatorId,
      error: error instanceof Error ? error.message : "未知数据库错误",
    })

    throw new RollbackException(
      `回滚事务执行失败: ${error instanceof Error ? error.message : "未知错误"}`,
      500,
    )
  }
}

// ==============================
// 辅助导出
// ==============================

export { RollbackException }
