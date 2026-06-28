/**
 * File Upload Service — 文件上传业务逻辑
 *
 * Phase 2 追踪链路升级：上传时写入 Artifact 表，返回 artifactId + 追踪字段
 */
import { writeFile, mkdir } from "fs/promises"
import { join } from "path"
import { prisma } from "@/lib/prisma"
import { actorFromSession, createAuditEntry, updateAuditEntry } from "@/lib/server/audit"
import { writeAgentLog } from "@/lib/server/agent-log"
import { extractFileText } from "@/lib/server/extract-file-text"

const ALLOWED_MIME_TYPES = new Set(["application/pdf","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","application/vnd.ms-powerpoint","application/vnd.openxmlformats-officedocument.presentationml.presentation","text/plain","text/csv","text/markdown","application/json","text/html","text/xml","image/png","image/jpeg","image/gif","image/webp","image/svg+xml","application/zip","application/x-rar-compressed","application/gzip","audio/mpeg","audio/mp4","audio/wav","audio/ogg","audio/webm","video/mp4","video/webm","video/quicktime"])
const ALLOWED_EXTENSIONS = new Set([".pdf",".doc",".docx",".xls",".xlsx",".ppt",".pptx",".txt",".csv",".md",".json",".html",".xml",".png",".jpg",".jpeg",".gif",".webp",".svg",".zip",".rar",".gz",".mp3",".m4a",".wav",".ogg",".mp4",".mov",".avi",".webm"])
const MAX_FILE_SIZE = 50 * 1024 * 1024

export class FileUploadError extends Error {
  constructor(public readonly httpStatus: number, message: string) { super(message); this.name = "FileUploadError" }
}

/** 根据 MIME 类型和扩展名推导 Artifact 分类 */
function inferCategory(mimeType: string, ext: string): string {
  if (/^image\//.test(mimeType) || [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"].includes(ext)) return "image"
  if (/^audio\//.test(mimeType) || [".mp3", ".m4a", ".wav", ".ogg"].includes(ext)) return "audio"
  if (/^video\//.test(mimeType) || [".mp4", ".mov", ".avi", ".webm"].includes(ext)) return "video"
  if (/zip|rar|gzip|archive/.test(mimeType) || [".zip", ".rar", ".gz"].includes(ext)) return "archive"
  return "document"
}

export async function uploadFile(file: File, workspaceId: string, elapsed: () => string) {
  if (file.size > MAX_FILE_SIZE) throw new FileUploadError(400, "文件大小超过限制（最大 50MB）")
  if (file.size === 0) throw new FileUploadError(400, "文件为空")
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."))
  if (!ALLOWED_EXTENSIONS.has(ext)) throw new FileUploadError(400, `不支持的文件类型: ${ext}`)
  if (file.type && !ALLOWED_MIME_TYPES.has(file.type)) throw new FileUploadError(400, `不支持的 MIME 类型: ${file.type}`)
  const fileId = crypto.randomUUID()
  const safeName = file.name.replace(/[^a-zA-Z0-9._\-一-鿿]/g, "_")
  const uniqueName = `${Date.now()}-${fileId.slice(0, 8)}-${safeName}`
  const sizeMB = (file.size / (1024 * 1024)).toFixed(2)
  const url = `/uploads/${workspaceId}/${uniqueName}`
  const category = inferCategory(file.type, ext)
  const actor = await actorFromSession()

  // 预记录审计
  const auditEntry = await createAuditEntry({
    actor,
    action: "file.upload",
    targetType: "artifact",
    targetId: fileId,
    riskLevel: "low",
    automationLevel: "L2",
    triggeredBy: "user",
    workspaceId,
    detail: `${file.name} (${sizeMB}MB)`,
    contextSnapshot: { fileName: file.name, size: file.size, type: file.type || "unknown", category },
  })

  try {
    const uploadsDir = join(process.cwd(), "public", "uploads", workspaceId); await mkdir(uploadsDir, { recursive: true })
    const buffer = Buffer.from(await file.arrayBuffer()); await writeFile(join(uploadsDir, uniqueName), buffer)

    // 写入 Artifact 表（追踪链路核心）
    let artifact: { id: string } | null = null
    try {
      artifact = await prisma.artifact.create({
        data: {
          workspaceId,
          fileName: file.name,
          originalName: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
          url,
          category,
          sourceType: "user_upload",
          parseStatus: "unparsed",
          operatedBy: actor,
          tags: [],
        },
        select: { id: true },
      })
    } catch (dbError) {
      // Artifact 写入失败不阻断上传，但记录警告
      console.warn("[file-upload] Artifact 写入失败，文件仅存储于磁盘", dbError)
    }

    await updateAuditEntry({ auditId: auditEntry.auditId, status: "success", detail: `文件已上传: ${url}${artifact ? ` (artifactId: ${artifact.id})` : ""}` })
    void writeAgentLog({ source: "hermes-chat", taskName: "文件上传", status: "success", duration: elapsed(), detail: `${file.name} (${sizeMB}MB)`, riskLevel: "low" })
    const extractResult = await extractFileText(buffer, file.type, file.name)

    return {
      name: file.name,
      url,
      size: file.size,
      type: file.type || "application/octet-stream",
      artifactId: artifact?.id ?? null,
      category,
      sourceType: "user_upload" as const,
      extracted: extractResult.ok
        ? { ok: true as const, content: extractResult.content }
        : { ok: false as const, note: extractResult.note },
    }
  } catch (writeError) {
    await updateAuditEntry({ auditId: auditEntry.auditId, status: "failed", detail: `写入失败: ${writeError instanceof Error ? writeError.message : "未知错误"}` })
    throw writeError
  }
}
