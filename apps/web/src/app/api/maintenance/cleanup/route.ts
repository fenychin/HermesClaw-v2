import { prisma } from "@/lib/prisma"; import { logger } from "@/lib/logger"; import { createAuditEntry, updateAuditEntry } from "@/lib/server/audit"
export const runtime = "nodejs"

export async function POST() {
  // AGENTS.md §3.5 维护清理约定：清理前写预审计，清理后更新状态
  const auditEntry = await createAuditEntry({
    actor: "system",
    action: "maintenance.cleanup.started",
    targetType: "system",
    targetId: "cleanup",
    detail: "Short-term memory purge and AgentLog archival initiated",
    riskLevel: "medium",
    workspaceId: "default",
    triggeredBy: "cron",
  })

  try {
    const now = Date.now()
    // AgentLog 归档：软标记（updateMany），符合禁止物理删除约定
    const archivedLogs = await prisma.agentLog.updateMany({
      where: { status: "success", createdAt: { lt: new Date(now - 30 * 86400000) }, archivedAt: null },
      data: { archivedAt: new Date() }
    })
    // Memory type=short frozen=false 允许物理清理（AGENTS.md §3.5），清理前后须写审计
    const deletedShortMemory = await prisma.memory.deleteMany({
      where: { type: "short", frozen: false, createdAt: { lt: new Date(now - 7 * 86400000) } }
    })

    // 清理成功：更新审计条目为 success，记录计数
    await updateAuditEntry({
      auditId: auditEntry.auditId,
      status: "success",
      detail: `maintenance.cleanup.completed — Archived ${archivedLogs.count} AgentLogs, Cleaned ${deletedShortMemory.count} short-term memories`,
    })

    return Response.json({ cleaned: { agentLogs: archivedLogs.count, shortMemories: deletedShortMemory.count }, timestamp: new Date().toISOString() })
  } catch (error) {
    logger.error("POST /api/maintenance/cleanup: 失败")
    // 清理失败：更新审计条目为 failed
    await updateAuditEntry({
      auditId: auditEntry.auditId,
      status: "failed",
      detail: `maintenance.cleanup.failed — ${error instanceof Error ? error.message : "未知错误"}`,
    })
    return Response.json({ success: false, error: error instanceof Error ? error.message : "未知错误" }, { status: 500 })
  }
}

