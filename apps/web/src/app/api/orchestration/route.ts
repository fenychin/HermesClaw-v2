import { ApiResponse } from '@/lib/server/api-response'; import { withRBAC } from '@/lib/server/api-handler'
import { runOrchestration } from '@/lib/server/orchestrator'; import { checkAutomationGate } from '@/lib/server/guardrail'
import { logger } from '@/lib/logger'; import { orchestrate } from '@hermesclaw/hermes-kernel'

export const POST = withRBAC(async (req: Request, ctx: any) => {
  let body: any = {}; try { const text = await req.text(); if (text) body = JSON.parse(text) } catch {}
  try {
    const result = await orchestrate(async (input: any) => runOrchestration(input), async (gateInput: any) => { const res = await checkAutomationGate(gateInput); return { ok: res.ok, response: !res.ok ? res.response : undefined } }, { ...body, workspaceId: ctx.workspaceId, createdBy: ctx.userId || 'system' })
    if (!result.ok) return result.response
    return ApiResponse.ok({ sessionId: result.sessionId })
  } catch (err: any) { logger.error('POST /api/orchestration: failed'); return ApiResponse.apiError(err.message, 400, 'ORCHESTRATION_FAILED') }
}, 'MEMBER')
