/**
 * 治理定时器服务 — canary 健康评估 + 审批 Checkpoint 过期清理
 *
 * 三域归属：Hermes Control Kernel（治理层）
 *
 * P2 治理闭环：将 evaluateCanaryHealth() 和 expireStaleCheckpoints() 的对 API 调用的
 * 被动触发改为独立定时器驱动，避免无 metrics 提供者时 canary 永远 stuck 在 running 状态。
 *
 * 在进程启动时调用 startGovernanceTimers() 即可开始周期评估。
 */
import { evaluateCanaryHealth } from "@/lib/server/canary"
import { expireStaleCheckpoints } from "@/lib/server/approval"
import { logger } from "@/lib/logger"

const CANARY_EVAL_INTERVAL_MS = 60_000   // 每 60s 评估一次
const STALE_CHECKPOINT_INTERVAL_MS = 120_000 // 每 2 分钟清理一次

let canaryTimer: ReturnType<typeof setInterval> | null = null
let staleCheckpointTimer: ReturnType<typeof setInterval> | null = null

/**
 * 启动治理定时器（幂等——重复调用不会创建重复定时器）。
 * 应在进程启动时（如 instrumentation.ts 或 sandbox server 入口）调用。
 */
export function startGovernanceTimers(): void {
  if (canaryTimer) {
    logger.info("[GovernanceTimers] canary 定时器已运行，跳过重复启动")
  } else {
    canaryTimer = setInterval(async () => {
      try {
        const result = await evaluateCanaryHealth()
        if (result.promoted > 0 || result.rolledBack > 0 || result.ambiguous > 0 || result.earlyAborted > 0) {
          logger.info("[GovernanceTimers] canary 评估完成", result)
        }
      } catch (err) {
        logger.error("[GovernanceTimers] canary 评估异常", {
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }, CANARY_EVAL_INTERVAL_MS)
    logger.info("[GovernanceTimers] canary 健康评估定时器已启动", { intervalMs: CANARY_EVAL_INTERVAL_MS })
  }

  if (staleCheckpointTimer) {
    logger.info("[GovernanceTimers] stale-checkpoint 定时器已运行，跳过重复启动")
  } else {
    staleCheckpointTimer = setInterval(async () => {
      try {
        const { expired } = await expireStaleCheckpoints()
        if (expired > 0) {
          logger.info("[GovernanceTimers] 审批超时清理完成", { expired })
        }
      } catch (err) {
        logger.error("[GovernanceTimers] stale-checkpoint 清理异常", {
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }, STALE_CHECKPOINT_INTERVAL_MS)
    logger.info("[GovernanceTimers] stale-checkpoint 清理定时器已启动", { intervalMs: STALE_CHECKPOINT_INTERVAL_MS })
  }
}

/**
 * 停止治理定时器（用于测试清理或进程退出）。
 */
export function stopGovernanceTimers(): void {
  if (canaryTimer) { clearInterval(canaryTimer); canaryTimer = null }
  if (staleCheckpointTimer) { clearInterval(staleCheckpointTimer); staleCheckpointTimer = null }
  logger.info("[GovernanceTimers] 所有治理定时器已停止")
}
