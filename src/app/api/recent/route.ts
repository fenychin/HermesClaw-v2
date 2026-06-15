import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger'
import { successResponse, errorResponse } from "@/lib/api-utils"
import { buildWorkspaceContext } from "@/lib/workspace"
import { writeAgentLog } from "@/lib/server/agent-log"
import type { RecentRecordItem } from "@/lib/api-client"

const LIMIT = 10

/** 带标签的子查询，供错误日志定位 */
interface LabeledQuery {
  label: string
  promise: Promise<RecentRecordItem[]>
}

/** GET /api/recent?type=all&industry=&workspaceId=xxx —— 聚合最近记录 */
export async function GET(request: Request) {
  const start = Date.now()
  const elapsed = () => `${((Date.now() - start) / 1000).toFixed(1)}s`

  try {
    const ctx = await buildWorkspaceContext(request)
    const url = new URL(request.url)
    const type = url.searchParams.get("type") ?? "all"
    const industry = url.searchParams.get("industry") ?? undefined

    const queries: LabeledQuery[] = []

    // ---- 最近对话 ----
    if (type === "all" || type === "conversation") {
      queries.push({
        label: "conversation",
        promise: prisma.conversation
          .findMany({
            where: { workspaceId: ctx.workspaceId },
            orderBy: { updatedAt: "desc" },
            take: LIMIT,
            select: { id: true, title: true, updatedAt: true },
          })
          .then((convs) =>
            convs.map((c) => ({
              id: c.id,
              type: "conversation" as const,
              title: c.title,
              timestamp: c.updatedAt.toISOString(),
              href: `/new?load=${c.id}`,
            })),
          ),
      })
    }

    // ---- 最近任务 ----
    if (type === "all" || type === "task") {
      queries.push({
        label: "task",
        promise: prisma.task
          .findMany({
            where: { workspaceId: ctx.workspaceId },
            orderBy: { updatedAt: "desc" },
            take: LIMIT,
            select: {
              id: true,
              title: true,
              updatedAt: true,
              status: true,
              priority: true,
              projectId: true,
            },
          })
          .then((tasks) =>
            tasks.map((t) => ({
              id: t.id,
              type: "task" as const,
              title: t.title,
              timestamp: t.updatedAt.toISOString(),
              href: t.projectId ? `/projects/${t.projectId}` : "/new",
              meta: { status: t.status, priority: t.priority },
            })),
          ),
      })
    }

    // ---- 最近项目 ----
    if (type === "all" || type === "project") {
      const projectWhere: Record<string, string> = {
        workspaceId: ctx.workspaceId,
      }
      if (industry) {
        projectWhere.type = industry
      }
      queries.push({
        label: "project",
        promise: prisma.project
          .findMany({
            where: projectWhere,
            orderBy: { updatedAt: "desc" },
            take: LIMIT,
            select: {
              id: true,
              name: true,
              updatedAt: true,
              type: true,
              country: true,
            },
          })
          .then((projects) =>
            projects.map((p) => ({
              id: p.id,
              type: "project" as const,
              title: p.name,
              timestamp: p.updatedAt.toISOString(),
              href: `/projects/${p.id}`,
              meta: { projectType: p.type, country: p.country },
            })),
          ),
      })
    }

    // ---- 最近文件 ----
    if (type === "all" || type === "file") {
      queries.push({
        label: "file",
        promise: prisma.auditLog
          .findMany({
            where: {
              workspaceId: ctx.workspaceId,
              action: "file.upload",
              status: "success",
            },
            orderBy: { createdAt: "desc" },
            take: LIMIT,
            select: { id: true, targetId: true, detail: true, createdAt: true },
          })
          .then((logs) =>
            logs.map((l) => ({
              id: l.targetId,
              type: "file" as const,
              title:
                l.detail?.replace(/ \(\d+(\.\d+)?MB\)$/, "") ?? "未知文件",
              timestamp: l.createdAt.toISOString(),
              href: "/files",
              meta: { auditId: l.id },
            })),
          ),
      })
    }

    // ---- 最近升级建议 ----
    if (type === "all" || type === "upgrade") {
      queries.push({
        label: "upgrade",
        promise: prisma.harnessProposal
          .findMany({
            where: { workspaceId: ctx.workspaceId },
            orderBy: { updatedAt: "desc" },
            take: LIMIT,
            select: {
              id: true,
              proposalId: true,
              problemStatement: true,
              status: true,
              updatedAt: true,
              proposedChange: true,
            },
          })
          .then((proposals) =>
            proposals.map((p) => ({
              id: p.id,
              type: "upgrade" as const,
              title: p.problemStatement,
              timestamp: p.updatedAt.toISOString(),
              href: "/settings?tab=harness",
              meta: {
                proposalId: p.proposalId,
                status: p.status,
                riskLevel:
                  (p.proposedChange as { riskLevel?: string } | null)?.riskLevel ?? null,
              },
            })),
          ),
      })
    }

    // Promise.allSettled：部分子查询失败不影响其余数据源返回
    const results = await Promise.allSettled(
      queries.map((q) => q.promise),
    )

    const allRecords: RecentRecordItem[] = []
    let failedCount = 0

    results.forEach((result, i) => {
      if (result.status === "fulfilled") {
        allRecords.push(...result.value)
      } else {
        failedCount++
        const reason =
          result.reason instanceof Error ? result.reason.message : "未知错误"
        logger.error(`GET /api/recent: 子查询 [${queries[i].label}] 失败`, {
          error: reason,
          workspaceId: ctx.workspaceId,
        })
      }
    })

    // 按时间戳降序排列
    allRecords.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    )

    // 部分失败写入 AgentLog（§4.4 闭环反馈）
    if (failedCount > 0) {
      void writeAgentLog({
        source: "hermes-chat",
        taskName: "最近记录聚合",
        status: "success",
        duration: elapsed(),
        detail: `部分数据源查询失败 (${failedCount}/${queries.length}): ${results
          .map((r, i) => (r.status === "rejected" ? queries[i].label : null))
          .filter(Boolean)
          .join(", ")}`,
        riskLevel: "low",
      })
    }

    return successResponse({ records: allRecords })
  } catch (error) {
    logger.error("GET /api/recent: 失败", {
      error: error instanceof Error ? error.message : "未知错误",
    })
    void writeAgentLog({
      source: "hermes-chat",
      taskName: "最近记录聚合",
      status: "error",
      duration: elapsed(),
      detail: error instanceof Error ? error.message : "聚合查询失败",
    })
    return errorResponse("服务器内部错误")
  }
}
