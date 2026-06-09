/**
 * 审计日志写入工具（AGENTS.md 第四章 4.3 / 第五章：关键操作须可溯源）
 *
 * —— 记录审批、删除、连接器授权、智能体边界变更等高危 / 治理动作，
 *    供 /settings 审计页与合规溯源使用。
 *
 * ⚠️ 仅在服务端调用；写审计失败不得阻断主流程，故全程 try/catch 静默吞错。
 * 配套 actorFromSession() 从登录会话解析操作者标识。
 */
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"

export type AuditRiskLevel = "low" | "mid" | "high"

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

/**
 * 写入一条审计日志。失败仅打印告警，不抛出。
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
