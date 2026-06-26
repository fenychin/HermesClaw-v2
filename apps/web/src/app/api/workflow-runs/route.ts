import { ApiResponse } from '@/lib/server/api-response'
import { withRBAC } from '@/lib/server/api-handler'
import { startAgentWorkflowRun, StartWorkflowRunError } from '@/lib/server/workflow-run-starter'

export const POST = withRBAC(async (req: Request, ctx: any) => {
  let body: any = {}; try { const t = await req.text(); if (t) body = JSON.parse(t) } catch {}
  
  const agentId = body.agentId;
  const input = body.input;

  if (!agentId || !input) return ApiResponse.apiError('Missing agentId or input', 400, 'BAD_REQUEST')
  try {
    const result = await startAgentWorkflowRun({
      agentId,
      input,
      idempotencyKey: body.idempotencyKey,
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      taskId: body.taskId,
      actionType: body.actionType,
      automationLevel: body.automationLevel,
      riskLevel: body.riskLevel,
      version: body.version
    })
    return ApiResponse.ok(result)
  } catch (e) { if (e instanceof StartWorkflowRunError) return ApiResponse.apiError(e.message, e.httpStatus, e.code || 'ERROR'); throw e }
}, "MEMBER")
