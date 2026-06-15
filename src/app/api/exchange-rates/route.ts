import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { successResponse, errorResponse, serializeDates } from "@/lib/api-utils"
import { buildWorkspaceContext } from "@/lib/workspace"

// 默认兜底汇率
const DEFAULT_RATES: Record<string, number> = {
  "USD/CNY": 7.25,
  "EUR/CNY": 7.88, // 7.25 / 0.92 ≈ 7.88
  "USD/EUR": 0.92,
  "USD/GBP": 0.79,
}

/** GET /api/exchange-rates —— 获取汇率监测列表，支持 base 与 targets 过滤，提供 1 小时自动缓存刷新与平滑兜底 */
export async function GET(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request)
    const url = new URL(request.url)
    const baseParam = url.searchParams.get("base")
    const targetsParam = url.searchParams.get("targets")

    // 1. 查询数据库中现有的汇率记录
    let rates = await prisma.exchangeRate.findMany({
      where: { workspaceId: ctx.workspaceId },
      orderBy: { pair: "asc" },
    })

    // 2. 判断是否需要刷新（超过 1 小时或没有数据）
    const now = Date.now()
    const oneHourAgo = now - 60 * 60 * 1000
    const needsRefresh = rates.length === 0 || rates.some(r => r.updatedAt.getTime() < oneHourAgo)

    if (needsRefresh) {
      logger.info("汇率缓存过期或不存在，触发自动刷新", { workspaceId: ctx.workspaceId })
      let fetchedRates: Record<string, number> | null = null
      
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000)
        
        const res = await fetch("https://open.er-api.com/v6/latest/USD", {
          signal: controller.signal
        })
        clearTimeout(timeoutId)

        if (res.ok) {
          const data = await res.json()
          if (data && data.result === "success" && data.rates) {
            fetchedRates = data.rates
            logger.info("汇率 API 刷新成功", { baseCode: data.base_code })
          }
        } else {
          logger.warn("汇率 API 返回非 OK 状态，使用兜底", { status: res.status })
        }
      } catch (err) {
        logger.warn("汇率 API 请求失败，准备使用兜底", {
          error: err instanceof Error ? err.message : "未知错误",
        })
      }

      // 计算需要更新的具体数值
      const pairsToUpsert = [
        {
          pair: "USD/CNY",
          value: fetchedRates ? (fetchedRates.CNY || DEFAULT_RATES["USD/CNY"]) : DEFAULT_RATES["USD/CNY"]
        },
        {
          pair: "USD/EUR",
          value: fetchedRates ? (fetchedRates.EUR || DEFAULT_RATES["USD/EUR"]) : DEFAULT_RATES["USD/EUR"]
        },
        {
          pair: "USD/GBP",
          value: fetchedRates ? (fetchedRates.GBP || DEFAULT_RATES["USD/GBP"]) : DEFAULT_RATES["USD/GBP"]
        },
        {
          pair: "EUR/CNY",
          value: fetchedRates && fetchedRates.CNY && fetchedRates.EUR 
            ? (fetchedRates.CNY / fetchedRates.EUR) 
            : DEFAULT_RATES["EUR/CNY"]
        }
      ]

      // 执行 upsert
      for (const p of pairsToUpsert) {
        await prisma.exchangeRate.upsert({
          where: {
            workspaceId_pair: {
              workspaceId: ctx.workspaceId,
              pair: p.pair,
            }
          },
          update: {
            value: p.value,
          },
          create: {
            id: `${ctx.workspaceId}-${p.pair.replace("/", "-")}`,
            workspaceId: ctx.workspaceId,
            pair: p.pair,
            value: p.value,
          }
        })
      }

      // 重新从数据库拉取最新数据
      rates = await prisma.exchangeRate.findMany({
        where: { workspaceId: ctx.workspaceId },
        orderBy: { pair: "asc" },
      })
    }

    // 3. 处理 base 及 targets 过滤
    let filtered = rates
    if (baseParam) {
      const baseUpper = baseParam.toUpperCase()
      filtered = filtered.filter(r => r.pair.startsWith(baseUpper + "/"))
    }
    if (targetsParam) {
      const targets = targetsParam.toUpperCase().split(",")
      filtered = filtered.filter(r => targets.some(t => r.pair.endsWith("/" + t)))
    }

    return successResponse({
      rates: filtered.map((r) =>
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
