import { NextResponse } from "next/server"; import { evaluateCanaryHealth } from "@/lib/server/canary"; import { prisma } from "@/lib/prisma"; import { logger } from "@/lib/logger"
import { DEFAULT_CANARY_THRESHOLDS } from "@hermesclaw/hermes-kernel"

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization"); const cronSecret = process.env.CRON_SECRET || 'dev_secret'
  if (authHeader !== `Bearer ${cronSecret}`) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } }, { status: 401 })
  try {
    const result = await evaluateCanaryHealth(undefined, {
      writeAuditLog: async (input: any) => { const { writeAuditLog } = await import("@/lib/server/audit"); await writeAuditLog(input) },
      triggerRollback: async (canaryId: string, reason: string) => { const { prisma: db } = await import("@/lib/prisma"); const canary = await db.harnessCanary.findUnique({ where: { canaryId } }); if (!canary) return; const { executeRollback } = await import("@/lib/server/rollback"); await executeRollback({ canaryId, workspaceId: canary.workspaceId, reason, triggerType: "auto", triggeredBy: "system" }) },
      getLatestMetrics: async (workspaceId: string, agentId: string) => { const metricsWindowStart = new Date(Date.now() - DEFAULT_CANARY_THRESHOLDS.observationWindowMs); const logs = await prisma.agentLog.findMany({ where: { workspaceId, agentId, createdAt: { gte: metricsWindowStart } } }); const total = logs.length; if (total === 0) return { errorRate: 0, successRate: 1.0, avgLatencyMs: 0, humanCorrectionRate: 0, connectorSuccessRate: 1.0 }; const errors = logs.filter((l: any) => l.status === 'failed' || l.status === 'error').length; return { errorRate: errors / total, successRate: (total - errors) / total, avgLatencyMs: 0, humanCorrectionRate: 0, connectorSuccessRate: 1.0 } },
    })
    return NextResponse.json({ success: true, data: result })
  } catch (error: any) { logger.error("[cron-canary-eval] Failed"); return NextResponse.json({ success: false, error: { code: "CRON_CANARY_EVAL_FAILED", message: error.message || "Internal error" } }, { status: 200 }) }
}
