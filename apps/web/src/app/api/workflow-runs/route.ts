import { ApiResponse } from '@/lib/server/api-response'
import { withRBAC } from '@/lib/server/api-handler'
import { startAgentWorkflowRun, StartWorkflowRunError } from '@/lib/server/workflow-run-starter'

export const POST = withRBAC(async (req: Request, ctx: any) => {
  let body: any = {}; try { const t = await req.text(); if (t) body = JSON.parse(t) } catch {}
  if (!body.agentId || !body.input) return ApiResponse.apiError('Missing agentId or input', 400, 'BAD_REQUEST')
  try {
    const result = await startAgentWorkflowRun({ agentId: body.agentId, input: body.input, idempotencyKey: body.idempotencyKey, workspaceId: ctx.workspaceId, userId: ctx.userId })
    return ApiResponse.ok(result)
  } catch (e) { if (e instanceof StartWorkflowRunError) return ApiResponse.apiError(e.message, e.httpStatus, e.code || 'ERROR'); throw e }
}, "MEMBER")
