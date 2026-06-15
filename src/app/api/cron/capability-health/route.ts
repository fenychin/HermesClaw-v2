import { NextResponse } from 'next/server'
import { refreshCapabilityHealth } from '@/lib/server/capability-registry'
import { logger } from '@/lib/logger'

export async function GET(request: Request) {
  // 1. 验证 CRON_SECRET (回退 dev_secret 防止空密钥绕过)
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET || 'dev_secret'

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
      { status: 401 }
    )
  }

  try {
    const stats = await refreshCapabilityHealth()
    return NextResponse.json({
      success: true,
      ...stats
    })
  } catch (error: any) {
    logger.error('CRON capability-health: execution failed', {
      service: 'cron-capability-health',
      action: 'cron.capability-health.failed',
      traceId: undefined,
      workspaceId: 'system',
      errorCode: 'CRON_CAPABILITY_HEALTH_FAILED',
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined
    })
    const msg = error instanceof Error ? error.message : '未知错误'
    return NextResponse.json(
      { success: false, error: { code: 'CRON_CAPABILITY_HEALTH_FAILED', message: msg } },
      { status: 200 }
    )
  }
}
