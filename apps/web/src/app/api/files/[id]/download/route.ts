/**
 * GET /api/files/[id]/download — 文件下载
 * 流式读取磁盘文件并返回给浏览器，设置 Content-Disposition: attachment
 */
import { prisma } from "@/lib/prisma"
import { errorResponse } from "@/lib/api-utils"
import { buildWorkspaceContext } from "@/lib/workspace"
import { logger } from "@/lib/logger"
import { createReadStream, existsSync } from "fs"
import { join, basename } from "path"
import { Readable } from "stream"
import { ReadableStream as WebReadableStream } from "stream/web"

export const runtime = "nodejs"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await buildWorkspaceContext(request)
    const { id } = await params

    const record = await prisma.fileRecord.findFirst({
      where: { id, workspaceId: ctx.workspaceId, deletedAt: null },
    })
    if (!record) return errorResponse("文件不存在", 404)

    // url 格式：/uploads/{workspaceId}/xxx.pdf
    const diskPath = join(process.cwd(), "public", record.url)
    if (!existsSync(diskPath)) {
      return errorResponse("文件已从磁盘删除，无法下载", 404)
    }

    // 推断 Content-Type
    const mimeType = record.mimeType || "application/octet-stream"
    const safeFileName = encodeURIComponent(basename(record.name))

    // 使用 Node.js ReadStream → Web ReadableStream
    const nodeStream = createReadStream(diskPath)
    const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>

    return new Response(webStream as WebReadableStream, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `attachment; filename*=UTF-8''${safeFileName}`,
        "Content-Length": String(record.size),
        "Cache-Control": "private, no-cache",
      },
    })
  } catch (err) {
    logger.error("GET /api/files/[id]/download: 失败", { error: err instanceof Error ? err.message : "未知" })
    return errorResponse("下载失败")
  }
}
