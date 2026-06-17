/**
 * Project Mutation Service — 项目变更（PATCH/DELETE）
 */
import { prisma } from "@/lib/prisma"
import { stringifyJsonField } from "@/lib/api-utils"
import { writeAuditLog, actorFromSession } from "@/lib/server/audit"

export class ProjectMutationError extends Error {
  constructor(public readonly httpStatus: number, message: string) { super(message); this.name = "ProjectMutationError" }
}

export async function patchProject(id: string, workspaceId: string, body: any) {
  const existing = await prisma.project.findUnique({ where: { id, workspaceId } })
  if (!existing) throw new ProjectMutationError(404, "项目不存在")
  const data: any = {}
  for (const k of ["name", "type", "status", "owner", "relatedClient", "country", "productLine"] as const) if (body[k] !== undefined) data[k] = body[k]
  for (const k of ["tags", "activeAgents", "riskPoints", "nextActions"] as const) if (body[k] !== undefined) data[k] = stringifyJsonField(body[k])
  const project = await prisma.project.update({ where: { id }, data })
  void writeAuditLog({ actor: await actorFromSession(), action: "project.update", targetType: "project", targetId: id, detail: `更新项目: ${project.name}`, riskLevel: "low", workspaceId }).catch(() => {})
  return project
}

export async function deleteProject(id: string, workspaceId: string) {
  const existing = await prisma.project.findUnique({ where: { id, workspaceId } })
  if (!existing) throw new ProjectMutationError(404, "项目不存在")
  await prisma.project.delete({ where: { id } })
  void writeAuditLog({ actor: await actorFromSession(), action: "project.delete", targetType: "project", targetId: id, detail: `删除项目: ${existing.name}`, riskLevel: "high", workspaceId }).catch(() => {})
  return { deleted: true }
}
