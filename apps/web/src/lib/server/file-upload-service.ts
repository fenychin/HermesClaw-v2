/**
 * File Upload Service — 文件上传业务逻辑
 * v2: 上传后写 FileRecord DB，文本提取完成后更新 parseStatus
 */
import { writeFile, mkdir } from "fs/promises"
import { join } from "path"
import { prisma } from "@/lib/prisma"
import { actorFromSession, createAuditEntry, updateAuditEntry } from "@/lib/server/audit"
import { writeAgentLog } from "@/lib/server/agent-log"
import { extractFileText } from "@/lib/server/extract-file-text"

const ALLOWED_MIME_TYPES = new Set(["application/pdf","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","application/vnd.ms-powerpoint","application/vnd.openxmlformats-officedocument.presentationml.presentation","text/plain","text/csv","text/markdown","application/json","text/html","text/xml","image/png","image/jpeg","image/gif","image/webp","image/svg+xml","video/mp4","video/quicktime","video/x-msvideo","video/webm","audio/mpeg","audio/mp4","audio/wav","audio/ogg","audio/x-m4a","application/zip","application/x-rar-compressed","application/gzip"])
const ALLOWED_EXTENSIONS = new Set([".pdf",".doc",".docx",".xls",".xlsx",".ppt",".pptx",".txt",".csv",".md",".json",".html",".xml",".png",".jpg",".jpeg",".gif",".webp",".svg",".mp4",".mov",".avi",".webm",".mp3",".m4a",".wav",".ogg",".zip",".rar",".gz"])
const MAX_FILE_SIZE = 50 * 1024 * 1024

/** 根据扩展名推断业务分类 */
function inferCategory(ext: string): string {
  const e = ext.replace(".", "").toLowerCase()
  if (["png","jpg","jpeg","gif","webp","svg"].includes(e)) return "image"
  if (["mp4","mov","avi","webm"].includes(e)) return "video"
  if (["mp3","m4a","wav","ogg"].includes(e)) return "audio"
  if (["zip","rar","gz","7z"].includes(e)) return "archive"
  return "archive"
}

export class FileUploadError extends Error {
  constructor(public readonly httpStatus: number, message: string) { super(message); this.name = "FileUploadError" }
}

export async function uploadFile(
  file: File,
  workspaceId: string,
  elapsed: () => string,
  options?: { autoParse?: boolean; projectId?: string }
) {
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
  const category = inferCategory(ext)
  const actor = await actorFromSession()
  const autoParse = options?.autoParse !== false // 默认 true

  // 两阶段审计预记录
  const auditEntry = await createAuditEntry({
    actor,
    action: "file.upload",
    targetType: "file",
    targetId: fileId,
    riskLevel: "low",
    automationLevel: "L2",
    triggeredBy: "user",
    workspaceId,
    detail: `${file.name} (${sizeMB}MB)`,
    contextSnapshot: { fileName: file.name, size: file.size, type: file.type || "unknown" }
  })

  try {
    // 写磁盘
    const uploadsDir = join(process.cwd(), "public", "uploads", workspaceId)
    await mkdir(uploadsDir, { recursive: true })
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(join(uploadsDir, uniqueName), buffer)

    // 写 DB —— 初始 parseStatus=parsing（若自动解析）或 unparsed
    const fileRecord = await prisma.fileRecord.create({
      data: {
        id: fileId,
        workspaceId,
        name: file.name,
        type: ext.replace(".", ""),
        mimeType: file.type || "application/octet-stream",
        category,
        size: file.size,
        url,
        parseStatus: autoParse ? "parsing" : "unparsed",
        vectorIndexStatus: "unindexed",
        tags: "[]",
        relatedProjectId: options?.projectId || null,
        versions: JSON.stringify([
          { id: `ver-${fileId.slice(0, 8)}-1`, fileName: file.name, size: file.size, operator: actor, createdAt: new Date().toISOString() }
        ]),
        operatedBy: actor,
      }
    })

    await updateAuditEntry({ auditId: auditEntry.auditId, status: "success", detail: `文件已上传: ${url}` })
    void writeAgentLog({ source: "hermes-chat", taskName: "文件上传", status: "success", duration: elapsed(), detail: `${file.name} (${sizeMB}MB)`, riskLevel: "low" })

    // 异步文本提取（不阻塞上传响应）
    if (autoParse) {
      void (async () => {
        try {
          const extractResult = await extractFileText(buffer, file.type, file.name)
          await prisma.fileRecord.update({
            where: { id: fileId },
            data: {
              parseStatus: extractResult.ok ? "parsed" : "failed",
              parseSummary: extractResult.ok ? extractResult.content?.slice(0, 500) : extractResult.note,
            }
          })
        } catch {
          await prisma.fileRecord.update({ where: { id: fileId }, data: { parseStatus: "failed", parseSummary: "文本提取异常" } }).catch(() => {})
        }
      })()
    }

    return {
      id: fileRecord.id,
      name: file.name,
      url,
      size: file.size,
      type: file.type || "application/octet-stream",
      category,
      parseStatus: fileRecord.parseStatus,
    }
  } catch (writeError) {
    await updateAuditEntry({ auditId: auditEntry.auditId, status: "failed", detail: `写入失败: ${writeError instanceof Error ? writeError.message : "未知错误"}` })
    throw writeError
  }
}
