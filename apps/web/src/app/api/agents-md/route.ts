/**
 * GET /api/agents-md —— 读取 AGENTS.md 最高规则文档
 *
 * 读取项目根目录下的 AGENTS.md，以 JSON 返回全文内容。
 * AGENTS.md 是 HermesClaw-v2 的最高行为准则（AGENTS.md 第〇层元规则），
 * 该端点保证前端始终展示最新的规则内容，不存在过时硬编码。
 */
import { readFileSync } from "fs"
import { logger } from '@/lib/logger';
import { join } from "path"
import { successResponse, errorResponse } from "@/lib/api-utils"

export const runtime = "nodejs"
// 启用路由段缓存（ISR 语义），AGENTS.md 不常变，1 小时内复用
export const revalidate = 3600

export async function GET() {
  try {
    const filePath = join(process.cwd(), "AGENTS.md")
    const content = readFileSync(filePath, "utf-8")

    if (!content.trim()) {
      return errorResponse("AGENTS.md 文件为空", 500)
    }

    return successResponse({ content })
  } catch (error) {
    logger.error('GET /api/agents-md: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    const message = error instanceof Error ? error.message : "未知错误"
    return errorResponse(`无法读取 AGENTS.md：${message}`, 500)
  }
}
