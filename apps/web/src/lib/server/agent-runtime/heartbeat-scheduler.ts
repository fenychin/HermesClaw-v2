/**
 * Heartbeat Scheduler — Agent 心跳调度器
 *
 * 职责：
 * - 从 Industry Pack manifest 读取 agentBindings 获取 heartbeatIntervalSec
 * - 按固定间隔调度各 Agent 的 Workflow DAG 执行
 * - A4（heartbeatIntervalSec=0）永不自动触发
 *
 * 相比前代改动：
 * - 从被动查询改为定时执行：periodicallyDispatch() 每 10s 检查一次
 * - 首次启动时立即执行一次所有 Agent（填充初始数据）
 * - 输出写入 WorkflowRun.outputContext，供 getKpiSnapshot/getKnowledgeGraph 消费
 *
 * 三域原则：此模块为 apps/web 集成层，负责 Prisma ↔ SDK ↔ AgentRunner 桥接。
 */
import { prisma } from "../../prisma"
import { loadIndustryManifest } from "@hermesclaw/industry-pack-sdk"
import type { IndustryManifest } from "@hermesclaw/event-contracts"
import { logger } from "../../logger"
import { runAgent } from "./agent-runner"
import { startIntelMockGenerator, isIntelMockRunning } from "@hermesclaw/openclaw-adapter"

// ─── Agent 绑定信息 ─────────────────────────────────────────────────

function getAgentBindings(manifest: IndustryManifest) {
  const raw = (manifest as Record<string, unknown>).agentBindings as
    | Array<{
        agentId: string
        panelId: string
        label: string
        heartbeatIntervalSec: number
        automationLevel: string
        triggerType: string
      }>
    | undefined
  return raw ?? []
}

// ─── 调度状态 ───────────────────────────────────────────────────────

interface AgentState {
  lastRunAt: number
  lastDurationMs: number
  runCount: number
  timer: ReturnType<typeof setInterval>
}

const agentStates = new Map<string, AgentState>()
const DISPATCH_INTERVAL_MS = 10_000 // 每 10s 检查一次

// ─── 运行时配置（由 startHeartbeatScheduler 注入） ──────────────────

let activePackId = "industry-intelligence-v2" // 默认值，调用方应主动注入
let dispatchTimer: ReturnType<typeof setInterval> | null = null

// ─── 调度执行 ───────────────────────────────────────────────────────

