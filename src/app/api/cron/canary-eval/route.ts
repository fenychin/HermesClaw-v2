import { NextResponse } from "next/server"
import { evaluateCanaryHealth } from "@/lib/server/canary"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"

export async function GET(request: Request) {
  // 1. 验证 CRON_SECRET (回退 dev_secret)
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET || 'dev_secret'
  
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
      { status: 401 }
    )
  }

  // 2. 注入指标读取依赖执行健康巡检
  try {
    const result = await evaluateCanaryHealth(undefined, {
      writeAuditLog: async (input) => {
        const { writeAuditLog } = await import("@/lib/server/audit")
        await writeAuditLog(input)
      },
      triggerRollback: async (canaryId, reason) => {
        const { prisma: db } = await import("@/lib/prisma")
        const canary = await db.harnessCanary.findUnique({ where: { canaryId } })
        if (!canary) return

        const { executeRollback } = await import("@/lib/server/rollback")
        await executeRollback({
          canaryId,
          workspaceId: canary.workspaceId,
          reason,
          triggerType: "auto",
          triggeredBy: "system",
        })
      },
      getLatestMetrics: async (workspaceId, agentId) => {
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
        const logs = await prisma.agentLog.findMany({
          where: {
            workspaceId,
            agentId,
            createdAt: { gte: oneDayAgo }
          }
        })
        
        const total = logs.length
        if (total === 0) {
          return {
            errorRate: 0,
            successRate: 1.0,
            avgLatencyMs: 0,
            humanCorrectionRate: 0,
            connectorSuccessRate: 1.0
          }
        }
        
        const errors = logs.filter(l => l.status === 'failed' || l.status === 'error').length
        const success = logs.filter(l => l.status === 'success' || l.status === 'completed').length
        
        return {
          errorRate: errors / total,
          successRate: success / total,
          avgLatencyMs: 0,
          humanCorrectionRate: 0,
          connectorSuccessRate: 1.0
        }
      }
    })

    return NextResponse.json({
      success: true,
      data: result
    })
  } catch (error: any) {
    logger.error("[cron-canary-eval] Failed to evaluate canary health", {
      service: 'cron-canary-eval',
      action: 'cron.canary-eval.failed',
      traceId: undefined,
      workspaceId: 'system',
      errorCode: 'CRON_CANARY_EVAL_FAILED',
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined
    })
    return NextResponse.json(
      {
        success: false,
        error: { code: "CRON_CANARY_EVAL_FAILED", message: error instanceof Error ? error.message : "Internal server error" }
      },
      { status: 200 }
    )
  }
}
