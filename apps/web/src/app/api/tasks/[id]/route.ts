import { errorResponse } from "@/lib/api-utils"
import type { WorkspaceContext } from "@/lib/workspace"
import { withRBAC, type RouteContext } from "@/lib/server/api-handler"
import { ApiResponse } from "@/lib/server/api-response"
import { z } from "zod"
import { patchTask, cancelTask, TaskMutationError } from "@/lib/server/task-mutations"

const TaskPatchSchema = z.object({ status: z.enum(["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"]).optional(), priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional() })
function handleErr(e: unknown) { if (e instanceof TaskMutationError) return ApiResponse.error(e.message, e.httpStatus); return ApiResponse.error("内部错误", 500) }

export const PATCH = withRBAC(async (request: Request, ctx: WorkspaceContext, routeContext: RouteContext<{ id: string }>) => {
  const { id } = await routeContext.params; const parsed = TaskPatchSchema.safeParse(await request.json())
  if (!parsed.success) return errorResponse("请求体格式错误", 400)
  try { return ApiResponse.ok(await patchTask(id, ctx.workspaceId, parsed.data.status, parsed.data.priority)) } catch (e) { return handleErr(e) }
}, "MEMBER")

export const DELETE = withRBAC(async (_request: Request, ctx: WorkspaceContext, routeContext: RouteContext<{ id: string }>) => {
  const { id } = await routeContext.params
  try { return ApiResponse.ok(await cancelTask(id, ctx.workspaceId)) } catch (e) { return handleErr(e) }
}, "MEMBER")
