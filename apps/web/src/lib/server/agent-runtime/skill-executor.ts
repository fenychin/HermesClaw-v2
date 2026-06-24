/**
 * Skill Executor — 9 个 Skill 实现
 *
 * 三域原则第三域（Industry Pack Layer）：
 * - 每个 Skill 产出符合 event-contracts Zod schema 的数据
 * - 调用 emitIntelEvent() 向 SSE 订阅者广播
 * - 不在此写入策略决策或记忆管理（Hermes 权限）
 *
 * 接入状态：
 * - ✅ Phase 2 已接入（真实数据 + LLM 推理）：
 *     - skill-radar-score-compute  → Tavily 8 维度新闻搜索 + DeepSeek 评分
 * - 🚧 Phase 1 计算桩（DB 统计 + 随机扰动）：
 *     - 其余 8 个 skill，待 Phase 2 后续迭代逐步接入
 */
import {
  IntelFlowTickSchema,
  IntelSignalDetectedSchema,
  IntelTopologyUpdatedSchema,
  IntelAlertTacticalSchema,
  IntelEvolutionProposalCreatedSchema,
  IntelAgentHeartbeatSchema,
} from "@hermesclaw/event-contracts"
import type {
  IntelFlowTick,
  IntelSignalDetected,
  IntelTopologyUpdated,
  IntelAlertTactical,
  IntelEvolutionProposalCreated,
  IntelAgentHeartbeat,
} from "@hermesclaw/event-contracts"
import {
  emitIntelEvent,
  searchWebBatch,
  isTavilyAvailable,
  type TavilySearchResultItem,
} from "@hermesclaw/openclaw-adapter"
import { callDeepSeekJson, isProviderAvailable } from "../llm-provider"
import { logger } from "../../logger"
import type { PrismaClient } from "@/generated/prisma-v2/client"
import type { Prisma } from "@/generated/prisma-v2/client"

// ─── 内部工具 ──────────────────────────────────────────────────────────

let tickSeq = 0
let signalSeq = 0
let alertSeq = 0
let proposalSeq = 0
let heartbeatSeq = 0

function nextTickSeq() { return ++tickSeq }
function nextSignalSeq() { return ++signalSeq }
function nextAlertSeq() { return ++alertSeq }
function nextProposalSeq() { return ++proposalSeq }
function nextHeartbeatSeq() { return ++heartbeatSeq }

function rand(min: number, max: number) { return Math.round((Math.random() * (max - min) + min) * 100) / 100 }
function randInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min }
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }

function nowISO(): string { return new Date().toISOString() }

const REGIONS = ["CN", "EU", "US", "SEA", "MEA"]
const SIGNAL_CATEGORIES = ["market-anomaly", "competitor-move", "compliance-risk"] as const

// ─── Skill 执行上下文 ─────────────────────────────────────────────────

export interface SkillExecContext {
  workspaceId: string
  industryId: string
  agentId: string
  /** Prisma 客户端，供 skill 读取 DB 真实数据 */
  prisma: PrismaClient
}

export interface SkillExecResult {
  status: "completed" | "failed"
  eventsEmitted: string[]
  output?: unknown
  error?: string
}

// ─── 1. skill-radar-score-compute ──────────────────────────────────────

const RADAR_DIMENSIONS = [
  { key: "market-heat", label: "市场热度", queries: ["全球市场行情 热度", "global market hot sectors"] },
  { key: "competitor-intensity", label: "竞对强度", queries: ["头部企业竞争 行业格局", "competitor moves industry"] },
  { key: "policy-risk", label: "政策风险", queries: ["贸易政策 关税 制裁 最新", "trade policy tariff sanction news"] },
  { key: "capital-flow", label: "资金流向", queries: ["跨境资本流动 外资", "cross-border capital flow"] },
  { key: "tech-change", label: "技术变化", queries: ["AI 半导体 新能源 技术突破", "technology breakthrough AI chip"] },
  { key: "sentiment", label: "舆情温度", queries: ["市场舆情 投资者情绪", "market sentiment investor mood"] },
  { key: "supply-chain", label: "供应链压力", queries: ["全球供应链 物流 港口", "global supply chain disruption"] },
  { key: "regulatory-density", label: "监管密度", queries: ["监管 新法规 合规 中国 欧盟", "regulation compliance new rules"] },
]

const POLICY_KEYWORDS = [
  "碳边境税", "新能源补贴", "数据安全法", "出口管制", "反补贴调查",
  "ESG披露", "跨境数据流动", "芯片法案", "绿色贸易壁垒", "数字税",
]

/**
 * LLM 评分输入：8 个维度的真实搜索结果 + DB 上下文。
 * LLM 输出：每维度 0-100 分（带 delta、reasoning、引用源 URL）。
 */
interface LlmRadarScore {
  dimensions: Array<{
    key: string
    value: number
    delta: number
    confidence: number
    reasoning: string
    sourceUrls: string[]
  }>
  generatedAt: string
  modelUsed: string
}

const RADAR_LLM_SCHEMA = {
  type: "object",
  properties: {
    dimensions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          value: { type: "number", minimum: 0, maximum: 100 },
          delta: { type: "number", minimum: -50, maximum: 50 },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          reasoning: { type: "string" },
          sourceUrls: { type: "array", items: { type: "string" } },
        },
        required: ["key", "value", "delta", "confidence", "reasoning"],
      },
    },
  },
  required: ["dimensions"],
} as const

/** 把 Tavily 结果压成 LLM prompt 中的摘要片段（控制 token） */
function summarizeSearchResults(
  dimensionKey: string,
  dimensionLabel: string,
  items: TavilySearchResultItem[],
): string {
  if (items.length === 0) return `[${dimensionLabel}] 无近期数据\n`
  const top = items.slice(0, 3)
  const lines = top.map((r, i) =>
    `  ${i + 1}. ${r.title} (相关性 ${(r.score * 100).toFixed(0)}%)\n     ${r.content.slice(0, 240)}${r.publishedDate ? ` [${r.publishedDate}]` : ""}\n     URL: ${r.url}`
  )
  return `### ${dimensionLabel} (key=${dimensionKey})\n${lines.join("\n")}\n`
}

