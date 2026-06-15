/**
 * 审计日志写入工具（AGENTS.md 第四章 4.3 / 第五章：关键操作须可溯源）
 *
 * —— 记录审批、删除、连接器授权、智能体边界变更等高危 / 治理动作，
 *    供 /settings 审计页与合规溯源使用。
 *
 * —— AGENTS.md §1.2 数据主权：所有决策须留下可溯源上下文快照
 * —— AGENTS.md §4.4 Level 2 评估：依赖 contextSnapshot 回溯执行上下文
 * —— AGENTS.md §5 #3 禁止静默执行：每条审计记录必须在动作执行前写入（预记录），执行后更新状态
 *
 * ⚠️ 仅在服务端调用；写审计失败不得阻断主流程，故全程 try/catch 静默吞错。
 * 配套 actorFromSession() 从登录会话解析操作者标识。
 */
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@/generated/prisma-v2/client"
import { auth } from "@/lib/auth"

// ==============================
// 类型定义
// ==============================

export type AuditRiskLevel = "low" | "medium" | "high"

/** 自动化授权等级（AGENTS.md §4.7） */
export type AutomationLevel = "L1" | "L2" | "L3" | "L4"

/** 触发来源 */
export type TriggeredBy = "user" | "system" | "cron"

/** 审计条目状态（预记录模式） */
export type AuditStatus = "pending" | "success" | "failed"

// ==============================
// 旧版兼容类型（保留 writeAuditLog 向后兼容）
// ==============================

export interface WriteAuditLogInput {
  /** 操作者：用户邮箱 / 名，或 "system" */
  actor: string
  /** 动作标识，如 approve.proposal | delete.agent | connector.connect */
  action: string
  /** 目标类型，如 agent | connector | memory | project | proposal */
  targetType: string
  targetId: string
  detail?: string
  riskLevel?: AuditRiskLevel
  /** 工作空间 ID（多租户隔离） */
  workspaceId: string
}

// ==============================
// 新版 unified 输入类型
// ==============================

/** createAuditEntry() 统一输入类型 */
export interface CreateAuditEntryInput {
  actor: string
  action: string
  targetType: string
  targetId: string
  detail?: string
  riskLevel?: AuditRiskLevel
  workspaceId: string
  /** AGENTS.md §1.2 数据主权：执行时的关键上下文快照（供 §4.4 Level 2 评估） */
  contextSnapshot?: Record<string, unknown>
  /** AGENTS.md §4.7 自动化授权等级 */
  automationLevel?: AutomationLevel
  /** 触发来源 */
  triggeredBy?: TriggeredBy
}

/** createAuditEntry() 返回值 */
export interface CreateAuditEntryResult {
  /** 审计记录 ID（用于执行后 updateAuditEntry 更新状态） */
  auditId: string
  /** 是否写入成功（预记录写入失败时 return null，但仍返回假 ID 避免调用方判空崩溃） */
  ok: boolean
}

/** updateAuditEntry() 输入类型 */
export interface UpdateAuditEntryInput {
  auditId: string
  status: AuditStatus
  /** 可选：执行后补充 detail（如错误信息） */
  detail?: string
  /** 可选：执行后补充/更新 contextSnapshot */
  contextSnapshot?: Record<string, unknown>
}

// ==============================
// actor 解析
// ==============================

/**
 * 从当前登录会话解析操作者标识；未登录时回退 "system"。
 * 供 Route Handler 在写审计前取 actor。
 */
export async function actorFromSession(): Promise<string> {
  try {
    const session = await auth()
    return session?.user?.email ?? session?.user?.name ?? "system"
  } catch {
    return "system"
  }
}

// ==============================
// 旧版 writeAuditLog（保留向后兼容，内部委托给 createAuditEntry）
// ==============================

/**
 * 写入一条审计日志（旧接口，保留向后兼容）。
 * 新代码请使用 createAuditEntry() + updateAuditEntry() 预记录模式。
 * 失败仅打印告警，不抛出。
 */
