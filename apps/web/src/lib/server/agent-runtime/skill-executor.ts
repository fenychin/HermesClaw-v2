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
  const dims = RADAR_DIMENSIONS.map((d) => ({
    key: d.key,
    label: d.label,
    value: randInt(20, 95),
    delta: randInt(-10, 15),
    source: "simulated-agent-log",
  }))

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
    output: { dimensions: dims, generatedAt: nowISO() },
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
  const tick: IntelFlowTick = IntelFlowTickSchema.parse({
    eventType: "intel.flow.tick",
    timestamp: nowISO(),
    capitalFlowIndex: randInt(30, 85),
    volumeIndex: randInt(25, 90),
    region: pick(REGIONS),
    version: "1.0.0",
  })
  emitIntelEvent(tick)

  return {
    status: "completed",
    eventsEmitted: ["flow-tick"],
    output: { capitalFlowIndex: tick.capitalFlowIndex, volumeIndex: tick.volumeIndex, region: tick.region },
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
  const count = randInt(1, 3)
  const updatedNodes = new Set<string>()

  const added: { id: string; label: string; category: string; weight?: number }[] = []
  const removed: string[] = []
  const updated: { id: string; source: string; target: string; relation: string; weight?: number }[] = []

  for (let i = 0; i < count; i++) {
    if (Math.random() > 0.5) {
      // 新增节点
      const node = {
        id: `n-auto-${nextSignalSeq()}`,
        label: pick(["锂矿供应", "美国大选", "汇率波动", "稀土出口", "AI芯片"]),
        category: pick(["product", "market", "policy", "company", "region"]),
        weight: rand(0.3, 1.0),
      }
      added.push(node)
    } else {
      // 更新已有节点权重（模拟边更新）
      const src = pick(SAMPLE_NODES)
      const tgt = pick(SAMPLE_NODES.filter((n) => n.id !== src.id))
      updated.push({
        id: `e-update-${nextSignalSeq()}`,
        source: src.id,
        target: tgt.id,
        relation: pick(["exports_to", "regulated_by", "manufactures_in", "competes_with"]),
        weight: rand(0.3, 1.0),
      })
    }
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
    output: { addedCount: added.length, removedCount: removed.length, updatedCount: updated.length },
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
  _config: Record<string, unknown> | undefined,
  ctx: SkillExecContext,
): Promise<SkillExecResult> {
  // 纯内部 Skill，构建决策树节点
  return {
    status: "completed",
    eventsEmitted: [],
    output: {
      treeNodes: 3,
      branches: ["PATH_A", "PATH_B", "PATH_C"],
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
