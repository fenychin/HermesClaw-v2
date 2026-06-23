/**
 * Intel SSE Mock Event Generator — 行业情报 Mock 事件发生器
 *
 * 三域原则第二域（OpenClaw Execution Runtime）：
 * - 仅在开发/测试阶段启用
 * - 仅通过 emitIntelEvent() 发射事件，不直接接触 SSE 连接
 * - 当无活跃订阅者时自动暂停（不浪费资源）
 *
 * 模拟五 Agent 事件流：
 * - A1: intel.signal.detected（战术信号，~15s/条）
 * - A2: intel.flow.tick（资金流向，~3s/条）
 * - A3: intel.topology.updated（图谱更新，~5min/次）
 * - A5: intel.agent.heartbeat（心跳，~10s/条）
 * - 随机告警：intel.alert.tactical（~120s/次）
 */

import { emitIntelEvent } from './intel-stream'
import type {
  IntelFlowTick,
  IntelSignalDetected,
  IntelAlertTactical,
  IntelAgentHeartbeat,
} from '@hermesclaw/event-contracts'

// ─── 配置 ───────────────────────────────────────────────────────────────

const INTERVALS = {
  FLOW_TICK: 3000,       // 3s
  AGENT_HEARTBEAT: 10000, // 10s
  SIGNAL: 15000,          // 15s
  ALERT: 120000,          // 120s（随机）
  TOPOLOGY: 300000,       // 5min
} as const

// ─── Mock 数据池 ───────────────────────────────────────────────────────

const REGIONS = ["cn", "us", "eu", "sea", "me"]
const SIGNAL_POOL = [
  { title: "美国对华光伏反倾销初裁税率升至 35%", threatLevel: "L3" as const, source: "us-trade-commission" },
  { title: "欧盟碳边境调节机制（CBAM）过渡期延长 6 个月", threatLevel: "L2" as const, source: "eu-commission" },
  { title: "宁德时代印尼电池工厂产能爬坡至 80%", threatLevel: "L1" as const, source: "industry-news" },
  { title: "红海航运附加费上调 15%影响中欧航线", threatLevel: "L2" as const, source: "shipping-index" },
  { title: "沙特 NEOM 项目重启 500 亿美元招标", threatLevel: "L1" as const, source: "middle-east-projects" },
  { title: "人民币汇率突破 7.15 关口创年内新高", threatLevel: "L2" as const, source: "forex" },
  { title: "墨西哥对华钢铁制品启动反倾销调查", threatLevel: "L2" as const, source: "latin-america-trade" },
  { title: "台积电亚利桑那工厂 4nm 工艺良率突破 90%", threatLevel: "L1" as const, source: "semi-analytics" },
  { title: "东盟六国联合发布数字经济框架协议", threatLevel: "L1" as const, source: "asean-digital" },
  { title: "全球集装箱运价指数周环比上涨 8.2%", threatLevel: "L2" as const, source: "container-freight" },
  { title: "特斯拉上海储能超级工厂获批扩建", threatLevel: "L1" as const, source: "industry-news" },
  { title: "欧盟对中国电动汽车加征 17% 临时关税", threatLevel: "L3" as const, source: "eu-trade-defense" },
  { title: "澳洲锂矿出口量 Q2 环比下降 12%", threatLevel: "L2" as const, source: "commodities-board" },
  { title: "印度对华聚酯切片发起反补贴调查", threatLevel: "L2" as const, source: "india-trade" },
  { title: "全球芯片库存周转天数降至 45 天警戒线", threatLevel: "L2" as const, source: "semi-analytics" },
]

const AGENT_IDS = ["A1", "A2", "A3", "A4", "A5"] as const

// ─── 工具函数 ───────────────────────────────────────────────────────────

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randomFloat(min: number, max: number): number {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100
}

// ─── 事件生成器 ────────────────────────────────────────────────────────

function generateFlowTick(): IntelFlowTick {
  return {
    eventType: "intel.flow.tick",
    timestamp: new Date().toISOString(),
    capitalFlowIndex: randomFloat(30, 85),
    volumeIndex: randomFloat(20, 95),
    region: pick(REGIONS),
    version: "1.0.0",
  }
}

