import { withRBAC } from "@/lib/server/api-handler"
import type { WorkspaceContext } from "@/lib/workspace"
import { actorFromSession } from "@/lib/server/audit"
import { ApiResponse } from "@/lib/server/api-response"
import { generateAndStoreReport, ReportServiceError, type ReportType } from "@/lib/server/report-service"
import { z } from "zod"

const ReportGenerateSchema = z.object({ type: z.enum(["MORNING", "EVENING", "WEEKLY"]).optional() })

export const POST = withRBAC(async (request: Request, ctx: WorkspaceContext) => {
  let type: ReportType | undefined
  try { const raw = await request.json(); const p = ReportGenerateSchema.safeParse(raw); if (p.success) type = p.data.type } catch {}
  try {
    const result = await generateAndStoreReport({ workspaceId: ctx.workspaceId, actor: await actorFromSession(), type })
    return ApiResponse.ok(result)
  } catch (e) {
    if (e instanceof ReportServiceError) return ApiResponse.error(e.message, e.httpStatus)
    return ApiResponse.error(e instanceof Error ? e.message : "生成失败", 500)
  }
}, "MEMBER")
