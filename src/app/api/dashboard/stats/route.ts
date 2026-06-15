import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { successResponse, errorResponse } from "@/lib/api-utils"
import { type WorkspaceContext } from "@/lib/workspace"
import { withRBAC } from "@/lib/server/shared/api-handler"
import type {
  DailyInquiryPoint,
  ActiveClientAlert,
  GeoDistributionPoint,
  RiskDimension,
  IndustrySentiment,
  PredictiveIndicator,
  TrendIndicator,
  StatSparklines,
  StatTrends,
  KpiComparison,
  DashboardComparisons,
} from "@/types/dashboard"
import {
  RISK_DIMENSION_LABELS,
  MONITORED_SECTORS,
} from "@/types/dashboard"
import type { RiskDimensionKey } from "@/types/dashboard"

/** 大盘统计数据结构 */
interface DashboardStats {
  /** 今日询盘数 */
  todayInquiries: number
  /** 今日询盘较昨日变化量（正数=增加） */
  todayInquiriesChange: number
  /** 跟进中客户数（来源去重） */
  followingCustomers: number
  /** 待处理任务数（未回复询盘） */
  pendingTasks: number
  /** 活跃项目数 */
  activeProjects: number
  /** 紧急待办数（高优先级 + 未回复询盘） */
  urgentCount: number
  /** 本周工作流执行概览（按天聚合成功/失败数） */
  weeklyWorkflowRuns: WeeklyWorkflowDay[]
  /** 近 14 天询盘日趋势（折线图数据） */
  dailyInquiryTrend: DailyInquiryPoint[]
  /** 活跃客户预警（近 7 天高频询盘客户） */
  activeClientAlerts: ActiveClientAlert[]
  /** 地理分布（近 30 天按国家聚合） */
  geoDistribution: GeoDistributionPoint[]
  /** 五维风险评分（雷达图数据） */
  riskRadar: RiskDimension[]
  /** 五大外贸行业情绪 */
  industrySentiments: IndustrySentiment[]
  /** 预测指示器 */
  predictiveIndicators: PredictiveIndicator[]
  /** 迷你趋势线数据（7 天序列） */
  sparklines: StatSparklines
  /** 指标趋势方向 */
  trends: StatTrends
  /** KPI 较上周同期对比 */
  comparisons: DashboardComparisons
}

interface WeeklyWorkflowDay {
  day: string      // 周一、周二...
  success: number
  failed: number
}

/** 获取当天 00:00:00.000 */
function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

/** 获取本周一 00:00:00.000 */
function startOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // 周一为起始
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

/** 周一至周日中文标签 */
const DAY_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]