function generateSignal(): IntelSignalDetected {
  const template = pick(SIGNAL_POOL)
  return {
    eventType: "intel.signal.detected",
    signalId: `sig-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: template.title,
    threatLevel: template.threatLevel,
    confidence: randomFloat(0.65, 0.98),
    source: template.source,
    detectedAt: new Date().toISOString(),
    version: "1.0.0",
  }
}

function generateAlert(): IntelAlertTactical {
  const templates = [
    { title: "多个数据源同时检测到市场异常波动", description: "A1/A2 交叉验证确认，建议关注欧盟与东南亚市场的联动风险", threatLevel: "HIGH" as const },
    { title: "行业知识图谱关键节点连接度异常下降", description: "A3 拓扑分析发现 '碳关税' 节点周围连接减少 40%，政策关注度下降可能预示决策窗口期", threatLevel: "HIGH" as const },
    { title: "地缘政治风险指数突破 80 阈值", description: "多源交叉验证确认，建议启动沙盘推演评估最坏情景", threatLevel: "CRITICAL" as const },
  ]
  const t = pick(templates)
  return {
    eventType: "intel.alert.tactical",
    alertId: `alert-${Date.now()}`,
    title: t.title,
    description: t.description,
    threatLevel: t.threatLevel,
    triggeredAt: new Date().toISOString(),
    linkedSignalIds: [],
    version: "1.0.0",
  }
}

function generateHeartbeat(): IntelAgentHeartbeat {
  const agentId = pick(AGENT_IDS)
  return {
    eventType: "intel.agent.heartbeat",
    agentId,
    status: "running",
    lastRunAt: new Date().toISOString(),
    nextRunAt: new Date(Date.now() + 30_000).toISOString(),
    heartbeatAt: new Date().toISOString(),
    version: "1.0.0",
  }
}

// ─── 定时器句柄 ────────────────────────────────────────────────────────

const timers: ReturnType<typeof setInterval>[] = []

// ─── 启动 / 停止 ───────────────────────────────────────────────────────

/**
 * 启动 Mock Intel 事件生成器。
 * 仅在开发/测试环境调用，生产环境不应使用。
 */
export function startIntelMockGenerator(): void {
  if (timers.length > 0) return // 防止重复启动

  timers.push(
    // A2: 资金流向 tick（3s）
    setInterval(() => {
      try { emitIntelEvent(generateFlowTick()) } catch { /* 静默 */ }
    }, INTERVALS.FLOW_TICK),
  )

  timers.push(
    // A1: 战术信号（15s）
    setInterval(() => {
      try { emitIntelEvent(generateSignal()) } catch { /* 静默 */ }
    }, INTERVALS.SIGNAL),
  )

  timers.push(
    // A5: Agent 心跳（10s）
    setInterval(() => {
      try { emitIntelEvent(generateHeartbeat()) } catch { /* 静默 */ }
    }, INTERVALS.AGENT_HEARTBEAT),
  )

  timers.push(
    // 随机告警（120s）
    setInterval(() => {
      if (Math.random() < 0.4) { // 每次触发 40% 概率发出告警
        try { emitIntelEvent(generateAlert()) } catch { /* 静默 */ }
      }
    }, INTERVALS.ALERT),
  )

  // 启动时立即发射一批数据
  for (let i = 0; i < 5; i++) {
    setTimeout(() => {
      try { emitIntelEvent(generateFlowTick()) } catch { /* 静默 */ }
    }, i * 500)
  }
  try { emitIntelEvent(generateSignal()) } catch { /* 静默 */ }

  console.log("[IntelMock] 事件发生器启动: 3s flowTick / 15s signal / 10s heartbeat / 120s alert")
}

/**
 * 停止 Mock Intel 事件生成器。
 */
export function stopIntelMockGenerator(): void {
  for (const timer of timers) clearInterval(timer)
  timers.length = 0
  console.log("[IntelMock] 事件发生器已停止")
}

/**
 * 是否正在运行。
 */
export function isIntelMockRunning(): boolean {
  return timers.length > 0
}