export async function execRadarScoreCompute(
  _config: Record<string, unknown> | undefined,
  ctx: SkillExecContext,
): Promise<SkillExecResult> {
  const prisma = ctx.prisma

  // ─── Step 1: 内部上下文（DB 统计） ─────────────────────────────
  const [totalProposals, approvedProposals, agentLogHighRisk] = await Promise.all([
    prisma.harnessProposal.count({ where: { workspaceId: ctx.workspaceId } }),
    prisma.harnessProposal.count({ where: { workspaceId: ctx.workspaceId, status: "approved" } }),
    prisma.agentLog.count({ where: { workspaceId: ctx.workspaceId, riskLevel: "high" } }),
  ])
  const internalCtx = {
    totalProposals,
    approvedProposals,
    approvalRate: totalProposals > 0 ? approvedProposals / totalProposals : 0,
    highRiskLogs: agentLogHighRisk,
  }

  // ─── Step 2: 决定执行路径 ─────────────────────────────────────
  const tavilyOk = isTavilyAvailable()
  const llmOk = isProviderAvailable("deepseek") || isProviderAvailable("anthropic")
  const llmMode = tavilyOk && llmOk

  if (!llmMode) {
    logger.warn("[RadarScore] Tavily 或 LLM Key 未配置，降级到 DB 统计模式", {
      tavilyOk, llmOk,
    })
    return execRadarFallback(ctx, internalCtx)
  }

  // ─── Step 3: 8 维度并发全网搜索（每维度 1 个 query，控制 quota） ──
  const searchQueries = RADAR_DIMENSIONS.map((d) => d.queries[0])
  const t0 = Date.now()
  const searchResults = await searchWebBatch(searchQueries, {
    searchDepth: "basic",
    topic: "news",
    days: 7,
    maxResults: 5,
    includeAnswer: false,
  })
  const searchMs = Date.now() - t0
  logger.info("[RadarScore] Tavily 8 维度搜索完成", { searchMs })

  // ─── Step 4: 拼接 LLM prompt ──────────────────────────────────
  const searchSummary = RADAR_DIMENSIONS.map((dim, i) => {
    const result = searchResults[i]
    return summarizeSearchResults(dim.key, dim.label, result?.results ?? [])
  }).join("\n")

  const systemPrompt = `你是 HermesClaw 行业情报中心的战略评分引擎。
你的职责：基于过去 7 天的全网真实新闻与本地内部统计，输出 8 个维度的战略雷达评分 (0-100)。

评分规则：
- value: 当前态势强度（0=无信号、50=正常、100=极端高位）
- delta: 相比上一周期的变化（正数=上升、负数=下降）
- confidence: 你对该评分的置信度（0-1）
- reasoning: 50字以内中文简述，引用具体新闻事实
- sourceUrls: 从搜索结果中挑选 1-3 条最有支撑力的 URL

输出严格遵守 JSON Schema，不要任何额外字段。`

  const userPrompt = `# 内部上下文 (HermesClaw 数据库统计)
- 治理提案总数: ${internalCtx.totalProposals}
- 已批准提案数: ${internalCtx.approvedProposals}
- 提案批准率: ${(internalCtx.approvalRate * 100).toFixed(1)}%
- 高风险日志数: ${internalCtx.highRiskLogs}

# 8 维度全网搜索结果 (Tavily, 近 7 天新闻)
${searchSummary}

# 任务
对以上 8 个维度逐一打分。注意：
- 必须从上面真实搜索结果中提取事实，不能编造
- 若某维度搜索结果为空或无关，给出 confidence < 0.3 的低置信评分
- value 取整，delta 可以为负

请返回完整的 dimensions 数组（必须包含全部 ${RADAR_DIMENSIONS.length} 个维度，key 与上述列表一致）。`

  let llmResult: LlmRadarScore | null = null
  try {
    const raw = (await callDeepSeekJson({
      systemPrompt,
      userPrompt,
      maxTokens: 3000,
      temperature: 0.3,
    })) as { dimensions?: LlmRadarScore["dimensions"] }

    if (!raw.dimensions || !Array.isArray(raw.dimensions) || raw.dimensions.length === 0) {
      throw new Error("LLM 返回的 dimensions 字段缺失或为空")
    }

    llmResult = {
      dimensions: raw.dimensions,
      generatedAt: nowISO(),
      modelUsed: "deepseek-chat",
    }
  } catch (err) {
    logger.error("[RadarScore] LLM 评分失败，降级到 DB 统计模式", {
      error: err instanceof Error ? err.message : String(err),
    })
    return execRadarFallback(ctx, internalCtx)
  }

  // ─── Step 5: 对照预期 schema 补齐缺失维度 ─────────────────────
  const dimMap = new Map(llmResult.dimensions.map((d) => [d.key, d]))
  const finalDims = RADAR_DIMENSIONS.map((d) => {
    const llmDim = dimMap.get(d.key)
    if (llmDim) {
      return {
        key: d.key,
        label: d.label,
        value: Math.max(0, Math.min(100, Math.round(llmDim.value))),
        delta: Math.round(llmDim.delta),
        confidence: llmDim.confidence,
        reasoning: llmDim.reasoning,
        sourceUrls: llmDim.sourceUrls ?? [],
        source: "llm+tavily",
      }
    }
    // LLM 漏了该维度，用 fallback 填充
    return {
      key: d.key,
      label: d.label,
      value: 50,
      delta: 0,
      confidence: 0.1,
      reasoning: "LLM 未返回该维度",
      sourceUrls: [],
      source: "fallback",
    }
  })

  // ─── Step 6: 高分维度产出 IntelSignal SSE 事件 ────────────────
  const events: string[] = []
  for (const dim of finalDims) {
    if (dim.value >= 70 && dim.confidence >= 0.5) {
      const signal: IntelSignalDetected = IntelSignalDetectedSchema.parse({
        eventType: "intel.signal.detected",
        signalId: `sig-radar-${nextSignalSeq()}`,
        title: `${dim.label} 得分偏高 (${dim.value}) — ${dim.reasoning.slice(0, 40)}`,
        threatLevel: dim.value >= 85 ? "L3" : dim.value >= 75 ? "L2" : "L1",
        confidence: dim.confidence,
        source: "radar-score-compute",
        detectedAt: nowISO(),
        version: "1.0.0",
      })
      emitIntelEvent(signal)
      events.push(signal.signalId)
    }
  }

  return {
    status: "completed",
    eventsEmitted: events,
    output: {
      dimensions: finalDims,
      generatedAt: nowISO(),
      modelUsed: llmResult.modelUsed,
      searchMs,
      sourcesUsed: finalDims.reduce((acc, d) => acc + d.sourceUrls.length, 0),
      internalContext: internalCtx,
      mode: "llm+tavily",
    },
  }
}

/** A1 雷达评分降级：当 Tavily/LLM 不可用时使用纯 DB 统计 + 随机扰动。 */
async function execRadarFallback(
  ctx: SkillExecContext,
  internalCtx: { approvalRate: number; highRiskLogs: number },
): Promise<SkillExecResult> {
  const _prisma = ctx.prisma
  const approvalRate = internalCtx.approvalRate
  const alertRate = Math.min(1, internalCtx.highRiskLogs / 100)

  const dims = RADAR_DIMENSIONS.map((d) => {
    let value = 50
    switch (d.key) {
      case "market-heat": value = Math.round(40 + approvalRate * 50 + randInt(-5, 10)); break
      case "competitor-intensity": value = Math.round(35 + alertRate * 60 + randInt(-5, 10)); break
      case "policy-risk": value = Math.round(30 + (1 - approvalRate) * 70 + randInt(-8, 8)); break
      case "capital-flow": value = Math.round(45 + approvalRate * 45 + randInt(-10, 5)); break
      case "tech-change": value = Math.round(50 + randInt(-10, 10)); break
      case "sentiment": value = Math.round(45 + (1 - alertRate) * 40 + randInt(-5, 10)); break
      case "supply-chain": value = Math.round(40 + randInt(-5, 15)); break
      case "regulatory-density": value = Math.round(35 + alertRate * 55 + randInt(-5, 10)); break
    }
    return {
      key: d.key,
      label: d.label,
      value: Math.max(5, Math.min(100, value)),
      delta: randInt(-10, 15),
      confidence: 0.4,
      reasoning: "降级模式：基于内部统计估算",
      sourceUrls: [],
      source: "db-fallback",
    }
  })

  const events: string[] = []
  for (const dim of dims) {
    if (dim.value >= 80) {
      const signal: IntelSignalDetected = IntelSignalDetectedSchema.parse({
        eventType: "intel.signal.detected",
        signalId: `sig-radar-${nextSignalSeq()}`,
        title: `${dim.label} 得分偏高 (${dim.value}) [降级模式]`,
        threatLevel: dim.value >= 90 ? "L3" : "L2",
        confidence: 0.4,
        source: "radar-score-compute-fallback",
        detectedAt: nowISO(),
        version: "1.0.0",
      })
      emitIntelEvent(signal)
      events.push(signal.signalId)
    }
  }

  return {
    status: "completed",
    eventsEmitted: events,
    output: {
      dimensions: dims,
      generatedAt: nowISO(),
      mode: "db-fallback",
      internalContext: internalCtx,
    },
  }
}

// ─── 2. skill-policy-nlp-scan ─────────────────────────────────────────

/** LLM 提取的政策热词 + 热度评分 */
interface LlmPolicyHotwords {
  hotwords: Array<{
    word: string
    heat: number // 0-100
    threatLevel: "L1" | "L2" | "L3"
    reasoning: string
    sourceUrls: string[]
    region?: string
  }>
}

const POLICY_HOTWORD_SCHEMA = {
  type: "object",
  properties: {
    hotwords: {
      type: "array",
      items: {
        type: "object",
        properties: {
          word: { type: "string" },
          heat: { type: "number", minimum: 0, maximum: 100 },
          threatLevel: { type: "string", enum: ["L1", "L2", "L3"] },
          reasoning: { type: "string" },
          sourceUrls: { type: "array", items: { type: "string" } },
          region: { type: "string" },
        },
        required: ["word", "heat", "threatLevel", "reasoning"],
      },
    },
  },
  required: ["hotwords"],
} as const

