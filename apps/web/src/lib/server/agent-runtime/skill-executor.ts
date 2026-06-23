/**
 * Skill Executor — 9 个 Skill 的计算桩实现
 *
 * 三域原则第三域（Industry Pack Layer）：
 * - 每个 Skill 产出符合 event-contracts Zod schema 的数据
 * - 调用 emitIntelEvent() 向 SSE 订阅者广播
 * - 不在此写入策略决策或记忆管理（Hermes 权限）
 *
 * 当前阶段：计算桩（模拟数据），Phase 2 接入 LLM。
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
import { emitIntelEvent } from "@hermesclaw/openclaw-adapter"
import type { PrismaClient } from "@/generated/prisma-v2/client"

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
  { key: "market-heat", label: "市场热度" },
  { key: "competitor-intensity", label: "竞对强度" },
  { key: "policy-risk", label: "政策风险" },
  { key: "capital-flow", label: "资金流向" },
  { key: "tech-change", label: "技术变化" },
  { key: "sentiment", label: "舆情温度" },
  { key: "supply-chain", label: "供应链压力" },
  { key: "regulatory-density", label: "监管密度" },
]

const POLICY_KEYWORDS = [
  "碳边境税", "新能源补贴", "数据安全法", "出口管制", "反补贴调查",
  "ESG披露", "跨境数据流动", "芯片法案", "绿色贸易壁垒", "数字税",
]

export async function execRadarScoreCompute(
  _config: Record<string, unknown> | undefined,
  ctx: SkillExecContext,
): Promise<SkillExecResult> {
  const prisma = ctx.prisma

  // ─── 从 DB 读取真实指标计算雷达维度 ────────────────────────────
  // 获取 HarnessProposal 统计
  const [totalProposals, approvedProposals, rejectedProposals] = await Promise.all([
    prisma.harnessProposal.count({ where: { workspaceId: ctx.workspaceId } }),
    prisma.harnessProposal.count({ where: { workspaceId: ctx.workspaceId, status: "approved" } }),
    prisma.harnessProposal.count({ where: { workspaceId: ctx.workspaceId, status: "rejected" } }),
  ])

  // 获取 AuditLog 统计
  const [totalAudits, alertAudits] = await Promise.all([
    prisma.auditLog.count({
      where: { workspaceId: ctx.workspaceId, createdAt: { gte: new Date(Date.now() - 86400_000) } },
    }),
    prisma.auditLog.count({
      where: {
        workspaceId: ctx.workspaceId,
        action: { in: ["approve.proposal", "reject.proposal", "sandbox.submit"] },
        createdAt: { gte: new Date(Date.now() - 86400_000) },
      },
    }),
  ])

  // 获取 AgentLog 统计
  const [agentLogTotal, agentLogHighRisk] = await Promise.all([
    prisma.agentLog.count({ where: { workspaceId: ctx.workspaceId } }),
    prisma.agentLog.count({ where: { workspaceId: ctx.workspaceId, riskLevel: "high" } }),
  ])

  // 从真实统计数据计算各维度
  const approvalRate = totalProposals > 0 ? approvedProposals / totalProposals : 0.5
  const rejectionRate = totalProposals > 0 ? rejectedProposals / totalProposals : 0.1
  const alertRate = agentLogTotal > 0 ? agentLogHighRisk / agentLogTotal : 0.1

  const dims = RADAR_DIMENSIONS.map((d) => {
    let value = 50
    // 基于真实数据计算（保持一定范围内的合理性）
    switch (d.key) {
      case "market-heat":
        value = Math.round(40 + approvalRate * 50 + randInt(-5, 10))
        break
      case "competitor-intensity":
        value = Math.round(35 + alertRate * 60 + randInt(-5, 10))
        break
      case "policy-risk":
        value = Math.round(30 + rejectionRate * 70 + randInt(-8, 8))
        break
      case "capital-flow":
        value = Math.round(45 + approvalRate * 45 + randInt(-10, 5))
        break
      case "tech-change":
        value = Math.round(50 + (totalProposals > 0 ? 25 : 0) + randInt(-10, 10))
        break
      case "sentiment":
        value = Math.round(45 + (1 - alertRate) * 40 + randInt(-5, 10))
        break
      case "supply-chain":
        value = Math.round(40 + randInt(-5, 15))
        break
      case "regulatory-density":
        value = Math.round(35 + alertRate * 55 + randInt(-5, 10))
        break
    }
    return {
      key: d.key,
      label: d.label,
      value: Math.max(5, Math.min(100, value)),
      delta: randInt(-10, 15),
      source: "db-derived",
    }
  })

  // 每维产出一条信号（高分维度作为信号）
  const events: string[] = []
  for (const dim of dims) {
    if (dim.value >= 70) {
      const signal: IntelSignalDetected = IntelSignalDetectedSchema.parse({
        eventType: "intel.signal.detected",
        signalId: `sig-radar-${nextSignalSeq()}`,
        title: `${dim.label} 得分偏高 (${dim.value})`,
        threatLevel: dim.value >= 85 ? "L3" : dim.value >= 75 ? "L2" : "L1",
        confidence: 0.8 + Math.random() * 0.15,
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
    output: { dimensions: dims, generatedAt: nowISO(), totalProposals, approvalRate, alertRate },
  }
}

// ─── 2. skill-policy-nlp-scan ─────────────────────────────────────────

export async function execPolicyNlpScan(
  _config: Record<string, unknown> | undefined,
  ctx: SkillExecContext,
): Promise<SkillExecResult> {
  const keyword = pick(POLICY_KEYWORDS)
  const region = pick(REGIONS)
  const heatScore = randInt(40, 95)

  const signal: IntelSignalDetected = IntelSignalDetectedSchema.parse({
    eventType: "intel.signal.detected",
    signalId: `sig-policy-${nextSignalSeq()}`,
    title: `政策热词"${keyword}"热度${heatScore} (${region})`,
    threatLevel: heatScore >= 80 ? "L3" : heatScore >= 60 ? "L2" : "L1",
    confidence: 0.75 + Math.random() * 0.2,
    source: "policy-nlp-scan",
    detectedAt: nowISO(),
    region,
    version: "1.0.0",
  })
  emitIntelEvent(signal)

  return {
    status: "completed",
    eventsEmitted: [signal.signalId],
    output: { keyword, region, heatScore, scannedAt: nowISO() },
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

export async function execMarketFlowTick(
  _config: Record<string, unknown> | undefined,
  ctx: SkillExecContext,
): Promise<SkillExecResult> {
  const prisma = ctx.prisma

  // ─── 从 DB 读取真实数据计算指数 ────────────────────────────────
  // capitalFlowIndex: 从最近 AgentLog 创建密度计算
  const recentLogs = await prisma.agentLog.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      createdAt: { gte: new Date(Date.now() - 300_000) }, // 最近 5 分钟
    },
    select: { createdAt: true, riskLevel: true },
  })

  // 活跃度越高 → 指数越高
  const density = Math.min(100, recentLogs.length * 3 + 30)

  // volumeIndex: 从最近 WorkflowRun 完成频率计算
  const recentRuns = await prisma.workflowRun.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      completedAt: { gte: new Date(Date.now() - 300_000) },
    },
    select: { id: true },
  })

  const volumeDensity = Math.min(100, recentRuns.length * 5 + 25)

  // 高风险日志越多 → flow 波动越大
  const highRiskCount = recentLogs.filter((l) => l.riskLevel === "high").length
  const perturbation = highRiskCount > 0 ? randInt(-15, 15) : randInt(-5, 5)

  const capitalFlowIndex = Math.max(0, Math.min(100, density + perturbation))
  const volumeIndex = Math.max(0, Math.min(100, volumeDensity + randInt(-5, 5)))

  const tick: IntelFlowTick = IntelFlowTickSchema.parse({
    eventType: "intel.flow.tick",
    timestamp: nowISO(),
    capitalFlowIndex,
    volumeIndex,
    region: pick(REGIONS),
    version: "1.0.0",
  })
  emitIntelEvent(tick)

  return {
    status: "completed",
    eventsEmitted: ["flow-tick"],
    output: { capitalFlowIndex: tick.capitalFlowIndex, volumeIndex: tick.volumeIndex, region: tick.region, density, volumeDensity },
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

export async function execEntityGraphUpdate(
  _config: Record<string, unknown> | undefined,
  ctx: SkillExecContext,
): Promise<SkillExecResult> {
  // ─── 从 DB 读取真实数据构建图谱变更 ─────────────────────────────
  const prisma = ctx.prisma

  // 读取最近 AgentLog 提取实体
  const recentLogs = await prisma.agentLog.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, taskName: true, source: true, riskLevel: true },
  })

  // 读取活跃连接器
  const connectors = await prisma.connector.findMany({
    where: { workspaceId: ctx.workspaceId },
    select: { id: true, name: true },
    take: 10,
  })

  // 从 log 中提取关键词作为节点
  const entitySet = new Set<string>()
  const CATEGORY_KW: Record<string, string[]> = {
    company: ["企业", "公司", "集团", "BYD", "华为", "阿里", "腾讯", "特斯拉", "苹果"],
    product: ["产品", "组件", "芯片", "电池", "光伏", "新能源"],
    policy: ["政策", "法规", "关税", "制裁", "补贴", "监管"],
    market: ["市场", "欧盟", "美国", "东南亚", "出口", "进口"],
    region: ["中国", "CN", "EU", "US", "SEA", "中东", "拉美"],
    capital: ["资金", "投资", "融资", "汇率", "利率"],
    tech: ["技术", "5G", "AI", "区块链", "云计算"],
  }

  const added: { id: string; label: string; category: string; weight?: number }[] = []
  const removed: string[] = []
  const updated: { id: string; source: string; target: string; relation: string; weight?: number }[] = []

  // 从 AgentLog 生成实体节点
  for (const log of recentLogs) {
    const text = `${log.taskName} ${log.source}`.toLowerCase()
    for (const [category, keywords] of Object.entries(CATEGORY_KW)) {
      for (const kw of keywords) {
        if (text.includes(kw.toLowerCase()) && !entitySet.has(kw)) {
          entitySet.add(kw)
          added.push({
            id: `entity-${kw.replace(/[^a-zA-Z0-9一-龥]/g, "-").slice(0, 30)}`,
            label: kw,
            category,
            weight: 0.5 + Math.random() * 0.5,
          })
        }
      }
    }
  }

  // 从 connectors 生成连接器节点
  for (const c of connectors) {
    const cid = `connector-${c.id}`
    if (!entitySet.has(cid)) {
      entitySet.add(cid)
      added.push({ id: cid, label: c.name, category: "capital", weight: 0.7 })
    }
  }

  // 生成边（连接器→实体）
  const entityNodes = added.filter((n) => n.id.startsWith("entity-"))
  const connectorNodes = added.filter((n) => n.id.startsWith("connector-"))
  let edgeSeq = 0
  for (const cn of connectorNodes) {
    for (const en of entityNodes.slice(0, 3)) {
      updated.push({
        id: `e-dynamic-${Date.now()}-${edgeSeq++}`,
        source: cn.id,
        target: en.id,
        relation: "provides_data_for",
        weight: 0.5 + Math.random() * 0.3,
      })
    }
  }

  // 实体间关系
  for (let i = 0; i < entityNodes.length && edgeSeq < 50; i++) {
    for (let j = i + 1; j < entityNodes.length && edgeSeq < 50; j++) {
      if (entityNodes[i].category === entityNodes[j].category && Math.random() < 0.5) {
        updated.push({
          id: `e-dynamic-${Date.now()}-${edgeSeq++}`,
          source: entityNodes[i].id,
          target: entityNodes[j].id,
          relation: "related_to",
          weight: 0.4 + Math.random() * 0.4,
        })
      }
    }
  }

  // 无新数据时保留 SAMPLE_NODES 作为 fallback
  if (added.length === 0) {
    added.push(
      { id: "n1", label: "光伏组件", category: "product", weight: 0.9 },
      { id: "n2", label: "欧盟市场", category: "market", weight: 0.85 },
    )
  }

  const event: IntelTopologyUpdated = IntelTopologyUpdatedSchema.parse({
    eventType: "intel.topology.updated",
    added,
    removed,
    updated: updated.length > 0 ? updated : [],
    timestamp: nowISO(),
    version: "1.0.0",
  })
  emitIntelEvent(event)

  return {
    status: "completed",
    eventsEmitted: ["topology-updated"],
    output: { nodes: added, edges: updated, addedCount: added.length, removedCount: removed.length, updatedCount: updated.length },
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

export async function execScenarioTreeBuild(
  config: Record<string, unknown> | undefined,
  ctx: SkillExecContext,
): Promise<SkillExecResult> {
  const prisma = ctx.prisma

  // ─── 使用真实场景输入构建决策树 ──────────────────────────────
  const scenarioInput = (config?.scenarioInput ?? config ?? {}) as Record<string, unknown>
  const scenario = (scenarioInput.scenario as string) ?? (config?.scenario as string) ?? "未指定场景"
  const hypothesis = (scenarioInput.hypothesis as string) ?? (config?.hypothesis as string) ?? "未指定假设"
  const timeHorizon = (scenarioInput.timeHorizon as string) ?? (config?.timeHorizon as string) ?? "30d"

  // 从 WorkflowRun 历史查找相似场景的结果
  const historicalRuns = await prisma.workflowRun.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      status: "completed",
      agentId: "A4",
    },
    orderBy: { completedAt: "desc" },
    select: { outputContext: true },
    take: 10,
  })

  // 基于历史数据估算胜率（无历史时使用基于输入复杂度的启发式）
  let baseWinRate = 0.55
  let historicalCount = 0
  for (const run of historicalRuns) {
    if (run.outputContext) {
      try {
        const ctx_data = typeof run.outputContext === "string" ? JSON.parse(run.outputContext) : run.outputContext
        if (ctx_data?.paths?.[0]?.winRate) {
          baseWinRate = (baseWinRate + ctx_data.paths[0].winRate) / 2
          historicalCount++
        }
      } catch { /* skip */ }
    }
  }

  // 基于场景复杂度调整
  const complexity = Math.min(1, scenario.length / 200 + hypothesis.length / 150)
  const pathAWinRate = Math.round((baseWinRate - complexity * 0.1 + Math.random() * 0.15) * 100) / 100
  const pathBWinRate = Math.round((baseWinRate - complexity * 0.05) * 100) / 100
  const pathCWinRate = Math.round((baseWinRate - complexity * 0.25 - Math.random() * 0.1) * 100) / 100

  // 基于 timeHorizon 构建数据点
  const horizonDays = parseInt(timeHorizon) || 30
  const quarters = horizonDays <= 30 ? ["W1", "W2", "W3", "W4"]
    : horizonDays <= 90 ? ["M1", "M2", "M3"]
    : ["Q1", "Q2", "Q3", "Q4"]

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
      paths: [
        {
          label: "PATH_A",
          description: `最优路径: ${hypothesis.slice(0, 60)} — 基于 ${historicalCount} 条历史记录`,
          winRate: Math.max(0.1, Math.min(0.95, pathAWinRate)),
          data: quarters.map((t, i) => ({ t, value: Math.round(100 + (i + 1) * (5 + Math.random() * 10)) })),
          isRecommended: true,
        },
        {
          label: "PATH_B",
          description: `基准路径: 维持现状 — 场景: ${scenario.slice(0, 50)}`,
          winRate: Math.max(0.05, Math.min(0.9, pathBWinRate)),
          data: quarters.map((t, i) => ({ t, value: Math.round(100 + i * (2 + Math.random() * 4)) })),
          isRecommended: false,
        },
        {
          label: "PATH_C",
          description: `最差路径: ${hypothesis.slice(0, 50)} — 触发不利连锁反应`,
          winRate: Math.max(0.01, Math.min(0.7, pathCWinRate)),
          data: quarters.map((t, i) => ({ t, value: Math.round(100 - i * (5 + Math.random() * 15)) })),
          isRecommended: false,
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

export async function execHarnessEvalReportRead(
  _config: Record<string, unknown> | undefined,
  ctx: SkillExecContext,
): Promise<SkillExecResult> {
  const proposal: IntelEvolutionProposalCreated = IntelEvolutionProposalCreatedSchema.parse({
    eventType: "intel.evolution.proposal-created",
    proposalId: `proposal-eval-${nextProposalSeq()}`,
    proposalType: pick([...PROPOSAL_TYPES]),
    confidence: rand(0.7, 0.95),
    createdAt: nowISO(),
    evolutionProposalId: `ev-proposal-${Date.now()}`,
    version: "1.0.0",
  })
  emitIntelEvent(proposal)

  return {
    status: "completed",
    eventsEmitted: [proposal.proposalId],
    output: { proposalType: proposal.proposalType, confidence: proposal.confidence },
  }
}

// ─── 9. skill-proposal-draft-generate ─────────────────────────────────

export async function execProposalDraftGenerate(
  _config: Record<string, unknown> | undefined,
  ctx: SkillExecContext,
): Promise<SkillExecResult> {
  const proposal: IntelEvolutionProposalCreated = IntelEvolutionProposalCreatedSchema.parse({
    eventType: "intel.evolution.proposal-created",
    proposalId: `proposal-draft-${nextProposalSeq()}`,
    proposalType: pick(["AgentPolicy", "WorkflowTemplate", "ContextPolicy"]),
    confidence: rand(0.65, 0.9),
    createdAt: nowISO(),
    version: "1.0.0",
  })
  emitIntelEvent(proposal)

  return {
    status: "completed",
    eventsEmitted: [proposal.proposalId],
    output: { proposalType: proposal.proposalType, confidence: proposal.confidence },
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
