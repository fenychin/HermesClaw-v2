/**
 * Recent Records Service — 最近记录聚合（以 AuditLog 为真相源）
 *
 * —— CLAUDE.md §8.1：AuditLog 是治理与审计真相源
 * —— 删除旧五表联邦查询，改为单一 AuditLog 聚合
 * —— 所有在 /workspace/recent 展示的记录均来自已审计动作
 */
import { prisma } from "@/lib/prisma"
import { writeAgentLog } from "@/lib/server/agent-log"
import { logger } from "@/lib/logger"
import type { RecentRecordItem } from "@/lib/api-client"

const LIMIT = 50

// ============================================================
// 辅助函数
// ============================================================

/** action 前缀 → UI type 推断 */
function inferUiTypeFromAction(action: string): RecentRecordItem["type"] {
  const prefix = action.split(".")[0]
  const map: Record<string, RecentRecordItem["type"]> = {
    conversation: "conversation",
    task: "task",
    project: "project",
    file: "file",
    proposal: "upgrade",
    workflow: "workflow",
    connector: "connector",
    approval: "approval",
  }
  return map[prefix] ?? "system"
}

/** targetType + action → 跳转链接 */
function buildResourceLink(
  targetType: string,
  targetId: string,
  action: string,
  workflowRunId: string | null | undefined,
  projectId?: string | null,
): string {
  const linkMap: Record<string, string> = {
    conversation: projectId
      ? `/projects/${projectId}?load=${targetId}`
      : `/workspace/chat?load=${targetId}`,
    task: `/workspace/tasks`,
    project: `/projects/${targetId}`,
    proposal: `/workspace/settings?tab=harness`,
    workflow: workflowRunId
      ? `/workspace/workflows/runs/${workflowRunId}`
      : `/workspace/workflows`,
    agent: `/workspace/agents/${targetId}`,
    connector: `/workspace/brain/connectors`,
    approval: `/workspace/approvals`,
    file: `/files`,
    memory: `/workspace/brain/memory`,
  }
  return linkMap[targetType] ?? `/workspace/chat`
}

/** action 标签映射（供无 detail 记录使用） */
const ACTION_LABELS: Record<string, string> = {
  "conversation.create": "新对话已创建",
  "conversation.message": "新消息",
  "task.create": "新任务已创建",
  "task.dispatch": "任务已派发",
  "task.cancel": "任务已取消",
  "project.create": "新项目已创建",
  "project.update": "项目已更新",
  "project.archive": "项目已归档",
  "workflow.generate": "工作流已生成",
  "workflow.run": "工作流已启动",
  "file.upload": "文件已上传",
  "file.delete": "文件已删除",
  "proposal.create": "新提案已提交",
  "proposal.approve": "提案已批准",
  "proposal.reject": "提案已驳回",
  "connector.create": "连接器已创建",
  "connector.authorize": "连接器已授权",
  "approval.requested": "审批已发起",
  "approval.resolved": "审批已通过",
  "approval.rejected": "审批已驳回",
}

function formatActionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action
}

/** 提取展示标题 */
function extractTitle(detail: string | null, action: string): string {
  if (detail) return detail
  return formatActionLabel(action)
}

// ============================================================
// type 筛选 → action 映射
// ============================================================

const TYPE_ACTION_MAP: Record<string, string[]> = {
  conversation: ["conversation.create", "conversation.message"],
  task: ["task.create", "task.dispatch", "task.cancel"],
  project: ["project.create", "project.update", "project.archive"],
  file: ["file.upload", "file.delete"],
  upgrade: ["proposal.create", "proposal.approve", "proposal.reject"],
  workflow: ["workflow.generate", "workflow.run"],
  approval: [
    "approval.requested",
    "approval.resolved",
    "approval.rejected",
    "proposal.approve",
    "proposal.reject",
  ],
  connector: ["connector.create", "connector.authorize", "connector.execute"],
}

// ============================================================
// 核心函数
// ============================================================

/** 将 AuditLog 记录映射为 RecentRecordItem */
function mapAuditLogToRecentRecord(
  log: {
    id: string
    action: string
    actor: string
    targetType: string
    targetId: string
    detail: string | null
    riskLevel: string | null
    status: string
    workflowRunId: string | null
    createdAt: Date
  },
  convProjectMap: Map<string, string | null>,
): RecentRecordItem {
  const uiType = inferUiTypeFromAction(log.action)
  const associatedProjectId = log.targetType === "conversation"
    ? convProjectMap.get(log.targetId) || null
    : null

  const href = buildResourceLink(
    log.targetType,
    log.targetId,
    log.action,
    log.workflowRunId,
    associatedProjectId,
  )
  const title = extractTitle(log.detail, log.action)

  return {
    id: log.id,
    type: uiType,
    title,
    timestamp: log.createdAt.toISOString(),
    href,
    action: log.action,
    traceId: log.id,
    workflowRunId: log.workflowRunId ?? undefined,
    targetType: log.targetType,
    targetId: log.targetId,
    status: log.status,
    projectId: associatedProjectId,
    meta: {
      actor: log.actor,
      riskLevel: log.riskLevel,
      action: log.action,
      targetType: log.targetType,
      targetId: log.targetId,
      workflowRunId: log.workflowRunId,
    },
  }
}

/**
 * 获取最近记录 —— 以 AuditLog 为单一真相源
 *
 * —— 查询 status="success" 的审计日志
 * —— 按 type 参数映射到对应的 action 集合做筛选
 */
export async function getRecentRecords(
  workspaceId: string,
  type: string,
): Promise<{ records: RecentRecordItem[] }> {
  const start = Date.now()
  try {
    const where: Record<string, unknown> = {
      workspaceId,
      status: "success",
    }

    // type 筛选 → action in 集合
    if (type !== "all" && TYPE_ACTION_MAP[type]) {
      where.action = { in: TYPE_ACTION_MAP[type] }
    }

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: LIMIT,
      select: {
        id: true,
        action: true,
        actor: true,
        targetType: true,
        targetId: true,
        detail: true,
        riskLevel: true,
        status: true,
        workflowRunId: true,
        createdAt: true,
      },
    })

    // 对相同资源类型与资源的最近审计事件在内存中去重，保证同一条目（如同一个对话）不重复出现在最近列表中
    const seen = new Set<string>()
    const uniqueLogs = []
    for (const log of logs) {
      const key = `${log.targetType}-${log.targetId}`
      if (!seen.has(key)) {
        seen.add(key)
        uniqueLogs.push(log)
      }
    }

    // 批量提取会话的 projectId，用以生成跳转到项目的具体 href
    const conversationIds = uniqueLogs
      .filter((l) => l.targetType === "conversation")
      .map((l) => l.targetId)

    const conversations = conversationIds.length > 0
      ? await prisma.conversation.findMany({
          where: { id: { in: conversationIds } },
          select: { id: true, projectId: true },
        })
      : []

    const convProjectMap = new Map<string, string | null>(
      conversations.map((c) => [c.id, c.projectId]),
    )

    const records = uniqueLogs.map((log) => mapAuditLogToRecentRecord(log, convProjectMap))
    return { records }
  } catch (error) {
    logger.error(
      `recent-service: AuditLog 查询失败 — ${error instanceof Error ? error.message : String(error)}`,
    )
    void writeAgentLog({
      source: "hermes-chat",
      taskName: "最近记录聚合",
      status: "error",
      duration: `${((Date.now() - start) / 1000).toFixed(1)}s`,
      detail: error instanceof Error ? error.message : "AuditLog 查询失败",
    })
    // 降级返回空数组，确保页面不崩溃
    return { records: [] }
  }
}
