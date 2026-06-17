import { prisma } from "@/lib/prisma"; import { logger } from "@/lib/logger"; import { writeAuditLog } from "@/lib/server/audit"
export const runtime = "nodejs"

export async function POST() {
  try {
    const now = Date.now()
    const archivedLogs = await prisma.agentLog.updateMany({ where: { status: "success", createdAt: { lt: new Date(now - 30 * 86400000) }, archivedAt: null }, data: { archivedAt: new Date() } })
    const deletedShortMemory = await prisma.memory.deleteMany({ where: { type: "short", frozen: false, createdAt: { lt: new Date(now - 7 * 86400000) } } })
    void writeAuditLog({ actor: "system", action: "maintenance.cleanup.completed", targetType: "system", targetId: "cleanup", detail: `Archived ${archivedLogs.count} logs, Cleaned ${deletedShortMemory.count} memories`, riskLevel: "medium", workspaceId: "default" })
    return Response.json({ cleaned: { agentLogs: archivedLogs.count, shortMemories: deletedShortMemory.count }, timestamp: new Date().toISOString() })
  } catch (error) { logger.error("POST /api/maintenance/cleanup: 失败"); return Response.json({ success: false, error: error instanceof Error ? error.message : "未知错误" }, { status: 500 }) }
}
