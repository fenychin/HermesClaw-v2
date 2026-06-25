import { ApiResponse } from '@/lib/server/api-response'
import { writeAuditLog } from '@/lib/server/audit'
import { logger } from '@/lib/logger'
import { NextResponse } from 'next/server'
import { expireStaleCheckpoints } from '@/lib/server/approval'

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization')
    const { searchParams } = new URL(req.url)
    const secret = process.env.CRON_SECRET || 'dev_secret'
    if (authHeader !== `Bearer ${secret}` && searchParams.get('secret') !== secret) {
      return ApiResponse.apiError('Unauthorized', 401, 'UNAUTHORIZED')
    }

    const result = await expireStaleCheckpoints()

    // 遵守 AGENTS.md 维护清理命名规范：maintenance.<task>.completed
    void writeAuditLog({
      actor: 'system',
      action: 'maintenance.expire-approvals.completed',
      targetType: 'cron',
      targetId: 'expire-approvals',
      detail: `Stale approvals sweep completed. Expired count: ${result.expired}`,
      riskLevel: 'low',
      workspaceId: 'system'
    })

    return ApiResponse.ok({ expired: result.expired })
  } catch (err: any) {
    logger.error('CRON expire-approvals: failed', { error: err.message })
    
    // 遵守 AGENTS.md 维护清理命名规范：maintenance.<task>.failed
    void writeAuditLog({
      actor: 'system',
      action: 'maintenance.expire-approvals.failed',
      targetType: 'cron',
      targetId: 'expire-approvals',
      detail: `Stale approvals sweep failed: ${err.message}`,
      riskLevel: 'medium',
      workspaceId: 'system'
    })

    return NextResponse.json({
      success: false,
      error: { code: 'CRON_EXPIRE_FAILED', message: err.message || 'Cron execution failed' }
    }, { status: 200 })
  }
}
