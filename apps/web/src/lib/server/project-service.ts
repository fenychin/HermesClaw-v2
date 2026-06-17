/**
 * Project Service — 项目列表与创建
 */
import { prisma } from "@/lib/prisma"
import { stringifyJsonField } from "@/lib/api-utils"
import { auditedWrite } from "@/lib/server/audited-write"

export async function listProjects(workspaceId: string, status: string, page: number, limit: number) {
  const where: Record<string, unknown> = { workspaceId }
  if (status) where.status = status
  const [projects, total] = await Promise.all([
    prisma.project.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
    prisma.project.count({ where }),
  ])
  const runs = await prisma.workflowRun.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" }, take: 2000, select: { inputContext: true, input: true, createdAt: true } })
  const processed = projects.map((project: any) => {
    let runCount = 0, lastRunTime = project.updatedAt.getTime()
    for (const run of runs) {
      let isMatch = false
      try { const c = (typeof run.inputContext === 'string' ? JSON.parse(run.inputContext) : run.inputContext) as any; if (c?.projectId === project.id) isMatch = true } catch {}
      if (!isMatch && run.input?.includes(project.id)) isMatch = true
      if (isMatch) { runCount++; const t = run.createdAt.getTime(); if (t > lastRunTime) lastRunTime = t }
    }
    let agents: any[] = [], tags: any[] = []
    try { agents = JSON.parse(project.activeAgents || "[]") } catch {}
    try { tags = JSON.parse(project.tags || "[]") } catch {}
    return { id: project.id, name: project.name, description: project.productLine || "", productLine: project.productLine || "", status: project.status, createdAt: project.createdAt.toISOString(), updatedAt: project.updatedAt.toISOString(), memberCount: (Array.isArray(agents) ? agents.length : 0) + 1, workflowRunCount: runCount, lastActivityAt: new Date(lastRunTime).toISOString(), tags, owner: project.owner, country: project.country, relatedClient: project.relatedClient }
  })
  return { projects: processed, total, page, limit }
}

export async function createProject(workspaceId: string, body: any, actor: string) {
  const projectId = crypto.randomUUID()
  const project = await auditedWrite({ actor, action: "project.created", targetType: "project", targetId: projectId, detail: `创建项目空间: ${body.name}`, riskLevel: "low", workspaceId, automationLevel: "L2", triggeredBy: "user" }, () => prisma.project.create({ data: { id: projectId, workspaceId, name: body.name, type: body.type, status: body.status, owner: body.owner, relatedClient: body.relatedClient, country: body.country, productLine: body.productLine, activeAgents: stringifyJsonField(body.activeAgents), riskPoints: stringifyJsonField(body.riskPoints), nextActions: stringifyJsonField(body.nextActions), tags: stringifyJsonField(body.tags) } }))
  try { await prisma.memory.create({ data: { id: crypto.randomUUID(), workspaceId, type: "mid", content: `项目空间「${body.name}」创建于 ${new Date().toISOString()}`, summary: `项目 ${body.name} 初始化`, source: "project.create", projectId, confidence: 1.0, tags: stringifyJsonField(["project-init", body.type]) } }) } catch {}
  return project
}