export async function execPolicyNlpScan(
  _config: Record<string, unknown> | undefined,
  ctx: SkillExecContext,
): Promise<SkillExecResult> {
  // ─── 决定路径 ─────────────────────────────────────────────────
  const tavilyOk = isTavilyAvailable()
  const llmOk = isProviderAvailable("deepseek") || isProviderAvailable("anthropic")

  if (!tavilyOk || !llmOk) {
    logger.warn("[PolicyNlpScan] Tavily/LLM Key 未配置，降级到字典模式", { tavilyOk, llmOk })
    return execPolicyNlpFallback()
  }

  // ─── Step 1: 多区域政策新闻搜索（3 条 query 控 quota）─────────
  const policyQueries = [
    "China EU US 贸易政策 最新关税 出口管制 2026",
    "global trade policy tariff sanction news this week",
    "中国 政策法规 最新发布 跨境 监管",
  ]
  const t0 = Date.now()
  const searchResults = await searchWebBatch(policyQueries, {
    searchDepth: "basic",
    topic: "news",
    days: 7,
    maxResults: 6,
  })
  const searchMs = Date.now() - t0

  // 收集所有真实新闻条目（去重）
  const seenUrls = new Set<string>()
  const newsItems: TavilySearchResultItem[] = []
  for (const r of searchResults) {
    if (!r) continue
    for (const item of r.results) {
      if (!seenUrls.has(item.url)) {
        seenUrls.add(item.url)
        newsItems.push(item)
      }
    }
  }

  if (newsItems.length === 0) {
    logger.warn("[PolicyNlpScan] 搜索结果为空，降级到字典模式")
    return execPolicyNlpFallback()
  }

  // ─── Step 2: LLM 抽取热词 ────────────────────────────────────
  const newsSummary = newsItems.slice(0, 12).map((n, i) =>
    `${i + 1}. ${n.title}\n   ${n.content.slice(0, 200)}${n.publishedDate ? ` [${n.publishedDate}]` : ""}\n   URL: ${n.url}`
  ).join("\n")

  const systemPrompt = `你是 HermesClaw 的政策情报分析师。
基于过去 7 天的真实新闻，提取 5-8 个最有信号价值的政策热词。

要求：
- 每个 hotword 是一个 2-6 字的中文术语（如"碳关税"、"出口管制"）
- heat (0-100)：综合新闻条数、发布日期新鲜度、内容严重性
- threatLevel：L1=关注、L2=警示、L3=高危
- reasoning：50 字内说明为何上榜
- sourceUrls：从下方新闻中挑选 1-3 条支撑链接
- region 可选：cn/us/eu/sea/me 等

严格按 JSON Schema 输出，禁止编造新闻里没有的事实。`

  const userPrompt = `# 近 7 天真实政策新闻 (${newsItems.length} 条已合并去重)
${newsSummary}

请提取 5-8 个热词。`

  let llmResult: LlmPolicyHotwords
  try {
    const raw = (await callDeepSeekJson({
      systemPrompt,
      userPrompt,
      maxTokens: 2500,
      temperature: 0.3,
    })) as LlmPolicyHotwords

    if (!raw.hotwords || !Array.isArray(raw.hotwords) || raw.hotwords.length === 0) {
      throw new Error("LLM 返回的 hotwords 字段缺失或为空")
    }
    llmResult = raw
  } catch (err) {
    logger.error("[PolicyNlpScan] LLM 抽词失败，降级到字典模式", {
      error: err instanceof Error ? err.message : String(err),
    })
    return execPolicyNlpFallback()
  }

  // ─── Step 3: 高热度热词发射 IntelSignal ──────────────────────
  const events: string[] = []
  for (const hw of llmResult.hotwords) {
    if (hw.heat >= 60) {
      const signal: IntelSignalDetected = IntelSignalDetectedSchema.parse({
        eventType: "intel.signal.detected",
        signalId: `sig-policy-${nextSignalSeq()}`,
        title: `政策热词"${hw.word}"热度 ${hw.heat} — ${hw.reasoning.slice(0, 40)}`,
        threatLevel: hw.threatLevel,
        confidence: 0.85,
        source: "policy-nlp-scan",
        detectedAt: nowISO(),
        region: hw.region,
        version: "1.0.0",
      })
      emitIntelEvent(signal)
      events.push(signal.signalId)
    }
  }

  return {
    status: "completed",
    eventsEmitted: events,
    output: {
      hotwords: llmResult.hotwords,
      newsScanned: newsItems.length,
      searchMs,
      mode: "llm+tavily",
      scannedAt: nowISO(),
    },
  }
}

/** 降级：随机选字典里的词 */
function execPolicyNlpFallback(): SkillExecResult {
  const keyword = pick(POLICY_KEYWORDS)
  const region = pick(REGIONS)
  const heatScore = randInt(40, 95)
  const signal: IntelSignalDetected = IntelSignalDetectedSchema.parse({
    eventType: "intel.signal.detected",
    signalId: `sig-policy-${nextSignalSeq()}`,
    title: `政策热词"${keyword}"热度${heatScore} (${region}) [降级]`,
    threatLevel: heatScore >= 80 ? "L3" : heatScore >= 60 ? "L2" : "L1",
    confidence: 0.4,
    source: "policy-nlp-scan-fallback",
    detectedAt: nowISO(),
    region,
    version: "1.0.0",
  })
  emitIntelEvent(signal)
  return {
    status: "completed",
    eventsEmitted: [signal.signalId],
    output: {
      hotwords: [{ word: keyword, heat: heatScore, threatLevel: signal.threatLevel, reasoning: "降级字典", sourceUrls: [] }],
      mode: "db-fallback",
      scannedAt: nowISO(),
    },
  }
}

// ─── 3. skill-event-signal-classify ───────────────────────────────────

export async function execEventSignalClassify(
  _config: Record<string, unknown> | undefined,
  ctx: SkillExecContext,
): Promise<SkillExecResult> {
  const category = pick([...SIGNAL_CATEGORIES])
  const region = pick(REGIONS)

  const signal: IntelSignalDetected = IntelSignalDetectedSchema.parse({
    eventType: "intel.signal.detected",
    signalId: `sig-classify-${nextSignalSeq()}`,
    title: `${category === "market-anomaly" ? "市场异常" : category === "competitor-move" ? "竞对动向" : "合规风险"} 检测 — ${region}`,
    threatLevel: pick(["L1", "L2", "L1"]),
    confidence: 0.6 + Math.random() * 0.35,
    source: "event-signal-classify",
    detectedAt: nowISO(),
    region,
    version: "1.0.0",
  })
  emitIntelEvent(signal)

  return {
    status: "completed",
    eventsEmitted: [signal.signalId],
    output: { category, region, classifiedAt: nowISO() },
  }
}

// ─── 4. skill-market-flow-tick ────────────────────────────────────────

/**
 * A2 基线缓存：5min TTL
 *
 * A2 心跳是 30s 一次（高频 tick），不可能每次都跑 Tavily+LLM。
 * 策略：
 * - 5min 拉一次新闻 + LLM 算出基线 capitalFlowIndex/volumeIndex
 * - 30s 高频 tick 在基线附近做受限随机游走，反映真实情绪但不爆 quota
 * - 基线过期前命中缓存，零外部调用
 */
interface MarketBaseline {
  capitalBase: number
  volumeBase: number
  region: string
  reasoning: string
  computedAt: number
  expiresAt: number
}
let marketBaseline: MarketBaseline | null = null
let lastTick: { capital: number; volume: number } | null = null
const BASELINE_TTL_MS = 5 * 60 * 1000

interface LlmMarketSentiment {
  capitalFlowIndex: number // 0-100
  volumeIndex: number // 0-100
  region: string
  reasoning: string
  sourceUrls: string[]
}

const MARKET_SENTIMENT_SCHEMA = {
  type: "object",
  properties: {
    capitalFlowIndex: { type: "number", minimum: 0, maximum: 100 },
    volumeIndex: { type: "number", minimum: 0, maximum: 100 },
    region: { type: "string" },
    reasoning: { type: "string" },
    sourceUrls: { type: "array", items: { type: "string" } },
  },
  required: ["capitalFlowIndex", "volumeIndex", "region", "reasoning"],
} as const

