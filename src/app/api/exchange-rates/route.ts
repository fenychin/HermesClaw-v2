import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { successResponse, errorResponse, serializeDates } from "@/lib/api-utils"
import { buildWorkspaceContext } from "@/lib/workspace"

/** GET /api/exchange-rates —— 获取汇率监测列表（按货币对升序） */
export async function GET(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request)
    const rates = await prisma.exchangeRate.findMany({
      where: { workspaceId: ctx.workspaceId },
      orderBy: { pair: "asc" },
    })
    return successResponse({
      rates: rates.map((r) =>
        serializeDates(r as unknown as Record<string, unknown>, ["updatedAt", "createdAt"]),
      ),
    })
  } catch (error) {
    logger.error("GET /api/exchange-rates: 失败", {
      error: error instanceof Error ? error.message : "未知错误",
    })
    return errorResponse("服务器内部错误")
  }
}