/** GET /api/dashboard/stats —— 大盘统计数据聚合（RBAC: VIEWER） */
export const GET = withRBAC(async (request: Request, ctx: WorkspaceContext) => {
  try {
    const now = new Date()
    const todayStart = startOfDay(now)
    const yesterdayStart = new Date(todayStart.getTime() - 86400000)
    const weekStart = startOfWeek(now)

    // 近 14 天起点（用于询盘趋势折线图）
    const trendStart = new Date(todayStart.getTime() - 13 * 86400000)

    // 近 7 天起点（用于活跃客户检测）
    const activeSince = new Date(todayStart.getTime() - 6 * 86400000)

    // 近 30 天起点（用于地理分布：按国家聚合询盘活动量）
    const geoStart = new Date(todayStart.getTime() - 29 * 86400000)

    // 并行查询所有聚合数据
    const [
      todayCount,
      yesterdayCount,
      allInquiries,
      pendingCount,
      urgentCount,
      activeProjectCount,
      weekWorkflowRuns,
      trendInquiries,
      activeInquiries,
      geoInquiries,
      intelItems,
      prevWeekInquiryCount,
      recentWeekInquiryCount,
      recentWeekReplied,
      prevWeekReplied,
    ] = await Promise.all([
      // 今日询盘数
      prisma.inquiry.count({
        where: {
          workspaceId: ctx.workspaceId,
          createdAt: { gte: todayStart },
        },
      }),
      // 昨日询盘数（用于变化量计算）
      prisma.inquiry.count({
        where: {
          workspaceId: ctx.workspaceId,
          createdAt: { gte: yesterdayStart, lt: todayStart },
        },
      }),
      // 所有询盘（用于去重客户统计）
      prisma.inquiry.findMany({
        where: { workspaceId: ctx.workspaceId },
        select: { companyName: true },
      }),
      // 待处理任务（OPEN + IN_PROGRESS 状态的 Task 实体）
      prisma.task.count({
        where: {
          workspaceId: ctx.workspaceId,
          status: { in: ["OPEN", "IN_PROGRESS"] },
        },
      }),
      // 紧急待办（高优先级 + 未回复）
      prisma.inquiry.count({
        where: {
          workspaceId: ctx.workspaceId,
          priority: "high",
          replied: false,
        },
      }),
      // 活跃项目数
      prisma.project.count({
        where: {
          workspaceId: ctx.workspaceId,
          status: "active",
        },
      }),
      // 本周工作流运行记录
      prisma.workflowRun.findMany({
        where: {
          workspaceId: ctx.workspaceId,
          startedAt: { gte: weekStart },
        },
        select: { status: true, startedAt: true },
      }),
      // 近 14 天询盘（用于日趋势折线图）
      prisma.inquiry.findMany({
        where: {
          workspaceId: ctx.workspaceId,
          createdAt: { gte: trendStart },
        },
        select: { createdAt: true },
      }),
      // 近 7 天询盘（用于活跃客户检测）
      prisma.inquiry.findMany({
        where: {
          workspaceId: ctx.workspaceId,
          createdAt: { gte: activeSince },
        },
        select: {
          companyName: true,
          fromCountry: true,
          countryFlag: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      // 近 30 天询盘（地理分布聚合）
      prisma.inquiry.findMany({
        where: {
          workspaceId: ctx.workspaceId,
          createdAt: { gte: geoStart },
        },
        select: { fromCountry: true, countryFlag: true, companyName: true },
      }),
      // 近 30 天市场情报（风险雷达 & 行业情绪数据源）
      prisma.marketIntelligence.findMany({
        where: {
          workspaceId: ctx.workspaceId,
          publishedAt: { gte: geoStart },
        },
        select: { type: true, title: true, summary: true, impactLevel: true, publishedAt: true },
      }),
      // 前一周询盘（7-14 天前，用于预测对比）
      prisma.inquiry.count({
        where: {
          workspaceId: ctx.workspaceId,
          createdAt: { gte: new Date(todayStart.getTime() - 14 * 86400000), lt: new Date(todayStart.getTime() - 7 * 86400000) },
        },
      }),
      // 近 7 天询盘数（预测基准）
      prisma.inquiry.count({
        where: {
          workspaceId: ctx.workspaceId,
          createdAt: { gte: new Date(todayStart.getTime() - 7 * 86400000) },
        },
      }),
      // 近 7 天已回复询盘（用于回复率对比）
      prisma.inquiry.count({
        where: {
          workspaceId: ctx.workspaceId,
          createdAt: { gte: new Date(todayStart.getTime() - 7 * 86400000) },
          replied: true,
        },
      }),
      // 前一周已回复询盘（7-14 天前）
      prisma.inquiry.count({
        where: {
          workspaceId: ctx.workspaceId,
          createdAt: {
            gte: new Date(todayStart.getTime() - 14 * 86400000),
            lt: new Date(todayStart.getTime() - 7 * 86400000),
          },
          replied: true,
        },
      }),
    ])

    // 客户去重统计
    const uniqueCompanies = new Set(
      allInquiries.map((i) => i.companyName).filter(Boolean),
    )

    // 周工作流按天聚合
    const weeklyData: WeeklyWorkflowDay[] = DAY_LABELS.map((day, index) => {
      const dayStart = new Date(weekStart.getTime() + index * 86400000)
      const dayEnd = new Date(dayStart.getTime() + 86400000)
      const dayRuns = weekWorkflowRuns.filter((r) => {
        const t = r.startedAt.getTime()
        return t >= dayStart.getTime() && t < dayEnd.getTime()
      })
      return {
        day,
        success: dayRuns.filter((r) => r.status === "completed").length,
        failed: dayRuns.filter((r) => r.status === "failed").length,
      }
    })

    // 近 14 天询盘日趋势（折线图数据，按天聚合）
    const dailyInquiryTrend: DailyInquiryPoint[] = []
    for (let i = 13; i >= 0; i--) {
      const dayStart = new Date(todayStart.getTime() - i * 86400000)
      const dayEnd = new Date(dayStart.getTime() + 86400000)
      const count = trendInquiries.filter((inq) => {
        const t = inq.createdAt.getTime()
        return t >= dayStart.getTime() && t < dayEnd.getTime()
      }).length
      const month = String(dayStart.getMonth() + 1).padStart(2, "0")
      const day = String(dayStart.getDate()).padStart(2, "0")
      dailyInquiryTrend.push({ date: `${month}-${day}`, count })
    }

    // 活跃客户预警：近 7 天有 ≥2 条询盘的客户（按询盘数降序，取前 5）
    const companyMap = new Map<string, {
      companyName: string
      countryFlag: string
      country: string
      recentCount: number
      lastInquiryAt: Date
    }>()
    for (const inq of activeInquiries) {
      const key = inq.companyName
      const existing = companyMap.get(key)
      if (existing) {
        existing.recentCount++
        if (inq.createdAt > existing.lastInquiryAt) {
          existing.lastInquiryAt = inq.createdAt
        }
      } else {
        companyMap.set(key, {
          companyName: inq.companyName,
          countryFlag: inq.countryFlag,
          country: inq.fromCountry,
          recentCount: 1,
          lastInquiryAt: inq.createdAt,
        })
      }
    }
    const activeClientAlerts: ActiveClientAlert[] = Array.from(companyMap.values())
      .filter((c) => c.recentCount >= 2)
      .sort((a, b) => b.recentCount - a.recentCount)
      .slice(0, 5)
      .map((c) => ({
        ...c,
        lastInquiryAt: c.lastInquiryAt.toISOString(),
      }))

    // —— 地理分布：近 30 天按国家聚合询盘活动量 ——
    const geoDistribution: GeoDistributionPoint[] = (() => {
      const countryMap = new Map<string, {
        countryName: string
        countryFlag: string
        count: number
      }>()
      for (const inq of geoInquiries) {
        const key = inq.fromCountry
        const existing = countryMap.get(key)
        if (existing) {
          existing.count++
        } else {
          countryMap.set(key, {
            countryName: inq.fromCountry,
            countryFlag: inq.countryFlag,
            count: 1,
          })
        }
      }
      return Array.from(countryMap.entries())
        .map(([countryCode, data]) => ({
          countryCode,
          countryName: data.countryName,
          inquiryCount: data.count,
          intelCount: 0, // MarketIntelligence 无 country 字段，暂为 0
          totalActivity: data.count,
          flag: data.countryFlag,
        }))
        .sort((a, b) => b.totalActivity - a.totalActivity)
        .slice(0, 20) // 取前 20 个活跃国家
    })()

    // —— 风险雷达：按 intelligence.type 分组计算五维风险评分 ——
    const riskRadar: RiskDimension[] = (() => {
      // 按 type 分组（type = currency | tariff | competitor | market | logistics）
      const typeGroups = new Map<string, { high: number; mid: number; low: number }>()
      for (const intel of intelItems) {
        const t = intel.type
        if (!typeGroups.has(t)) {
          typeGroups.set(t, { high: 0, mid: 0, low: 0 })
        }
        const group = typeGroups.get(t)!
        if (intel.impactLevel === "high") group.high++
        else if (intel.impactLevel === "mid") group.mid++
        else group.low++
      }

      // 分两个时间段判趋势（近 7 天 vs 前 7 天）
      const recent7d = new Date(todayStart.getTime() - 7 * 86400000)
      const typeRecentCount = new Map<string, number>()
      const typePrevCount = new Map<string, number>()
      for (const intel of intelItems) {
        const t = intel.type
        if (intel.publishedAt >= recent7d) {
          typeRecentCount.set(t, (typeRecentCount.get(t) ?? 0) + 1)
        } else {
          typePrevCount.set(t, (typePrevCount.get(t) ?? 0) + 1)
        }
      }

      const dimensions: RiskDimensionKey[] = ["currency", "tariff", "logistics", "competition", "market"]
      return dimensions.map((key) => {
        const group = typeGroups.get(key) ?? { high: 0, mid: 0, low: 0 }
        const total = group.high + group.mid + group.low
        // 评分公式：high 权重 1.0，mid 权重 0.5，low 权重 0.2
        // 无数据时返回 0（非 25——表示无信号）
        const score = total > 0
          ? Math.round(((group.high * 1.0 + group.mid * 0.5 + group.low * 0.2) / total) * 100)
          : 0
        const recent = typeRecentCount.get(key) ?? 0
        const prev = typePrevCount.get(key) ?? 0
        const trend: "up" | "down" | "stable" =
          recent > prev ? "up" : recent < prev ? "down" : "stable"
        return {
          key,
          label: RISK_DIMENSION_LABELS[key],
          score: Math.min(score, 100),
          trend,
        }
      })
    })()

    // —— 行业情绪：基于情报标题关键词匹配行业 + impactLevel 推断方向 ——
    const industrySentiments: IndustrySentiment[] = (() => {
      // 关键词 → 行业映射
      const sectorKeywords: Record<string, string[]> = {
        "电子": ["电子", "芯片", "半导体", "手机", "电脑", "集成电路", "PCB", "面板", "元件"],
        "纺织": ["纺织", "服装", "面料", "家纺", "纱线", "布料", "印染", "成衣"],
        "机械": ["机械", "设备", "机床", "工程机械", "泵", "阀门", "轴承", "模具"],
        "化工": ["化工", "化学", "塑料", "橡胶", "石化", "涂料", "添加剂", "树脂"],
        "农业": ["农业", "农产品", "粮食", "大豆", "水果", "蔬菜", "水产", "养殖"],
      }

      // 情感关键词
      const bullishWords = ["增长", "上升", "利好", "回暖", "需求旺盛", "涨价", "扩张", "突破"]
      const bearishWords = ["下降", "萎缩", "风险", "制裁", "加税", "壁垒", "衰退", "过剩", "暴跌"]

      const sectorScores = new Map<string, { bullish: number; bearish: number; total: number }>()
      for (const sector of MONITORED_SECTORS) {
        sectorScores.set(sector, { bullish: 0, bearish: 0, total: 0 })
      }

      for (const intel of intelItems) {
        const text = `${intel.title} ${intel.summary}`
        for (const sector of MONITORED_SECTORS) {
          const keywords = sectorKeywords[sector] ?? []
          const matched = keywords.some((kw) => text.includes(kw))
          if (!matched) continue

          const entry = sectorScores.get(sector)!
          entry.total++
          if (bullishWords.some((w) => text.includes(w))) entry.bullish++
          else if (bearishWords.some((w) => text.includes(w))) entry.bearish++
          // neutral 默认不计数（total 已有，bullish + bearish 之外的均为 neutral）
        }
      }

      return MONITORED_SECTORS.map((sector) => {
        const entry = sectorScores.get(sector)!
        const { bullish, bearish, total } = entry
        // 评分：bullish = +1，bearish = -1，neutral = 0，按比例换算到 -100..100
        const score = total > 0
          ? Math.round(((bullish - bearish) / total) * 100)
          : 0
        const sentiment: "bullish" | "bearish" | "neutral" =
          score > 20 ? "bullish" : score < -20 ? "bearish" : "neutral"
        // 置信度：total 越多越可信（上限 1.0）
        const confidence = Math.min(total / 10, 1.0)
        return { sector, sentiment, score, confidence }
      })
    })()

    // —— 预测指示器：简单移动平均对比（近 7 天 vs 前 7 天） ——
    const predictiveIndicators: PredictiveIndicator[] = [
      {
        metric: "inquiry_volume",
        direction:
          recentWeekInquiryCount > prevWeekInquiryCount ? "up"
          : recentWeekInquiryCount < prevWeekInquiryCount ? "down"
          : "stable",
        confidence: Math.min(
          Math.abs(recentWeekInquiryCount - prevWeekInquiryCount) / Math.max(prevWeekInquiryCount, 1),
          0.95,
        ),
        changePercent: prevWeekInquiryCount > 0
          ? Math.round(((recentWeekInquiryCount - prevWeekInquiryCount) / prevWeekInquiryCount) * 100)
          : 0,
      },
    ]

    // —— 迷你趋势线（Sparkline + TrendIndicator） ——
    // 从 dailyInquiryTrend（14 天）提取最后 7 天作为 inquiry sparkline
    const inquirySparkline = dailyInquiryTrend.slice(-7).map((p) => p.count)
    const sparklines: StatSparklines = {
      todayInquiries: inquirySparkline,
      followingCustomers: [], // 无日级历史数据，保留空数组供未来扩展
      pendingTasks: [],
      activeProjects: [],
    }

    // 趋势：比较近 7 天均值 vs 前 7 天均值
    function computeTrend(recent: number[], previous: number[]): TrendIndicator {
      const recentAvg = recent.length > 0 ? recent.reduce((a, b) => a + b, 0) / recent.length : 0
      const prevAvg = previous.length > 0 ? previous.reduce((a, b) => a + b, 0) / previous.length : 1
      const diff = recentAvg - prevAvg
      const percent = prevAvg > 0 ? Math.round((diff / prevAvg) * 100) : 0
      const direction: "up" | "down" | "stable" =
        percent > 5 ? "up" : percent < -5 ? "down" : "stable"
      return { direction, percent }
    }

    const recentInquiryWeek = dailyInquiryTrend.slice(-7).map((p) => p.count)
    const prevInquiryWeek = dailyInquiryTrend.slice(0, 7).map((p) => p.count)

    const trends: StatTrends = {
      todayInquiries: computeTrend(recentInquiryWeek, prevInquiryWeek),
      followingCustomers: { direction: "stable", percent: 0 },
      pendingTasks: { direction: "stable", percent: 0 },
      activeProjects: { direction: "stable", percent: 0 },
    }

    // —— KPI 较上周同期对比 ——
    function computeKpiComparison(
      metric: string,
      label: string,
      current: number,
      previous: number,
    ): KpiComparison {
      const changePercent = previous > 0
        ? Math.round(((current - previous) / previous) * 100)
        : 0
      return { metric, label, current, previous, changePercent }
    }

    const recentRate = recentWeekInquiryCount > 0
      ? Math.round((recentWeekReplied / recentWeekInquiryCount) * 100)
      : 0
    const prevRate = prevWeekInquiryCount > 0
      ? Math.round((prevWeekReplied / prevWeekInquiryCount) * 100)
      : 0

    const comparisons: DashboardComparisons = {
      inquiryVolume: computeKpiComparison(
        "inquiryVolume",
        "询盘量",
        recentWeekInquiryCount,
        prevWeekInquiryCount,
      ),
      responseRate: computeKpiComparison(
        "responseRate",
        "回复率",
        recentRate,
        prevRate,
      ),
    }

    // 变化量 = 今日 - 昨日
    const todayInquiriesChange =
      yesterdayCount > 0
        ? Math.round(((todayCount - yesterdayCount) / yesterdayCount) * 100)
        : todayCount > 0
          ? 100
          : 0

    const stats: DashboardStats = {
      todayInquiries: todayCount,
      todayInquiriesChange,
      followingCustomers: uniqueCompanies.size,
      pendingTasks: pendingCount,
      urgentCount,
      activeProjects: activeProjectCount,
      weeklyWorkflowRuns: weeklyData,
      dailyInquiryTrend,
      activeClientAlerts,
      geoDistribution,
      riskRadar,
      industrySentiments,
      predictiveIndicators,
      sparklines,
      trends,
      comparisons,
    }

    return successResponse(stats)
  } catch (error) {
    logger.error("GET /api/dashboard/stats: 失败", {
      error: error instanceof Error ? error.message : "未知错误",
    })
    return errorResponse("服务器内部错误")
  }
}, "VIEWER")
