/**
 * Recent Records Service — 最近记录聚合
 */
import { prisma } from "@/lib/prisma"
import { writeAgentLog } from "@/lib/server/agent-log"
import { logger } from "@/lib/logger"
import type { RecentRecordItem } from "@/lib/api-client"

const LIMIT = 10

export async function getRecentRecords(workspaceId: string, type: string, industry?: string): Promise<{ records: RecentRecordItem[] }> {
  const start = Date.now()
  const queries: Array<{ label: string; promise: Promise<RecentRecordItem[]> }> = []
  if (type === "all" || type === "conversation") queries.push({ label: "conversation", promise: prisma.conversation.findMany({ where: { workspaceId }, orderBy: { updatedAt: "desc" }, take: LIMIT, select: { id: true, title: true, updatedAt: true } }).then(c => c.map(x => ({ id: x.id, type: "conversation" as const, title: x.title, timestamp: x.updatedAt.toISOString(), href: `/new?load=${x.id}` }))) })
  if (type === "all" || type === "task") queries.push({ label: "task", promise: prisma.task.findMany({ where: { workspaceId }, orderBy: { updatedAt: "desc" }, take: LIMIT, select: { id: true, title: true, updatedAt: true, status: true, priority: true, projectId: true } }).then(t => t.map(x => ({ id: x.id, type: "task" as const, title: x.title, timestamp: x.updatedAt.toISOString(), href: x.projectId ? `/projects/${x.projectId}` : "/new", meta: { status: x.status, priority: x.priority } }))) })
  if (type === "all" || type === "project") { const where: Record<string, string> = { workspaceId }; if (industry) where.type = industry; queries.push({ label: "project", promise: prisma.project.findMany({ where, orderBy: { updatedAt: "desc" }, take: LIMIT, select: { id: true, name: true, updatedAt: true, type: true, country: true } }).then(p => p.map(x => ({ id: x.id, type: "project" as const, title: x.name, timestamp: x.updatedAt.toISOString(), href: `/projects/${x.id}`, meta: { projectType: x.type, country: x.country } }))) }) }
  if (type === "all" || type === "file") queries.push({ label: "file", promise: prisma.auditLog.findMany({ where: { workspaceId, action: "file.upload", status: "success" }, orderBy: { createdAt: "desc" }, take: LIMIT, select: { id: true, targetId: true, detail: true, createdAt: true } }).then(l => l.map(x => ({ id: x.targetId, type: "file" as const, title: x.detail?.replace(/ \(\d+(\.\d+)?MB\)$/, "") ?? "未知文件", timestamp: x.createdAt.toISOString(), href: "/files", meta: { auditId: x.id } }))) })
  if (type === "all" || type === "upgrade") queries.push({ label: "upgrade", promise: prisma.harnessProposal.findMany({ where: { workspaceId }, orderBy: { updatedAt: "desc" }, take: LIMIT, select: { id: true, proposalId: true, problemStatement: true, status: true, updatedAt: true, proposedChange: true } }).then(p => p.map(x => ({ id: x.id, type: "upgrade" as const, title: x.problemStatement, timestamp: x.updatedAt.toISOString(), href: "/settings?tab=harness", meta: { proposalId: x.proposalId, status: x.status, riskLevel: (x.proposedChange as any)?.riskLevel ?? null } }))) })
  const results = await Promise.allSettled(queries.map(q => q.promise))
  const all: RecentRecordItem[] = []; let failedCount = 0
  results.forEach((r, i) => { if (r.status === "fulfilled") all.push(...r.value); else { failedCount++; logger.error(`recent: ${queries[i].label} 失败`) } })
  all.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  if (failedCount > 0) void writeAgentLog({ source: "hermes-chat", taskName: "最近记录聚合", status: "success", duration: `${((Date.now() - start) / 1000).toFixed(1)}s`, detail: `${failedCount}/${queries.length} 失败`, riskLevel: "low" })
  return { records: all }
}