async function refreshMarketBaseline(): Promise<MarketBaseline | null> {
  if (!isTavilyAvailable() || (!isProviderAvailable("deepseek") && !isProviderAvailable("anthropic"))) {
    return null
  }

  const queries = [
    "global market capital flow stock bond ETF this week",
    "市场成交量 资金流向 北向 南向 港股 美股 最新",
  ]
  const searchResults = await searchWebBatch(queries, {
    searchDepth: "basic",
    topic: "news",
    days: 3,
    maxResults: 6,
  })

  const seenUrls = new Set<string>()
  const newsItems: TavilySearchResultItem[] = []
  for (const r of searchResults) {
    if (!r) continue
    for (const item of r.results) {
      if (!seenUrls.has(item.url)) {
        seenUrls.add(item.url)
        newsItems.push(item)
      }
    }
  }

  if (newsItems.length === 0) return null

  const newsSummary = newsItems.slice(0, 10).map((n, i) =>
    `${i + 1}. ${n.title}\n   ${n.content.slice(0, 200)}\n   URL: ${n.url}`
  ).join("\n")

  const systemPrompt = `你是 HermesClaw 的市场情绪量化引擎。
基于近 3 天真实金融新闻，输出当前市场基线指数。

指标定义：
- capitalFlowIndex (0-100): 资金流向净额情绪。0=极度避险流出、50=中性、100=强烈流入。
- volumeIndex (0-100): 市场成交活跃度。0=极度冷清、50=正常、100=极度活跃。
- region: 主导该评估的市场 (cn/us/eu/sea/global)
- reasoning: 50字内中文说明
- sourceUrls: 1-3 条支撑新闻

严格按 schema 输出。`

  const userPrompt = `# 近 3 天金融市场新闻
${newsSummary}

请输出当前市场基线指数。`

  try {
    const raw = (await callDeepSeekJson({
      systemPrompt,
      userPrompt,
      maxTokens: 1000,
      temperature: 0.4,
    })) as LlmMarketSentiment

    const now = Date.now()
    return {
      capitalBase: Math.max(0, Math.min(100, Math.round(raw.capitalFlowIndex))),
      volumeBase: Math.max(0, Math.min(100, Math.round(raw.volumeIndex))),
      region: raw.region ?? "global",
      reasoning: raw.reasoning ?? "",
      computedAt: now,
      expiresAt: now + BASELINE_TTL_MS,
    }
  } catch (err) {
    logger.error("[MarketFlow] LLM 基线计算失败", {
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

/** 在基线附近做受限随机游走，确保连续 tick 平滑过渡 */
function nextTickValue(base: number, last: number | null): number {
  // 上一 tick 朝基线靠拢 + 小幅扰动
  const seed = last ?? base
  const drift = (base - seed) * 0.3 // 朝基线靠拢 30%
  const noise = (Math.random() - 0.5) * 8 // ±4 噪声
  return Math.max(0, Math.min(100, Math.round(seed + drift + noise)))
}

export async function execMarketFlowTick(
  _config: Record<string, unknown> | undefined,
  ctx: SkillExecContext,
): Promise<SkillExecResult> {
  const prisma = ctx.prisma
  let mode: "llm+tavily" | "db-fallback" = "db-fallback"
  let baselineUsed = false

  // ─── Step 1: 检查 / 刷新基线缓存 ──────────────────────────────
  const now = Date.now()
  if (!marketBaseline || now > marketBaseline.expiresAt) {
    const refreshed = await refreshMarketBaseline()
    if (refreshed) {
      marketBaseline = refreshed
      mode = "llm+tavily"
      baselineUsed = true
      logger.info("[MarketFlow] 基线已刷新", {
        capital: refreshed.capitalBase,
        volume: refreshed.volumeBase,
        region: refreshed.region,
      })
    }
  } else {
    mode = "llm+tavily"
    baselineUsed = true
  }

  // ─── Step 2: 计算本次 tick ───────────────────────────────────
  let capitalFlowIndex: number
  let volumeIndex: number
  let region: string

  if (baselineUsed && marketBaseline) {
    capitalFlowIndex = nextTickValue(marketBaseline.capitalBase, lastTick?.capital ?? null)
    volumeIndex = nextTickValue(marketBaseline.volumeBase, lastTick?.volume ?? null)
    region = marketBaseline.region
  } else {
    // 完全降级：用 DB 统计（原逻辑）
    const recentLogs = await prisma.agentLog.findMany({
      where: { workspaceId: ctx.workspaceId, createdAt: { gte: new Date(Date.now() - 300_000) } },
      select: { createdAt: true, riskLevel: true },
    })
    const recentRuns = await prisma.workflowRun.findMany({
      where: { workspaceId: ctx.workspaceId, completedAt: { gte: new Date(Date.now() - 300_000) } },
      select: { id: true },
    })
    const density = Math.min(100, recentLogs.length * 3 + 30)
    const volumeDensity = Math.min(100, recentRuns.length * 5 + 25)
    const highRiskCount = recentLogs.filter((l) => l.riskLevel === "high").length
    const perturbation = highRiskCount > 0 ? randInt(-15, 15) : randInt(-5, 5)
    capitalFlowIndex = Math.max(0, Math.min(100, density + perturbation))
    volumeIndex = Math.max(0, Math.min(100, volumeDensity + randInt(-5, 5)))
    region = pick(REGIONS)
  }

  lastTick = { capital: capitalFlowIndex, volume: volumeIndex }

  const tick: IntelFlowTick = IntelFlowTickSchema.parse({
    eventType: "intel.flow.tick",
    timestamp: nowISO(),
    capitalFlowIndex,
    volumeIndex,
    region,
    version: "1.0.0",
  })
  emitIntelEvent(tick)

  return {
    status: "completed",
    eventsEmitted: ["flow-tick"],
    output: {
      capitalFlowIndex,
      volumeIndex,
      region,
      mode,
      baselineAgeMs: marketBaseline ? now - marketBaseline.computedAt : null,
      baselineReasoning: marketBaseline?.reasoning,
    },
  }
}

// ─── 5. skill-entity-graph-update ─────────────────────────────────────

const SAMPLE_NODES = [
  { id: "n1", label: "光伏组件", category: "product" },
  { id: "n2", label: "欧盟市场", category: "market" },
  { id: "n3", label: "碳边境税", category: "policy" },
  { id: "n4", label: "BYD", category: "company" },
  { id: "n5", label: "东南亚产能", category: "region" },
]

/** LLM 抽取的实体与关系 */
interface LlmEntityGraph {
  entities: Array<{
    label: string
    category: "company" | "product" | "policy" | "market" | "region" | "capital" | "tech" | "energy" | "trade" | "unknown"
    weight: number // 0-1，重要性
    sourceUrl?: string
  }>
  relations: Array<{
    source: string // 实体 label
    target: string // 实体 label
    relation: string // 关系动词，如 "exports_to" / "imposes" / "competes_with"
    weight: number // 0-1
    sourceUrl?: string
  }>
}

const ENTITY_GRAPH_SCHEMA = {
  type: "object",
  properties: {
    entities: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          category: {
            type: "string",
            enum: ["company", "product", "policy", "market", "region", "capital", "tech", "energy", "trade", "unknown"],
          },
          weight: { type: "number", minimum: 0, maximum: 1 },
          sourceUrl: { type: "string" },
        },
        required: ["label", "category", "weight"],
      },
    },
    relations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          source: { type: "string" },
          target: { type: "string" },
          relation: { type: "string" },
          weight: { type: "number", minimum: 0, maximum: 1 },
          sourceUrl: { type: "string" },
        },
        required: ["source", "target", "relation", "weight"],
      },
    },
  },
  required: ["entities", "relations"],
} as const

/** 把 label 转为稳定的 graph node id */
function slugifyEntityId(label: string): string {
  const cleaned = label.replace(/[^a-zA-Z0-9一-龥]/g, "-").slice(0, 30)
  return `entity-${cleaned}`
}

