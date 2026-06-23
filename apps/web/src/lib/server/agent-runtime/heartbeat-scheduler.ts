/**
 * Heartbeat Scheduler — Agent 心跳调度器
 *
 * 职责：
 * - 从 Industry Pack manifest 读取 agentBindings 获取 heartbeatIntervalSec
 * - 查询 DB 中各 Agent 最近一次 WorkflowRun 完成时间
 * - 计算应触发 Agent 列表：now - lastRun >= intervalMs
 * - A4（heartbeatIntervalSec=0）永不自动触发
 *
 * 三域原则：此模块为 apps/web 集成层，负责 Prisma ↔ SDK 桥接。
 * 不得在此写入行业特定逻辑（属于 Industry Pack Layer）。
 */
import { prisma } from "@/lib/prisma"
import { loadIndustryManifest } from "@hermesclaw/industry-pack-sdk"
import type { IndustryManifest } from "@hermesclaw/event-contracts"
import { logger } from "@/lib/logger"

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

// ─── 调度逻辑 ───────────────────────────────────────────────────────

/**
 * 查询各 Agent 最近一次运行完成时间并判定应触发列表。
 *
 * 算法：
 * 1. 读取 manifest 获取 agentBindings
 * 2. 对每个 agent 查询最近一次 completed WorkflowRun
 * 3. now - lastCompletedAt >= heartbeatIntervalSec → 触发
 * 4. A4 (interval=0) → 跳过
 */
export async function dispatchHeartbeat(
  packId = "industry-intelligence-v2",
): Promise<HeartbeatDispatchResult> {
  const manifest = loadIndustryManifest(packId)
  const bindings = getAgentBindings(manifest)

  if (bindings.length === 0) {
    logger.warn("[HeartbeatScheduler] 无 agentBindings 配置", { packId })
    return { dispatched: [], skipped: [] }
  }

  const now = Date.now()
  const dispatched: HeartbeatDispatchItem[] = []
  const skipped: Array<{ agentId: string; reason: string }> = []

  for (const binding of bindings) {
    // A4 为 user-initiated，跳过自动调度
    if (binding.heartbeatIntervalSec === 0) {
      skipped.push({ agentId: binding.agentId, reason: "user-initiated only" })
      continue
    }

    // 查找该 Agent 最近一次 WorkflowRun
    const lastRun = await prisma.workflowRun.findFirst({
      where: {
        workspaceId: "default",
        agentId: binding.agentId,
        status: "completed",
      },
      orderBy: { completedAt: "desc" },
      select: { completedAt: true },
    })

    const lastCompletedAt = lastRun?.completedAt?.getTime() ?? 0
    const elapsed = now - lastCompletedAt
    const intervalMs = binding.heartbeatIntervalSec * 1000

    if (elapsed >= intervalMs) {
      dispatched.push({
        agentId: binding.agentId,
        panelId: binding.panelId,
        label: binding.label,
        heartbeatIntervalSec: binding.heartbeatIntervalSec,
        automationLevel: binding.automationLevel,
        lastRunAt: lastRun?.completedAt?.toISOString() ?? null,
      })
    } else {
      skipped.push({
        agentId: binding.agentId,
        reason: `next run in ${Math.ceil((intervalMs - elapsed) / 1000)}s`,
      })
    }
  }

  logger.info("[HeartbeatScheduler] 调度完成", {
    packId,
    dispatched: dispatched.map((d) => d.agentId),
    skippedCount: skipped.length,
  })

  return { dispatched, skipped }
}
