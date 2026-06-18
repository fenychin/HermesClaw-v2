import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { callLlmText } from '@/lib/server/llm-provider'
import { runHarnessEvaluation, writeProposalsFromEvaluation } from '@hermesclaw/hermes-kernel'

function makeCallLlmAdapter() {
  return async (systemPrompt: string, userPrompt: string): Promise<string> => {
    return callLlmText({
      provider: 'deepseek',
      model: 'deepseek-chat',
      systemPrompt,
      userPrompt,
    })
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET || 'dev_secret'
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
      { status: 401 },
    )
  }

  try {
    const workspaces = await prisma.workspace.findMany({
      where: { status: 'active' },
      select: { id: true },
    })

    let totalProposals = 0
    let totalAnomalies = 0
    const callLlm = makeCallLlmAdapter()

    for (const ws of workspaces) {
      const settings = await prisma.workspaceSettings.findUnique({
        where: { workspaceId: ws.id },
        select: { evalWindowHours: true, webhookUrl: true },
      })

      const windowHours = settings?.evalWindowHours ?? 24

      const { results, anomalies } = await runHarnessEvaluation(
        { workspaceId: ws.id, windowHours },
        { prisma, callLlm },
      )

      totalAnomalies += anomalies

      if (results.length > 0) {
        const { created } = await writeProposalsFromEvaluation({
          workspaceId: ws.id,
          results,
          prisma,
        })
        totalProposals += created
      }

      if (anomalies > 0 && settings?.webhookUrl) {
        try {
          await fetch(settings.webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event: 'harness.anomaly.detected',
              workspaceId: ws.id,
              anomalies,
              proposalsCreated: results.length,
            }),
          })
        } catch {
          logger.warn('CRON evaluation: webhook notification failed', {
            workspaceId: ws.id,
            webhookUrl: settings.webhookUrl,
          })
        }
      }
    }

    return NextResponse.json({
      success: true,
      workspacesProcessed: workspaces.length,
      totalProposals,
      totalAnomalies,
    })
  } catch (error: any) {
    logger.error('CRON evaluation: execution failed', {
      service: 'cron-evaluation',
      action: 'cron.evaluation.failed',
      traceId: undefined,
      workspaceId: 'system',
      errorCode: 'CRON_EVALUATION_FAILED',
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
    })
    const msg = error instanceof Error ? error.message : '未知错误'
    return NextResponse.json(
      { success: false, error: { code: 'CRON_EVALUATION_FAILED', message: msg } },
      { status: 200 },
    )
  }
}
