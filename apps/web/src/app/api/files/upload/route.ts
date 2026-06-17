import { logger } from '@/lib/logger'
import { successResponse, errorResponse } from "@/lib/api-utils"
import type { WorkspaceContext } from "@/lib/workspace"
import { writeAgentLog } from "@/lib/server/agent-log"
import { withRBAC } from "@/lib/server/api-handler"
import { rateLimit } from "@/lib/rate-limit"
import { uploadFile, FileUploadError } from "@/lib/server/file-upload-service"
export const runtime = "nodejs"

export const POST = withRBAC(async (request: Request, ctx: WorkspaceContext) => {
  const start = Date.now(); const elapsed = () => `${((Date.now() - start) / 1000).toFixed(1)}s`
  try {
    if (!rateLimit(request.headers.get("x-forwarded-for") || "unknown", 20, 60_000)) return Response.json({ success: false, error: "请求过于频繁" }, { status: 429 })
    const file = (await request.formData()).get("file")
    if (!file || !(file instanceof File)) return errorResponse("缺少上传文件", 400)
    return successResponse({ file: await uploadFile(file, ctx.workspaceId, elapsed) }, 201)
  } catch (e) {
    if (e instanceof FileUploadError) return errorResponse(e.message, e.httpStatus)
    logger.error('POST /api/files/upload: 失败')
    void writeAgentLog({ source: "hermes-chat", taskName: "文件上传", status: "error", duration: elapsed(), detail: e instanceof Error ? e.message : "失败" })
    return errorResponse("文件上传失败")
  }
}, "MEMBER")
