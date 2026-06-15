import { NextResponse } from 'next/server'
import { refreshCapabilityHealth } from '@/lib/server/capability-registry'

export async function GET(request: Request) {
  // 1. 验证 CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    const stats = await refreshCapabilityHealth()
    return NextResponse.json({
      success: true,
      ...stats
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : '未知错误'
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    )
  }
}