export async function writeAuditLog(input: WriteAuditLogInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actor: input.actor,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        detail: input.detail ?? null,
        riskLevel: input.riskLevel ?? null,
        workspaceId: input.workspaceId,
        status: "success", // 旧接口无预记录概念，直接标记 success
      },
    })
  } catch (error) {
    // 不阻断主流程，但治理数据丢失须醒目上报（AGENTS.md 4.3 可溯源），
    // 故升级为 error 级别；切勿降级为静默 warn。
    console.error(
      "[writeAuditLog] 审计日志写入失败，治理留痕已丢失，须排查：",
      { action: input.action, targetType: input.targetType, targetId: input.targetId },
      error,
    )
  }
}

// ==============================
// 新版 createAuditEntry（统一预记录入口）
// ==============================

/**
 * 创建一条预记录审计条目（status = "pending"）。
 *
 * —— AGENTS.md §5 #3 禁止静默执行：高风险动作必须在执行前写入预记录，
 *    执行后通过 updateAuditEntry() 更新状态为 success / failed。
 *
 * @returns { auditId, ok } — auditId 用于后续 updateAuditEntry() 调用；
 *          ok=false 表示预记录写入失败（治理留痕丢失，须立即补救）。
 *
 * @example
 *   // 预记录
 *   const entry = await createAuditEntry({
 *     actor: "admin@example.com",
 *     action: "proposal.approve",
 *     targetType: "proposal",
 *     targetId: "prop-001",
 *     riskLevel: "high",
 *     workspaceId: "ws-1",
 *     automationLevel: "L3",
 *     triggeredBy: "user",
 *     contextSnapshot: { previousStatus: "pending", riskLevel: "high", ... },
 *   })
 *
 *   // 执行高风险动作...
 *
 *   // 更新状态
 *   await updateAuditEntry({
 *     auditId: entry.auditId,
 *     status: "success",
 *     detail: "批准成功，Agent 边界已更新",
 *   })
 */
export async function createAuditEntry(
  input: CreateAuditEntryInput,
): Promise<CreateAuditEntryResult> {
  try {
    const record = await prisma.auditLog.create({
      data: {
        actor: input.actor,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        detail: input.detail ?? null,
        riskLevel: input.riskLevel ?? null,
        workspaceId: input.workspaceId,
        contextSnapshot: (input.contextSnapshot ?? undefined) as Prisma.InputJsonValue,
        automationLevel: input.automationLevel ?? null,
        triggeredBy: input.triggeredBy ?? "user",
        status: "pending",
      },
    })
    return { auditId: record.id, ok: true }
  } catch (error) {
    console.error(
      "[createAuditEntry] 审计预记录写入失败，治理留痕已丢失，须立即排查：",
      { action: input.action, targetType: input.targetType, targetId: input.targetId },
      error,
    )
    // 返回假 ID 避免调用方空引用崩溃；ok=false 标记失败
    return { auditId: `lost-${Date.now()}`, ok: false }
  }
}

// ==============================
// updateAuditEntry（执行后更新状态）
// ==============================

/**
 * 更新已预记录的审计条目状态（pending → success / failed）。
 *
 * —— 仅更新 status、detail（可选）、contextSnapshot（可选）字段。
 * —— 不存在的 auditId 静默忽略（预记录可能已失败，不应阻断主流程）。
 *
 * @example
 *   await updateAuditEntry({
 *     auditId: entry.auditId,
 *     status: "failed",
 *     detail: "执行失败: API 超时",
 *   })
 */
export async function updateAuditEntry(
  input: UpdateAuditEntryInput,
): Promise<void> {
  // 防御：当 auditId 缺失或为 undefined 时直接跳过
  if (!input.auditId) {
    return
  }
  // 预记录写入失败时 auditId 为 lost-* 假 ID，直接跳过更新
  if (input.auditId.startsWith("lost-")) {
    return
  }

  try {
    const data: Record<string, unknown> = { status: input.status }
    if (input.detail !== undefined) data.detail = input.detail
    if (input.contextSnapshot !== undefined) data.contextSnapshot = input.contextSnapshot

    await prisma.auditLog.update({
      where: { id: input.auditId },
      data,
    })
  } catch (error) {
    console.error(
      "[updateAuditEntry] 审计状态更新失败：",
      { auditId: input.auditId, status: input.status },
      error,
    )
  }
}
