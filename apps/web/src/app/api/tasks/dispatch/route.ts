/**
 * POST /api/tasks/dispatch
 *
 * Hermes 控制面聊天入口的任务调度 API。
 * 将用户输入转换为真实 TaskEnvelope，派生 WorkflowRun，并写入 AuditLog。
 *
 * 输入：TaskDispatchSchema
 * 输出：{ success: true, data: DispatchTaskResult }
 */

import { withRBAC } from "@/lib/server/api-handler"
import { validateBody, TaskDispatchSchema } from "@/lib/server/validators"
import { dispatchTaskFromChat, TaskDispatchError } from "@/lib/server/task-dispatch-service"
import { ApiResponse } from "@/lib/server/api-response"
import type { WorkspaceContext } from "@/lib/workspace"

export const POST = withRBAC(async (request: Request, ctx: WorkspaceContext) => {
  const parsed = validateBody(await request.json(), TaskDispatchSchema)
  if (parsed instanceof Response) return parsed

  try {
    const result = await dispatchTaskFromChat({
      inputText: parsed.inputText,
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      industryId: parsed.industryId || ctx.industryId,
      automationLevel: parsed.automationLevel,
      idempotencyKey: parsed.idempotencyKey,
      confirmed: parsed.confirmed,
    })

    return ApiResponse.ok(result)
  } catch (err) {
    if (err instanceof TaskDispatchError) {
      return ApiResponse.error((err as TaskDispatchError).message, (err as TaskDispatchError).httpStatus)
    }
    throw err
  }
}, "MEMBER")