export async function execEntityGraphUpdate(
  _config: Record<string, unknown> | undefined,
  ctx: SkillExecContext,
): Promise<SkillExecResult> {
  const prisma = ctx.prisma
  const tavilyOk = isTavilyAvailable()
  const llmOk = isProviderAvailable("deepseek") || isProviderAvailable("anthropic")

  if (!tavilyOk || !llmOk) {
    logger.warn("[EntityGraph] Tavily/LLM 未配置，降级到日志关键词匹配", { tavilyOk, llmOk })
    return execEntityGraphFallback(ctx)
  }

  // ─── Step 1: 行业新闻搜索 ──────────────────────────────────
  const queries = [
    "全球科技 半导体 新能源 汽车 行业 头部企业 最新",
    "trade tariff policy company impact this week news",
    "中国 海外市场 产能 投资 并购 战略",
  ]
  const t0 = Date.now()
  const searchResults = await searchWebBatch(queries, {
    searchDepth: "basic",
    topic: "news",
    days: 7,
    maxResults: 6,
  })
  const searchMs = Date.now() - t0

  const seenUrls = new Set<string>()
  const newsItems: TavilySearchResultItem[] = []
  for (const r of searchResults) {
    if (!r) continue
    for (const item of r.results) {
      if (!seenUrls.has(item.url)) {
        seenUrls.add(item.url)
        newsItems.push(item)
      }
    }
  }

  if (newsItems.length < 3) {
    logger.warn("[EntityGraph] 搜索结果不足，降级")
    return execEntityGraphFallback(ctx)
  }

  // ─── Step 2: LLM 抽取实体与关系 ─────────────────────────────
  const newsSummary = newsItems.slice(0, 15).map((n, i) =>
    `${i + 1}. ${n.title}\n   ${n.content.slice(0, 220)}\n   URL: ${n.url}`
  ).join("\n")

  const systemPrompt = `你是 HermesClaw 的行业知识图谱抽取引擎。
基于真实新闻，抽取实体节点与它们之间的关系，构建可视化的行业拓扑。

抽取规则：
- entities: 8-15 个核心实体（公司、产品、政策、市场、地区、技术等）
- relations: 8-20 条边（必须连接已抽取的两个实体 label，禁止悬空）
- weight 反映重要性 / 关系强度
- category 必须从枚举中选
- relation 用动词或短语：如 "exports_to" / "imposes" / "invests_in" / "competes_with" / "regulated_by" / "depends_on"
- sourceUrl 引用具体新闻 URL，禁止编造

严格按 JSON Schema 输出。`

  const userPrompt = `# 近 7 天行业新闻 (${newsItems.length} 条)
${newsSummary}

请抽取实体图谱。`

  let llmResult: LlmEntityGraph
  try {
    const raw = (await callDeepSeekJson({
      systemPrompt,
      userPrompt,
      maxTokens: 3500,
      temperature: 0.3,
    })) as LlmEntityGraph

    if (!raw.entities || !Array.isArray(raw.entities) || raw.entities.length === 0) {
      throw new Error("LLM 返回 entities 缺失")
    }
    // 校验 weight 有效性（防止 LLM 返回 NaN 落在 Zod 校验层）
    for (const e of raw.entities) {
      if (typeof e.weight !== "number" || !Number.isFinite(e.weight)) {
        e.weight = 0.5
      }
    }
    if (raw.relations) {
      for (const r of raw.relations) {
        if (typeof r.weight !== "number" || !Number.isFinite(r.weight)) {
          r.weight = 0.5
        }
      }
    }
    llmResult = raw
  } catch (err) {
    logger.error("[EntityGraph] LLM 抽取失败，降级", {
      error: err instanceof Error ? err.message : String(err),
    })
    return execEntityGraphFallback(ctx)
  }

  // ─── Step 3: 实体 + 连接器节点 ──────────────────────────────
  const labelToId = new Map<string, string>()
  const added: { id: string; label: string; category: string; weight?: number }[] = []
  for (const e of llmResult.entities) {
    if (labelToId.has(e.label)) continue
    const id = slugifyEntityId(e.label)
    labelToId.set(e.label, id)
    added.push({
      id,
      label: e.label,
      category: e.category,
      weight: Math.max(0.1, Math.min(1, e.weight)),
    })
  }

  // 连接器节点
  const connectors = await prisma.connector.findMany({
    where: { workspaceId: ctx.workspaceId },
    select: { id: true, name: true },
    take: 6,
  })
  for (const c of connectors) {
    const cid = `connector-${c.id}`
    added.push({ id: cid, label: c.name, category: "capital", weight: 0.5 })
  }

  // ─── Step 4: 边（实体-实体 + 连接器-实体）──────────────────────
  const edges: { id: string; source: string; target: string; relation: string; weight?: number }[] = []
  let edgeSeq = 0

  for (const rel of llmResult.relations) {
    const sid = labelToId.get(rel.source)
    const tid = labelToId.get(rel.target)
    if (!sid || !tid || sid === tid) continue
    edges.push({
      id: `e-llm-${Date.now()}-${edgeSeq++}`,
      source: sid,
      target: tid,
      relation: rel.relation,
      weight: Math.max(0.1, Math.min(1, rel.weight)),
    })
  }

  // 连接器→部分头部实体（确保连接器不孤立）
  const topEntityIds = added.filter((n) => n.id.startsWith("entity-")).slice(0, 3).map((n) => n.id)
  for (const c of connectors) {
    for (const eid of topEntityIds) {
      edges.push({
        id: `e-conn-${Date.now()}-${edgeSeq++}`,
        source: `connector-${c.id}`,
        target: eid,
        relation: "provides_data_for",
        weight: 0.4,
      })
    }
  }

  const event: IntelTopologyUpdated = IntelTopologyUpdatedSchema.parse({
    eventType: "intel.topology.updated",
    added,
    removed: [],
    updated: edges,
    timestamp: nowISO(),
    version: "1.0.0",
  })
  emitIntelEvent(event)

  return {
    status: "completed",
    eventsEmitted: ["topology-updated"],
    output: {
      nodes: added,
      edges,
      addedCount: added.length,
      updatedCount: edges.length,
      newsScanned: newsItems.length,
      searchMs,
      mode: "llm+tavily",
    },
  }
}

/** A3 降级：原来基于 AgentLog 关键词匹配的实现 */
async function execEntityGraphFallback(ctx: SkillExecContext): Promise<SkillExecResult> {
  const prisma = ctx.prisma
  const recentLogs = await prisma.agentLog.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, taskName: true, source: true, riskLevel: true },
  })
  const connectors = await prisma.connector.findMany({
    where: { workspaceId: ctx.workspaceId },
    select: { id: true, name: true },
    take: 10,
  })

  const entitySet = new Set<string>()
  const CATEGORY_KW: Record<string, string[]> = {
    company: ["BYD", "华为", "阿里", "腾讯", "特斯拉", "苹果"],
    product: ["组件", "芯片", "电池", "光伏", "新能源"],
    policy: ["政策", "关税", "制裁", "补贴", "监管"],
    market: ["欧盟", "美国", "东南亚"],
    region: ["中国", "EU", "US", "SEA"],
    tech: ["5G", "AI", "云计算"],
  }
  const added: { id: string; label: string; category: string; weight?: number }[] = []
  for (const log of recentLogs) {
    const text = `${log.taskName} ${log.source}`.toLowerCase()
    for (const [category, keywords] of Object.entries(CATEGORY_KW)) {
      for (const kw of keywords) {
        if (text.includes(kw.toLowerCase()) && !entitySet.has(kw)) {
          entitySet.add(kw)
          added.push({ id: slugifyEntityId(kw), label: kw, category, weight: 0.5 + Math.random() * 0.5 })
        }
      }
    }
  }
  for (const c of connectors) {
    const cid = `connector-${c.id}`
    if (!entitySet.has(cid)) {
      entitySet.add(cid)
      added.push({ id: cid, label: c.name, category: "capital", weight: 0.7 })
    }
  }
  if (added.length === 0) {
    added.push(...SAMPLE_NODES.map((n) => ({ ...n, weight: 0.7 })))
  }

  const edges: { id: string; source: string; target: string; relation: string; weight?: number }[] = []
  const entityNodes = added.filter((n) => n.id.startsWith("entity-"))
  const connectorNodes = added.filter((n) => n.id.startsWith("connector-"))
  let edgeSeq = 0
  for (const cn of connectorNodes) {
    for (const en of entityNodes.slice(0, 3)) {
      edges.push({
        id: `e-fb-${Date.now()}-${edgeSeq++}`,
        source: cn.id,
        target: en.id,
        relation: "provides_data_for",
        weight: 0.5,
      })
    }
  }

  const event: IntelTopologyUpdated = IntelTopologyUpdatedSchema.parse({
    eventType: "intel.topology.updated",
    added,
    removed: [],
    updated: edges,
    timestamp: nowISO(),
    version: "1.0.0",
  })
  emitIntelEvent(event)

  return {
    status: "completed",
    eventsEmitted: ["topology-updated"],
    output: { nodes: added, edges, addedCount: added.length, updatedCount: edges.length, mode: "db-fallback" },
  }
}

// ─── 6. skill-hypothesis-parse ────────────────────────────────────────

export async function execHypothesisParse(
  _config: Record<string, unknown> | undefined,
  ctx: SkillExecContext,
): Promise<SkillExecResult> {
  // 纯内部 Skill，不发射 SSE 事件
  return {
    status: "completed",
    eventsEmitted: [],
    output: {
      parsedHypothesis: "结构化假设已生成",
      confidence: rand(0.6, 0.95),
      parsedAt: nowISO(),
    },
  }
}

// ─── 7. skill-scenario-tree-build ─────────────────────────────────────

/** LLM 输出：3 条决策路径 + 时序数据点 */
interface LlmScenarioTree {
  paths: Array<{
    label: "PATH_A" | "PATH_B" | "PATH_C"
    description: string
    winRate: number // 0-1
    isRecommended: boolean
    data: Array<{ t: string; value: number }>
    keyDrivers: string[] // 触发该路径的关键事件
    sourceUrls?: string[]
  }>
  summary: string
  contextSnapshot: string // LLM 对当前外部环境的判断
}

