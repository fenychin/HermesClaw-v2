/**
 * Dashboard（动态大盘）领域类型
 * —— 对应 PRD 10.3，覆盖活动流、KPI 指标、询盘趋势、客户预警、报告等统一类型
 */

import type { ImpactLevel } from "@/types/trade"

// ============================================================
// 活动流
// ============================================================

/** 活动流统一条目（服务端 & 客户端共享） */
export interface FeedItem {
  id: string
  type: "intelligence" | "agent"
  title: string
  summary: string
  timestamp: string
  meta: Record<string, unknown>
}

// ============================================================
// 严重程度映射
// ============================================================

/** 活动流展示用严重程度 */
export type ActivitySeverity = "urgent" | "important" | "normal"

/** 从 MarketIntelligence.impactLevel 推导展示严重程度 */
export function mapImpactToSeverity(impactLevel: ImpactLevel): ActivitySeverity {
  if (impactLevel === "high") return "urgent"
  if (impactLevel === "mid") return "important"
  return "normal"
}

/** 从 AgentLog.riskLevel 推导展示严重程度 */
export function mapRiskToSeverity(riskLevel: string | null | undefined): ActivitySeverity {
  if (riskLevel === "high") return "urgent"
  if (riskLevel === "medium") return "important"
  return "normal"
}

// ============================================================
// 询盘趋势折线图
// ============================================================

/** 单日询盘数据点（近 14 天趋势折线图） */
export interface DailyInquiryPoint {
  date: string      // "MM-DD"
  count: number
}

// ============================================================
// 客户活跃预警
// ============================================================

/** 活跃客户预警条目（近 7 天高频询盘客户） */
export interface ActiveClientAlert {
  companyName: string
  countryFlag: string
  country: string
  /** 近 7 天询盘数 */
  recentCount: number
  /** 最近一次询盘时间（ISO） */
  lastInquiryAt: string
}

// ============================================================
// 报告
// ============================================================

/** AI 报告类型（晨报/晚报/周报） */
export type ReportType = "MORNING" | "EVENING" | "WEEKLY"

// ============================================================
// 地理分布（世界贸易热力图）
// ============================================================

/** 地理分布数据点（国家 → 活动量映射） */
export interface GeoDistributionPoint {
  countryCode: string   // ISO 3166-1 alpha-2
  countryName: string
  inquiryCount: number
  intelCount: number
  totalActivity: number // 综合活动量 = inquiryCount + intelCount * 2
  flag: string          // emoji 国旗
}

// ============================================================
// 风险雷达图
// ============================================================

/** 风险维度键 */
export type RiskDimensionKey = "currency" | "tariff" | "logistics" | "competition" | "market"

/** 风险维度（雷达图单轴） */
export interface RiskDimension {
  key: RiskDimensionKey
  label: string           // "汇率风险"、"关税风险"…
  score: number           // 0-100
  trend: "up" | "down" | "stable"
}

/** 风险维度中文标签映射 */
export const RISK_DIMENSION_LABELS: Record<RiskDimensionKey, string> = {
  currency: "汇率风险",
  tariff: "关税风险",
  logistics: "物流风险",
  competition: "竞争风险",
  market: "市场需求",
}

/** 情报类型到风险维度的映射 */
export const INTEL_TYPE_TO_RISK: Record<string, RiskDimensionKey> = {
  currency: "currency",
  tariff: "tariff",
  logistics: "logistics",
  competitor: "competition",
  market: "market",
}

// ============================================================
// 行业情绪仪表
// ============================================================

/** 行业情绪条目 */
export interface IndustrySentiment {
  sector: string          // "电子"、"纺织"、"机械"、"化工"、"农业"
  sentiment: "bullish" | "bearish" | "neutral"
  score: number           // -100 到 +100
  confidence: number      // 0-1
}

/** MVP 阶段监测的五大外贸行业 */
export const MONITORED_SECTORS = ["电子", "纺织", "机械", "化工", "农业"] as const

// ============================================================
// 预测指标
// ============================================================

/** 预测指标 */
export interface PredictiveIndicator {
  metric: string          // "inquiry_volume" | "exchange_rate" | "risk_level"
  direction: "up" | "down" | "stable"
  confidence: number      // 0-1
  changePercent: number   // 预计变化百分比
}

// ============================================================
// 迷你趋势线（Sparkline + TrendIndicator）
// ============================================================

/** 趋势方向指示器 */
export interface TrendIndicator {
  direction: "up" | "down" | "stable"
  percent: number
}

/** 指标卡 sparkline 数据映射 */
export interface StatSparklines {
  todayInquiries: number[]
  followingCustomers: number[]
  pendingTasks: number[]
  activeProjects: number[]
}

/** 指标卡趋势映射 */
export interface StatTrends {
  todayInquiries: TrendIndicator
  followingCustomers: TrendIndicator
  pendingTasks: TrendIndicator
  activeProjects: TrendIndicator
}

// ============================================================
// KPI 对比（较上周同期）
// ============================================================

/** 单个 KPI 对比条目 */
export interface KpiComparison {
  metric: string
  label: string          // "询盘量"、"回复率"
  current: number
  previous: number
  changePercent: number
}

/** 大盘 KPI 对比集合 */
export interface DashboardComparisons {
  inquiryVolume: KpiComparison
  responseRate: KpiComparison
}
