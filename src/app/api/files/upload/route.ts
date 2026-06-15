import { writeFile, mkdir } from "fs/promises"
import { join } from "path"
import { logger } from '@/lib/logger'
import { successResponse, errorResponse } from "@/lib/api-utils"
import { type WorkspaceContext } from "@/lib/workspace"
import { actorFromSession, createAuditEntry, updateAuditEntry } from "@/lib/server/shared/audit"
import { writeAgentLog } from "@/lib/server/shared/agent-log"
import { withRBAC } from "@/lib/server/shared/api-handler"
import { rateLimit } from "@/lib/rate-limit"
import { extractFileText } from "@/lib/server/shared/extract-file-text"

export const runtime = "nodejs"

/** 允许的文件类型（MIME） */
const ALLOWED_MIME_TYPES = new Set([
  // 文档
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  // 文本
  "text/plain",
  "text/csv",
  "text/markdown",
  "application/json",
  "text/html",
  "text/xml",
  // 图像
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  // 压缩包
  "application/zip",
  "application/x-rar-compressed",
  "application/gzip",
])

/** 允许的文件扩展名 */
const ALLOWED_EXTENSIONS = new Set([
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".txt", ".csv", ".md", ".json", ".html", ".xml",
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg",
  ".zip", ".rar", ".gz",
])

/** 最大文件大小：50MB */
const MAX_FILE_SIZE = 50 * 1024 * 1024

/**
 * POST /api/files/upload
 * —— 文件附件上传端点（multipart/form-data）。
 *    RBAC 由 withRBAC 统一守卫（自动 RBAC_DENIED 审计 + 403 响应）。
 *
 * 接收表单字段：
 *   - file: File（必填）
 *
 * 返回：
 *   { file: { name, url, size, type } }
 */
export const POST = withRBAC(async (
  request: Request,
  ctx: WorkspaceContext,
) => {
  const start = Date.now()
  const elapsed = () => `${((Date.now() - start) / 1000).toFixed(1)}s`

  try {
    // 频率限制：每分钟最多 20 次
    const ip = request.headers.get("x-forwarded-for") || "unknown"
    if (!rateLimit(ip, 20, 60_000)) {
      return Response.json(
        { success: false, error: "请求过于频繁，请稍后重试" },
        { status: 429 },
      )
    }

    const formData = await request.formData()
    const file = formData.get("file")

    if (!file || !(file instanceof File)) {
      return errorResponse("缺少上传文件", 400)
    }

    // 校验文件大小
    if (file.size > MAX_FILE_SIZE) {
      return errorResponse(`文件大小超过限制（最大 50MB）`, 400)
    }

    if (file.size === 0) {
      return errorResponse("文件为空", 400)
    }

    // 校验文件扩展名
    const fileName = file.name
    const ext = fileName.toLowerCase().slice(fileName.lastIndexOf("."))
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return errorResponse(`不支持的文件类型: ${ext}`, 400)
    }

    // 校验 MIME 类型
    if (file.type && !ALLOWED_MIME_TYPES.has(file.type)) {
      return errorResponse(`不支持的 MIME 类型: ${file.type}`, 400)
    }

    // 预生成文件 ID（审计溯源：从预记录起即指向该文件，AGENTS.md §4.3）
    const fileId = crypto.randomUUID()
    const safeName = fileName.replace(/[^a-zA-Z0-9._\-一-鿿]/g, "_")
    const uniqueName = `${Date.now()}-${fileId.slice(0, 8)}-${safeName}`
    const sizeMB = (file.size / (1024 * 1024)).toFixed(2)
    const url = `/uploads/${ctx.workspaceId}/${uniqueName}`

    // 预记录审计日志（写文件前，确保失败时也可溯源）
    const actor = await actorFromSession()
    const auditEntry = await createAuditEntry({
      actor,
      action: "file.upload",
      targetType: "file",
      targetId: fileId,
      riskLevel: "low",
      automationLevel: "L2",
      triggeredBy: "user",
      workspaceId: ctx.workspaceId,
      detail: `${fileName} (${sizeMB}MB)`,
      contextSnapshot: { fileName, size: file.size, type: file.type || "unknown" },
    })

    try {
      // 保存文件到 public/uploads/<workspaceId>/（多租户隔离，AGENTS.md §4.11）
      const uploadsDir = join(process.cwd(), "public", "uploads", ctx.workspaceId)
      await mkdir(uploadsDir, { recursive: true })

      const filePath = join(uploadsDir, uniqueName)
      const buffer = Buffer.from(await file.arrayBuffer())
      await writeFile(filePath, buffer)

      // 审计回填成功（AGENTS.md §4.3 工具调用全程可溯源）
      await updateAuditEntry({
        auditId: auditEntry.auditId,
        status: "success",
        detail: `文件已上传: ${url}`,
      })

      // 运行日志（AGENTS.md §4.4 闭环反馈）
      void writeAgentLog({
        source: "hermes-chat",
        taskName: "文件上传",
        status: "success",
        duration: elapsed(),
        detail: `${fileName} (${sizeMB}MB)`,
        riskLevel: "low",
      })

      // 提取文件文本内容（供 AI 分析）
      const extractResult = await extractFileText(buffer, file.type, fileName)

      return successResponse(
        {
          file: {
            name: fileName,
            url,
            size: file.size,
            type: file.type || "application/octet-stream",
            // 文本提取结果 — 前端可直接附到消息中供 AI 分析
            extracted: extractResult.ok
              ? { ok: true, content: extractResult.content }
              : { ok: false, note: extractResult.note },
          },
        },
        201,
      )
    } catch (writeError) {
      // 文件写入失败 → 审计标记 failed
      await updateAuditEntry({
        auditId: auditEntry.auditId,
        status: "failed",
        detail: `写入失败: ${writeError instanceof Error ? writeError.message : "未知错误"}`,
      })
      throw writeError
    }
  } catch (error) {
    logger.error('POST /api/files/upload: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    void writeAgentLog({
      source: "hermes-chat",
      taskName: "文件上传",
      status: "error",
      duration: elapsed(),
      detail: error instanceof Error ? error.message : "文件上传失败",
    })
    return errorResponse("文件上传失败")
  }
}, "MEMBER")