const SCENARIO_TREE_SCHEMA = {
  type: "object",
  properties: {
    paths: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        properties: {
          label: { type: "string", enum: ["PATH_A", "PATH_B", "PATH_C"] },
          description: { type: "string" },
          winRate: { type: "number", minimum: 0, maximum: 1 },
          isRecommended: { type: "boolean" },
          data: {
            type: "array",
            items: {
              type: "object",
              properties: {
                t: { type: "string" },
                value: { type: "number" },
              },
              required: ["t", "value"],
            },
          },
          keyDrivers: { type: "array", items: { type: "string" } },
          sourceUrls: { type: "array", items: { type: "string" } },
        },
        required: ["label", "description", "winRate", "isRecommended", "data", "keyDrivers"],
      },
    },
    summary: { type: "string" },
    contextSnapshot: { type: "string" },
  },
  required: ["paths", "summary", "contextSnapshot"],
} as const

export async function execScenarioTreeBuild(
  config: Record<string, unknown> | undefined,
  ctx: SkillExecContext,
): Promise<SkillExecResult> {
  const prisma = ctx.prisma
  const scenarioInput = (config?.scenarioInput ?? config ?? {}) as Record<string, unknown>
  const scenario = (scenarioInput.scenario as string) ?? (config?.scenario as string) ?? "未指定场景"
  const hypothesis = (scenarioInput.hypothesis as string) ?? (config?.hypothesis as string) ?? "未指定假设"
  const timeHorizon = (scenarioInput.timeHorizon as string) ?? (config?.timeHorizon as string) ?? "30d"

  const horizonDays = parseInt(timeHorizon) || 30
  const quarters = horizonDays <= 30 ? ["W1", "W2", "W3", "W4"]
    : horizonDays <= 90 ? ["M1", "M2", "M3"]
    : ["Q1", "Q2", "Q3", "Q4"]

  const tavilyOk = isTavilyAvailable()
  const llmOk = isProviderAvailable("deepseek") || isProviderAvailable("anthropic")
  if (!tavilyOk || !llmOk || scenario === "未指定场景") {
    return execScenarioTreeFallback(scenario, hypothesis, timeHorizon, quarters, ctx)
  }

  // ─── Step 1: 用 scenario+hypothesis 搜索背景 ──────────────
  const t0 = Date.now()
  const backgroundQuery = `${scenario} ${hypothesis}`.slice(0, 200)
  const searchResults = await searchWebBatch([backgroundQuery], {
    searchDepth: "advanced",
    topic: "news",
    days: 14,
    maxResults: 8,
  })
  const searchMs = Date.now() - t0
  const newsItems = searchResults[0]?.results ?? []

  // ─── Step 2: LLM 生成路径 ─────────────────────────────────
  const newsSummary = newsItems.slice(0, 10).map((n, i) =>
    `${i + 1}. ${n.title}\n   ${n.content.slice(0, 220)}\n   URL: ${n.url}`
  ).join("\n")

  const systemPrompt = `你是 HermesClaw 的战略沙盘推演专家。
基于用户提出的场景 + 假设 + 真实新闻背景，构建 3 条决策路径。

输出规则：
- PATH_A: 最优路径（假设成立 + 关键驱动因子达成），winRate 通常 0.5-0.85
- PATH_B: 基准路径（维持现状或部分达成），winRate 通常 0.3-0.6
- PATH_C: 最差路径（假设失败 + 不利连锁），winRate 通常 0.05-0.3
- 只能有 1 条 isRecommended=true（通常是 PATH_A）
- data: 在时间轴 [${quarters.join(', ')}] 上的关键指标值（如收入/份额/风险等），单位由你判断
- keyDrivers: 3-5 条关键驱动事件（中文，短句）
- sourceUrls: 引用真实新闻 URL 支撑你的判断
- summary: 100 字内整体结论
- contextSnapshot: 50 字内当前外部环境概述

严格遵守 schema。`

  const userPrompt = `# 沙盘场景
- scenario: ${scenario}
- hypothesis: ${hypothesis}
- timeHorizon: ${timeHorizon}

# 时间轴
${quarters.join(' → ')}

# 真实新闻背景 (近 14 天)
${newsSummary || "(无相关搜索结果)"}

请构建 3 条路径。`

  let llmResult: LlmScenarioTree
  try {
    const raw = (await callDeepSeekJson({
      systemPrompt,
      userPrompt,
      maxTokens: 4000,
      temperature: 0.5,
    })) as LlmScenarioTree
    if (!raw.paths || raw.paths.length !== 3) {
      throw new Error("LLM 返回的 paths 数量不等于 3")
    }
    llmResult = raw
  } catch (err) {
    logger.error("[ScenarioTree] LLM 生成失败，降级", {
      error: err instanceof Error ? err.message : String(err),
    })
    return execScenarioTreeFallback(scenario, hypothesis, timeHorizon, quarters, ctx)
  }

  // 也读取一下历史 A4 run，做参考
  const historicalRuns = await prisma.workflowRun.findMany({
    where: { workspaceId: ctx.workspaceId, status: "completed", agentId: "A4" },
    orderBy: { completedAt: "desc" },
    select: { id: true },
    take: 10,
  })

  return {
    status: "completed",
    eventsEmitted: [],
    output: {
      treeNodes: 3,
      branches: ["PATH_A", "PATH_B", "PATH_C"],
      scenario,
      hypothesis,
      timeHorizon,
      historicalCount: historicalRuns.length,
      paths: llmResult.paths,
      summary: llmResult.summary,
      contextSnapshot: llmResult.contextSnapshot,
      newsScanned: newsItems.length,
      searchMs,
      mode: "llm+tavily",
      builtAt: nowISO(),
    },
  }
}

/** A4 降级：原有的复杂度启发式逻辑 */
async function execScenarioTreeFallback(
  scenario: string,
  hypothesis: string,
  timeHorizon: string,
  quarters: string[],
  ctx: SkillExecContext,
): Promise<SkillExecResult> {
  const prisma = ctx.prisma
  const historicalRuns = await prisma.workflowRun.findMany({
    where: { workspaceId: ctx.workspaceId, status: "completed", agentId: "A4" },
    orderBy: { completedAt: "desc" },
    select: { outputContext: true },
    take: 10,
  })
  let baseWinRate = 0.55
  let historicalCount = 0
  for (const run of historicalRuns) {
    if (run.outputContext) {
      try {
        const cd = typeof run.outputContext === "string" ? JSON.parse(run.outputContext) : run.outputContext
        if (cd?.paths?.[0]?.winRate) {
          baseWinRate = (baseWinRate + cd.paths[0].winRate) / 2
          historicalCount++
        }
      } catch { /* skip */ }
    }
  }
  const complexity = Math.min(1, scenario.length / 200 + hypothesis.length / 150)
  const pathAWinRate = Math.round((baseWinRate - complexity * 0.1 + Math.random() * 0.15) * 100) / 100
  const pathBWinRate = Math.round((baseWinRate - complexity * 0.05) * 100) / 100
  const pathCWinRate = Math.round((baseWinRate - complexity * 0.25 - Math.random() * 0.1) * 100) / 100

  return {
    status: "completed",
    eventsEmitted: [],
    output: {
      treeNodes: 3,
      branches: ["PATH_A", "PATH_B", "PATH_C"],
      scenario,
      hypothesis,
      timeHorizon,
      historicalCount,
      mode: "db-fallback",
      paths: [
        {
          label: "PATH_A",
          description: `最优路径: ${hypothesis.slice(0, 60)} — 基于 ${historicalCount} 条历史记录 [降级]`,
          winRate: Math.max(0.1, Math.min(0.95, pathAWinRate)),
          data: quarters.map((t, i) => ({ t, value: Math.round(100 + (i + 1) * (5 + Math.random() * 10)) })),
          isRecommended: true,
          keyDrivers: [],
        },
        {
          label: "PATH_B",
          description: `基准路径: 维持现状 — 场景: ${scenario.slice(0, 50)} [降级]`,
          winRate: Math.max(0.05, Math.min(0.9, pathBWinRate)),
          data: quarters.map((t, i) => ({ t, value: Math.round(100 + i * (2 + Math.random() * 4)) })),
          isRecommended: false,
          keyDrivers: [],
        },
        {
          label: "PATH_C",
          description: `最差路径: ${hypothesis.slice(0, 50)} — 触发不利连锁反应 [降级]`,
          winRate: Math.max(0.01, Math.min(0.7, pathCWinRate)),
          data: quarters.map((t, i) => ({ t, value: Math.round(100 - i * (5 + Math.random() * 15)) })),
          isRecommended: false,
          keyDrivers: [],
        },
      ],
      builtAt: nowISO(),
    },
  }
}

// ─── 8. skill-harness-eval-report-read ────────────────────────────────

const PROPOSAL_TYPES = [
  "WorkflowTemplate",
  "AgentPolicy",
  "SkillBinding",
  "ContextPolicy",
  "MemoryPolicy",
  "ConnectorPolicy",
  "EvalRuleSet",
] as const