async function executeAgent(agentId: string): Promise<void> {
  const startTime = Date.now()
  try {
    const result = await runAgent({
      agentId,
      packId: activePackId,
      workspaceId: "default",
    })
    const duration = Date.now() - startTime

    const state = agentStates.get(agentId)
    if (state) {
      state.lastRunAt = Date.now()
      state.lastDurationMs = duration
      state.runCount++
    }

    logger.info(`[Scheduler] Agent ${agentId} 执行完成`, {
      status: result.status,
      durationMs: duration,
      nodeCount: result.nodeCount,
    })
  } catch (err) {
    logger.error(`[Scheduler] Agent ${agentId} 执行异常`, {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

async function checkAndDispatch(): Promise<void> {
  try {
    const manifest = loadIndustryManifest(activePackId)
    const bindings = getAgentBindings(manifest)

    for (const binding of bindings) {
      if (binding.heartbeatIntervalSec === 0) continue // A4

      const state = agentStates.get(binding.agentId)
      if (!state) continue // 该 Agent 未被调度

      const elapsed = Date.now() - state.lastRunAt
      const intervalMs = binding.heartbeatIntervalSec * 1000

      if (elapsed >= intervalMs) {
        executeAgent(binding.agentId).catch((err) =>
          logger.error(`[Scheduler] dispatch ${binding.agentId} 失败`, { error: String(err) })
        )
      }
    }
  } catch (err) {
    logger.error("[Scheduler] 调度检查异常", {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

// ─── 启动 / 停止 ───────────────────────────────────────────────────

/**
 * 启动 Agent 心跳调度器。
 *
 * @param packId  行业包 ID（来自调用方，不硬编码）
 * @param enableMock  是否同时启动 Mock SSE 事件发生器（仅开发/测试环境传入 true）
 */
export function startHeartbeatScheduler(
  packId = "industry-intelligence-v2",
  enableMock = false,
): void {
  // PERF(v3.42.05): 调试开关 — 设 DISABLE_INTEL_AGENTS=true 彻底关闭 Agent 执行
  // 用于隔离问题是数据管道还是渲染层导致的卡死
  if (process.env.DISABLE_INTEL_AGENTS === "true") {
    logger.info("[Scheduler] Agent 执行已禁用（DISABLE_INTEL_AGENTS=true），跳过启动")
    return
  }

  if (dispatchTimer) {
    logger.warn("[Scheduler] 调度器已在运行")
    return
  }

  activePackId = packId
  logger.info("[Scheduler] 启动 Agent 心跳调度", { packId, enableMock })

  // 仅在调用方显式要求时启动 Mock（除非 Agent 执行被禁用）
  if (enableMock && !isIntelMockRunning() && process.env.DISABLE_INTEL_AGENTS !== "true") {
    try {
      startIntelMockGenerator()
    } catch (err) {
      logger.error("[Scheduler] Mock 发生器启动失败", {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // 从 manifest 读取 bindings 并注册每个 Agent
  try {
    const manifest = loadIndustryManifest(packId)
    const bindings = getAgentBindings(manifest)

    for (const binding of bindings) {
      if (binding.heartbeatIntervalSec === 0) continue

      agentStates.set(binding.agentId, {
        lastRunAt: 0,
        lastDurationMs: 0,
        runCount: 0,
        timer: setInterval(() => {}, 0) as unknown as ReturnType<typeof setInterval>, // placeholder
      })

      logger.info(`[Scheduler] 注册 Agent ${binding.agentId} (间隔 ${binding.heartbeatIntervalSec}s)`)
    }
  } catch (err) {
    logger.error("[Scheduler] manifest 加载失败", {
      error: err instanceof Error ? err.message : String(err),
    })
  }

  // 立即执行一次所有已注册 Agent（每个 .catch 防止 unhandledRejection）
  for (const agentId of agentStates.keys()) {
    executeAgent(agentId).catch((err) =>
      logger.error("[Scheduler] 首次执行 Agent 失败", { agentId, error: String(err) })
    )
  }

  // 定期检查调度
  dispatchTimer = setInterval(() => {
    checkAndDispatch()
  }, DISPATCH_INTERVAL_MS)
}

/**
 * 停止 Agent 心跳调度器。
 */
export function stopHeartbeatScheduler(): void {
  if (dispatchTimer) {
    clearInterval(dispatchTimer)
    dispatchTimer = null
  }

  for (const [agentId, state] of agentStates) {
    logger.info(`[Scheduler] 停止 Agent ${agentId}（已执行 ${state.runCount} 次）`)
  }
  agentStates.clear()

  logger.info("[Scheduler] 调度器已停止")
}

/**
 * 获取调度器运行状态。
 */
export function getSchedulerStatus(): Array<{
  agentId: string
  running: boolean
  lastRunAt: number
  lastDurationMs: number
  runCount: number
}> {
  return Array.from(agentStates.entries()).map(([agentId, state]) => ({
    agentId,
    running: true,
    lastRunAt: state.lastRunAt,
    lastDurationMs: state.lastDurationMs,
    runCount: state.runCount,
  }))
}

export function isSchedulerRunning(): boolean {
  return dispatchTimer !== null
}

// ─── 向下兼容：旧版 dispatchHeartbeat 供 cron route 使用 ────────────

export interface HeartbeatDispatchItem {
  agentId: string
  panelId: string
  label: string
  heartbeatIntervalSec: number
  automationLevel: string
  lastRunAt: string | null
}

export interface HeartbeatDispatchResult {
  dispatched: HeartbeatDispatchItem[]
  skipped: Array<{ agentId: string; reason: string }>
}

export async function dispatchHeartbeat(
  packId = "industry-intelligence-v2",
): Promise<HeartbeatDispatchResult> {
  try {
    const manifest = loadIndustryManifest(packId)
    const bindings = getAgentBindings(manifest)
    const dispatched: HeartbeatDispatchItem[] = []
    const skipped: Array<{ agentId: string; reason: string }> = []

    for (const binding of bindings) {
      if (binding.heartbeatIntervalSec === 0) {
        skipped.push({ agentId: binding.agentId, reason: "user-initiated only" })
        continue
      }
      const state = agentStates.get(binding.agentId)
      dispatched.push({
        agentId: binding.agentId,
        panelId: binding.panelId,
        label: binding.label,
        heartbeatIntervalSec: binding.heartbeatIntervalSec,
        automationLevel: binding.automationLevel,
        lastRunAt: state ? new Date(state.lastRunAt).toISOString() : null,
      })
    }

    return { dispatched, skipped }
  } catch (err) {
    logger.error("[dispatchHeartbeat] 调度失败", {
      error: err instanceof Error ? err.message : String(err),
    })
    return { dispatched: [], skipped: [] }
  }
}
