/** @deprecated 此路由不在 MVP 必做范围（PRD §9.2），计划在未来版本移除。 */
import { prisma } from "@/lib/prisma"; import { logger } from "@/lib/logger"
import { successResponse, errorResponse, serializeDates } from "@/lib/api-utils"
import { buildWorkspaceContext } from "@/lib/workspace"

const DEFAULT_RATES: Record<string, number> = { "USD/CNY": 7.25, "EUR/CNY": 7.88, "USD/EUR": 0.92, "USD/GBP": 0.79 }

export async function GET(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request); const url = new URL(request.url)
    const baseParam = url.searchParams.get("base"); const targetsParam = url.searchParams.get("targets")
    let rates = await prisma.exchangeRate.findMany({ where: { workspaceId: ctx.workspaceId }, orderBy: { pair: "asc" } })
    const needsRefresh = rates.length === 0 || rates.some((r: any) => r.updatedAt.getTime() < Date.now() - 3600000)
    if (needsRefresh) {
      let fetchedRates: Record<string, number> | null = null
      try {
        const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 5000)
        const res = await fetch("https://open.er-api.com/v6/latest/USD", { signal: ctrl.signal }); clearTimeout(t)
        if (res.ok) { const data = await res.json(); if (data?.result === "success" && data.rates) fetchedRates = data.rates }
      } catch {}
      const pairsToUpsert = [
        { pair: "USD/CNY", value: fetchedRates?.CNY || DEFAULT_RATES["USD/CNY"] },
        { pair: "USD/EUR", value: fetchedRates?.EUR || DEFAULT_RATES["USD/EUR"] },
        { pair: "USD/GBP", value: fetchedRates?.GBP || DEFAULT_RATES["USD/GBP"] },
        { pair: "EUR/CNY", value: (fetchedRates?.CNY && fetchedRates?.EUR) ? fetchedRates.CNY / fetchedRates.EUR : DEFAULT_RATES["EUR/CNY"] },
      ]
      for (const p of pairsToUpsert) {
        await prisma.exchangeRate.upsert({ where: { workspaceId_pair: { workspaceId: ctx.workspaceId, pair: p.pair } }, update: { value: p.value }, create: { id: `${ctx.workspaceId}-${p.pair.replace("/", "-")}`, workspaceId: ctx.workspaceId, pair: p.pair, value: p.value } })
      }
      rates = await prisma.exchangeRate.findMany({ where: { workspaceId: ctx.workspaceId }, orderBy: { pair: "asc" } })
    }
    let filtered = rates
    if (baseParam) filtered = filtered.filter((r: any) => r.pair.startsWith(baseParam.toUpperCase() + "/"))
    if (targetsParam) { const targets = targetsParam.toUpperCase().split(","); filtered = filtered.filter((r: any) => targets.some((t: string) => r.pair.endsWith("/" + t))) }
    return successResponse({ rates: filtered.map((r: any) => serializeDates(r as any, ["updatedAt", "createdAt"])) })
  } catch (error) { logger.error("GET /api/exchange-rates: 失败", { error: error instanceof Error ? error.message : "未知错误" }); return errorResponse("服务器内部错误") }
}
