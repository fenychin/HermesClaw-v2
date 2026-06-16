/**
 * POST /api/maintenance/cleanup —— 定期清理过期数据
 *
 * 清理策略：
 * - AgentLog：删除 30 天前的 success 日志（保留 error 日志供排查）
 * - Memory：删除 7 天前的未冻结短期记忆
 *
 * 由 vercel.json cron 定时触发（每周日凌晨 3:00）
 */
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { writeAuditLog } from "@/lib/server/audit"

export const runtime = "nodejs"

export async function POST() {
  try {
    const now = Date.now()

    // 清理 30 天前的成功 AgentLog（保留重要的 error 日志）
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000)
    // 根据 AGENTS.md 规定，只做软归档
    const archivedLogs = await prisma.agentLog.updateMany({
      where: {
        status: "success",
        createdAt: { lt: thirtyDaysAgo },
        archivedAt: null,
      },
      data: { archivedAt: new Date() },
    })

    // 清理 7 天前的短期记忆（若未冻结）
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000)
    const deletedShortMemory = await prisma.memory.deleteMany({
      where: {
        type: "short",
        frozen: false,
        createdAt: { lt: sevenDaysAgo },
      },
    })

    const result = {
      cleaned: {
        agentLogs: archivedLogs.count,
        shortMemories: deletedShortMemory.count,
      },
      timestamp: new Date().toISOString(),
    }

    // 按 AGENTS.md 规定，维护操作必须写入 AuditLog
    await writeAuditLog({
      actor: "system",
      action: "maintenance.cleanup.completed",
      targetType: "system",
      targetId: "cleanup",
      detail: `Archived ${archivedLogs.count} logs, Cleaned ${deletedShortMemory.count} memories`,
      riskLevel: "medium",
      workspaceId: "default",
    })

    logger.info("POST /api/maintenance/cleanup: 完成", result)

    return Response.json(result)
  } catch (error) {
    logger.error("POST /api/maintenance/cleanup: 失败", {
      error: error instanceof Error ? error.message : "未知错误",
    })
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "未知错误",
      },
      { status: 500 },
    )
  }
}