interface LlmHarnessEvalReport {
  proposalType: typeof PROPOSAL_TYPES[number]
  title: string
  rationale: string
  evidence: string[]
  confidence: number
  estimatedImpact: "low" | "medium" | "high"
}

const HARNESS_EVAL_SCHEMA = {
  type: "object",
  properties: {
    proposalType: { type: "string", enum: [...PROPOSAL_TYPES] },
    title: { type: "string" },
    rationale: { type: "string" },
    evidence: { type: "array", items: { type: "string" } },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    estimatedImpact: { type: "string", enum: ["low", "medium", "high"] },
  },
  required: ["proposalType", "title", "rationale", "evidence", "confidence", "estimatedImpact"],
} as const

export async function execHarnessEvalReportRead(
  _config: Record<string, unknown> | undefined,
  ctx: SkillExecContext,
): Promise<SkillExecResult> {
  const prisma = ctx.prisma
  const llmOk = isProviderAvailable("deepseek") || isProviderAvailable("anthropic")
  if (!llmOk) {
    return execEvalReportFallback(null)
  }

  // ─── Step 1: 收集 HermesClaw 内部审计信号 ──────────────────────
  const since = new Date(Date.now() - 24 * 3600_000)
  const [
    recentFailedRuns,
    recentAuditAlerts,
    recentHighRiskLogs,
    activeApprovals,
    capabilityCounts,
  ] = await Promise.all([
    prisma.workflowRun.findMany({
      where: { workspaceId: ctx.workspaceId, status: "failed", startedAt: { gte: since } },
      select: { workflowId: true, agentId: true, errorMessage: true },
      take: 30,
    }),
    prisma.auditLog.count({
      where: { workspaceId: ctx.workspaceId, riskLevel: { in: ["high", "critical"] }, createdAt: { gte: since } },
    }),
    prisma.agentLog.findMany({
      where: { workspaceId: ctx.workspaceId, riskLevel: "high", createdAt: { gte: since } },
      select: { taskName: true, source: true, detail: true },
      take: 20,
    }),
    prisma.harnessProposal.count({
      where: { workspaceId: ctx.workspaceId, status: { in: ["draft", "pending"] } },
    }),
    prisma.capabilityVersion.count({ where: { workspaceId: ctx.workspaceId } }),
  ])

  const failureSummary = recentFailedRuns.slice(0, 10).map((r, i) =>
    `${i + 1}. workflow=${r.workflowId} agent=${r.agentId ?? "-"} err=${(r.errorMessage ?? "").slice(0, 100)}`
  ).join("\n") || "(无失败 run)"

  const riskSummary = recentHighRiskLogs.slice(0, 10).map((l, i) =>
    `${i + 1}. ${l.taskName} (${l.source}): ${(l.detail ?? "").slice(0, 80)}`
  ).join("\n") || "(无高风险日志)"

  // ─── Step 2: LLM 综合分析输出提案 ─────────────────────────────
  const systemPrompt = `你是 HermesClaw 的自进化评估引擎。
你的职责：阅读过去 24h 的 HermesClaw 内部运行数据，找出系统中最需要改进的一项，输出一条治理提案。

可选 proposalType（必须从中选一）：
- WorkflowTemplate: 工作流拆解 / 节点配置问题
- AgentPolicy: Agent 行为策略
- SkillBinding: 技能绑定优化
- ContextPolicy: 上下文裁剪策略
- MemoryPolicy: 记忆压缩 / 持久化
- ConnectorPolicy: 连接器策略（非高危）
- EvalRuleSet: 评估规则阈值

输出要求：
- title: 提案标题（中文，30字内）
- rationale: 100字内说明为何需要这个提案
- evidence: 2-5 条具体事实证据（引用 failureSummary / riskSummary 中的内容）
- confidence: 0-1
- estimatedImpact: low/medium/high

严格遵守 schema。`

  const userPrompt = `# HermesClaw 内部 24h 运行数据快照

## 失败运行 (${recentFailedRuns.length} 条)
${failureSummary}

## 高风险日志 (${recentHighRiskLogs.length} 条)
${riskSummary}

## 其它指标
- 高/危审计事件总数: ${recentAuditAlerts}
- 待处理提案: ${activeApprovals}
- 已注册能力版本: ${capabilityCounts}

请输出一条最有价值的治理提案。`

  let llmResult: LlmHarnessEvalReport
  try {
    const raw = (await callDeepSeekJson({
      systemPrompt,
      userPrompt,
      maxTokens: 1500,
      temperature: 0.4,
    })) as LlmHarnessEvalReport
    if (!raw.proposalType || !raw.title) throw new Error("LLM 返回缺字段")
    llmResult = raw
  } catch (err) {
    logger.error("[HarnessEval] LLM 失败，降级", {
      error: err instanceof Error ? err.message : String(err),
    })
    return execEvalReportFallback({
      recentFailedRuns: recentFailedRuns.length,
      recentHighRiskLogs: recentHighRiskLogs.length,
      recentAuditAlerts,
      activeApprovals,
    })
  }

  const proposal: IntelEvolutionProposalCreated = IntelEvolutionProposalCreatedSchema.parse({
    eventType: "intel.evolution.proposal-created",
    proposalId: `proposal-eval-${nextProposalSeq()}`,
    proposalType: llmResult.proposalType,
    confidence: Math.max(0, Math.min(1, llmResult.confidence)),
    createdAt: nowISO(),
    evolutionProposalId: `ev-proposal-${Date.now()}`,
    version: "1.0.0",
  })
  emitIntelEvent(proposal)

  // 同步写入 HarnessProposal，确保 P5 面板可查到真实数据
  try {
    await prisma.harnessProposal.create({
      data: {
        proposalId: proposal.proposalId,
        title: llmResult.title,
        severity: llmResult.estimatedImpact === "high" ? "high" : "medium",
        proposalType: llmResult.proposalType,
        workspaceId: ctx.workspaceId,
        triggeredBy: "auto",
        triggerReason: llmResult.rationale,
        problemStatement: llmResult.rationale,
        evidence: llmResult.evidence ?? [],
        proposedChange: {
          description: llmResult.rationale,
          automationLevel: "L2",
          riskLevel: llmResult.estimatedImpact === "high" ? "high" : "medium",
          targetComponent: llmResult.proposalType,
        } as unknown as Prisma.JsonValue,
        estimatedImpact: llmResult.estimatedImpact,
        rollbackPlan: "审核不通过时回滚到上一版本配置",
        status: "draft",
      },
    })
  } catch (err) {
    logger.error("[HarnessEval] HarnessProposal 写入失败", {
      error: err instanceof Error ? err.message : String(err),
    })
  }

  return {
    status: "completed",
    eventsEmitted: [proposal.proposalId],
    output: {
      proposalType: proposal.proposalType,
      confidence: proposal.confidence,
      title: llmResult.title,
      rationale: llmResult.rationale,
      evidence: llmResult.evidence,
      estimatedImpact: llmResult.estimatedImpact,
      mode: "llm",
      sourcedFrom: {
        failedRuns: recentFailedRuns.length,
        highRiskLogs: recentHighRiskLogs.length,
        auditAlerts: recentAuditAlerts,
      },
    },
  }
}

async function execEvalReportFallback(stats?: { recentFailedRuns: number; recentHighRiskLogs: number; recentAuditAlerts: number; activeApprovals: number } | null): Promise<SkillExecResult> {
  // 有无 Key 的降级消息不同
  const noKeyMsg = !stats
  const fallbackMsg = noKeyMsg
    ? "DB 统计降级模式：LLM 未配置"
    : `基于 DB 统计的简化评估：最近 24h 有 ${stats.recentFailedRuns} 次失败运行、${stats.recentHighRiskLogs} 条高风险日志、${stats.activeApprovals} 个待审批提案`
  const fallbackType = noKeyMsg ? "ContextPolicy" : "WorkflowTemplate"

  const proposal: IntelEvolutionProposalCreated = IntelEvolutionProposalCreatedSchema.parse({
    eventType: "intel.evolution.proposal-created",
    proposalId: `proposal-eval-${nextProposalSeq()}`,
    proposalType: fallbackType,
    confidence: noKeyMsg ? rand(0.4, 0.6) : 0.65,
    createdAt: nowISO(),
    evolutionProposalId: `ev-proposal-${Date.now()}`,
    version: "1.0.0",
  })
  emitIntelEvent(proposal)

  // Fallback 模式：不写入 HarnessProposal 表（无 LLM 输出的提案缺乏治理价值）
  // 仅在 emitIntelEvent 中发射实时 SSE 事件供 P5 面板显示

  return {
    status: "completed",
    eventsEmitted: [proposal.proposalId],
    output: {
      proposalType: proposal.proposalType,
      confidence: proposal.confidence,
      mode: noKeyMsg ? "db-fallback-nokey" : "db-fallback-llm-fail",
      title: fallbackMsg.slice(0, 40),
      rationale: fallbackMsg,
      estimatedImpact: stats && stats.recentFailedRuns > 5 ? "high" : "medium",
    },
  }
}

