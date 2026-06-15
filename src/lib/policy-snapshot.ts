/**
 * 当前活跃的策略快照版本号读取工具。
 *
 * AGENTS.md §3.3：TaskEnvelope.policySnapshotVersion 是治理留痕必备字段，
 * 用于把每次任务派发与当时生效的 Harness Bundle 关联起来，便于回放与回滚。
 *
 * 契约 schema 要求 semver 形式（VersionSchema = /^\d+\.\d+\.\d+$/）。
 *
 * —— 当前实现：返回固定 baseline；后续接入 HarnessBundle 后改为读取实际版本。
 *    若未来需要将 proposalId 等业务标识写入 envelope，应在 envelope 上新增独立字段，
 *    而不是把非 semver 字符串塞进 policySnapshotVersion。
 *
 * —— TODO（v0.13+）：拆出独立的 PolicySnapshot 表，与 HarnessBundle / EvolutionLog 联动，
 *    支持版本灰度、回滚到任意快照。
 */

import { logger } from "@/lib/logger"

/** 仓库默认 baseline，与 packages/event-contracts 当前 CONTRACT_VERSION 对齐 */
const DEFAULT_POLICY_SNAPSHOT_VERSION = "1.0.0"

/**
 * 读取当前 workspace + agent 生效的策略快照版本号（semver）。
 * —— 失败一律降级到默认 baseline，不阻断主流程。
 */
export async function getCurrentPolicySnapshotVersion(
  workspaceId: string,
  agentId?: string,
): Promise<string> {
  // E2 修复：防御性 try/catch 骨架，防止未来接入 HarnessBundle 表后首次查询异常冒泡
  try {
    // TODO（v0.13+）：接入 HarnessBundle / PolicySnapshot 表，读取实际版本
    void workspaceId
    void agentId
    return DEFAULT_POLICY_SNAPSHOT_VERSION
  } catch (error) {
    logger.warn("[policy-snapshot] 读取快照版本失败，降级到默认 baseline", {
      workspaceId,
      agentId,
      error: error instanceof Error ? error.message : String(error),
    })
    return DEFAULT_POLICY_SNAPSHOT_VERSION
  }
}