// ─── 9. skill-proposal-draft-generate ─────────────────────────────────

interface LlmProposalDraft {
  proposalType: "AgentPolicy" | "WorkflowTemplate" | "ContextPolicy"
  title: string
  summary: string
  diff: { before: string; after: string }
  rollbackPlan: string
  confidence: number
}

const PROPOSAL_DRAFT_SCHEMA = {
  type: "object",
  properties: {
    proposalType: { type: "string", enum: ["AgentPolicy", "WorkflowTemplate", "ContextPolicy"] },
    title: { type: "string" },
    summary: { type: "string" },
    diff: {
      type: "object",
      properties: {
        before: { type: "string" },
        after: { type: "string" },
      },
      required: ["before", "after"],
    },
    rollbackPlan: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
  required: ["proposalType", "title", "summary", "diff", "rollbackPlan", "confidence"],
} as const

export async function execProposalDraftGenerate(
  _config: Record<string, unknown> | undefined,
  ctx: SkillExecContext,
): Promise<SkillExecResult> {
  const prisma = ctx.prisma
  const llmOk = isProviderAvailable("deepseek") || isProviderAvailable("anthropic")
  if (!llmOk) {
    return execProposalDraftFallback(null)
  }

  // 找最近一条 A5 eval 提案作为输入（连贯进化闭环）
  const recentEvalProposal = await prisma.harnessProposal.findFirst({
    where: { workspaceId: ctx.workspaceId },
    orderBy: { createdAt: "desc" },
    select: { proposalType: true, title: true, problemStatement: true, triggerReason: true },
  })

  const seedTitle = recentEvalProposal?.title ?? "改进 Agent 执行稳定性"
  const seedRationale = recentEvalProposal?.triggerReason ?? "近期失败率上升，需要调整策略"
  const seedType = recentEvalProposal?.proposalType ?? "AgentPolicy"

  const systemPrompt = `你是 HermesClaw 的提案起草引擎。
基于评估引擎给出的方向，输出一份完整可审批的提案草案。

输出要求：
- proposalType: AgentPolicy / WorkflowTemplate / ContextPolicy 之一
- title: 30字内提案标题
- summary: 100字内提案摘要
- diff: { before: 当前状态描述, after: 修改后状态描述 } (各 80 字内)
- rollbackPlan: 50字内回滚方案
- confidence: 0-1

严格遵守 schema。所有内容必须可执行、可审计。`

  const userPrompt = `# 上游评估提示
- 类型: ${seedType}
- 标题: ${seedTitle}
- 理由: ${seedRationale}

请起草具体提案草案。`

  let llmResult: LlmProposalDraft
  try {
    const raw = (await callDeepSeekJson({
      systemPrompt,
      userPrompt,
      maxTokens: 1500,
      temperature: 0.5,
    })) as LlmProposalDraft
    if (!raw.proposalType || !raw.title || !raw.diff) throw new Error("LLM 返回缺字段")
    llmResult = raw
  } catch (err) {
    logger.error("[ProposalDraft] LLM 失败，降级", {
      error: err instanceof Error ? err.message : String(err),
    })
    return execProposalDraftFallback(recentEvalProposal)
  }

  const proposal: IntelEvolutionProposalCreated = IntelEvolutionProposalCreatedSchema.parse({
    eventType: "intel.evolution.proposal-created",
    proposalId: `proposal-draft-${nextProposalSeq()}`,
    proposalType: llmResult.proposalType,
    confidence: Math.max(0, Math.min(1, llmResult.confidence)),
    createdAt: nowISO(),
    version: "1.0.0",
  })
  emitIntelEvent(proposal)

  // 同步写入 HarnessProposal，确保 P5 面板可查到真实数据
  try {
    await prisma.harnessProposal.create({
      data: {
        proposalId: proposal.proposalId,
        title: llmResult.title,
        severity: "medium",
        proposalType: llmResult.proposalType,
        workspaceId: ctx.workspaceId,
        triggeredBy: "auto",
        triggerReason: llmResult.summary,
        problemStatement: llmResult.summary,
        evidence: [],
        proposedChange: {
          description: llmResult.summary,
          before: llmResult.diff.before,
          after: llmResult.diff.after,
          automationLevel: "L2",
          riskLevel: "medium",
          targetComponent: llmResult.proposalType,
        } as unknown as Prisma.JsonValue,
        estimatedImpact: "medium",
        rollbackPlan: llmResult.rollbackPlan,
        status: "draft",
      },
    })
  } catch (err) {
    logger.error("[ProposalDraft] HarnessProposal 写入失败", {
      error: err instanceof Error ? err.message : String(err),
    })
  }

  return {
    status: "completed",
    eventsEmitted: [proposal.proposalId],
    output: {
      proposalType: proposal.proposalType,
      confidence: proposal.confidence,
      title: llmResult.title,
      summary: llmResult.summary,
      diff: llmResult.diff,
      rollbackPlan: llmResult.rollbackPlan,
      mode: "llm",
      seededFrom: recentEvalProposal?.title ?? null,
    },
  }
}

async function execProposalDraftFallback(
  recentEvalProposal?: { proposalType: string; title: string; problemStatement: string; triggerReason: string } | null,
): Promise<SkillExecResult> {
  const noKeyMsg = !recentEvalProposal
  const seedType = recentEvalProposal?.proposalType ?? pick(["AgentPolicy", "WorkflowTemplate", "ContextPolicy"])
  const seedTitle = recentEvalProposal?.title ?? "自动检测的优化机会"
  const fallbackMsg = noKeyMsg
    ? "系统检测到潜在优化方向，但需要配置 LLM 以生成完整提案"
    : `基于评估引擎方向生成草案: ${seedTitle.slice(0, 50)}`

  const proposal: IntelEvolutionProposalCreated = IntelEvolutionProposalCreatedSchema.parse({
    eventType: "intel.evolution.proposal-created",
    proposalId: `proposal-draft-${nextProposalSeq()}`,
    proposalType: seedType,
    confidence: noKeyMsg ? rand(0.4, 0.6) : 0.7,
    createdAt: nowISO(),
    version: "1.0.0",
  })
  emitIntelEvent(proposal)
  return {
    status: "completed",
    eventsEmitted: [proposal.proposalId],
    output: {
      proposalType: proposal.proposalType,
      confidence: proposal.confidence,
      title: fallbackMsg,
      summary: fallbackMsg,
      diff: { before: "当前状态", after: "等待 LLM 生成优化建议" },
      rollbackPlan: "手动回滚",
      mode: noKeyMsg ? "db-fallback-nokey" : "db-fallback-llm-fail",
    },
  }
}

// ─── Skill → 计算函数映射 ────────────────────────────────────────────

export const SKILL_EXEC_MAP: Record<string, (
  config: Record<string, unknown> | undefined,
  ctx: SkillExecContext,
) => Promise<SkillExecResult>> = {
  "skill-radar-score-compute": execRadarScoreCompute,
  "skill-policy-nlp-scan": execPolicyNlpScan,
  "skill-event-signal-classify": execEventSignalClassify,
  "skill-market-flow-tick": execMarketFlowTick,
  "skill-entity-graph-update": execEntityGraphUpdate,
  "skill-hypothesis-parse": execHypothesisParse,
  "skill-scenario-tree-build": execScenarioTreeBuild,
  "skill-harness-eval-report-read": execHarnessEvalReportRead,
  "skill-proposal-draft-generate": execProposalDraftGenerate,
}

// ─── Agent 心跳事件 ───────────────────────────────────────────────────

export function emitAgentHeartbeat(
  agentId: "A1" | "A2" | "A3" | "A4" | "A5",
  status: "running" | "degraded" | "error" | "idle" = "running",
): void {
  const hb: IntelAgentHeartbeat = IntelAgentHeartbeatSchema.parse({
    eventType: "intel.agent.heartbeat",
    agentId,
    status,
    lastRunAt: nowISO(),
    nextRunAt: new Date(Date.now() + 30_000).toISOString(),
    heartbeatAt: nowISO(),
    version: "1.0.0",
  })
  emitIntelEvent(hb)
}
