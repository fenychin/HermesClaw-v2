/**
 * Workspace Member Service — 成员管理业务逻辑
 *
 * 从 apps/web/src/app/api/workspace/members/route.ts 下沉至此。
 */
import { prisma } from "@/lib/prisma"
import { writeAuditLog, actorFromSession } from "@/lib/server/audit"
import type { WorkspaceRole } from "@/lib/workspace"
import { z } from "zod"

export const InviteMemberSchema = z.object({ email: z.string().email(), role: z.enum(["VIEWER", "MEMBER", "ADMIN", "OWNER"]).optional().default("MEMBER") })
export const ChangeRoleSchema = z.object({ userId: z.string(), role: z.enum(["VIEWER", "MEMBER", "ADMIN", "OWNER"]) })
export const RemoveMemberSchema = z.object({ userId: z.string() })

export class MemberServiceError extends Error {
  constructor(public readonly httpStatus: number, message: string) { super(message); this.name = "MemberServiceError" }
}

export async function listMembers(workspaceId: string, page = 1, limit = 50) {
  const [members, total] = await Promise.all([
    prisma.workspaceMember.findMany({ where: { workspaceId }, include: { user: { select: { id: true, name: true, email: true, image: true } } }, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: "asc" } }),
    prisma.workspaceMember.count({ where: { workspaceId } }),
  ])
  return { items: members.map((m: any) => ({ id: m.id, role: m.role, user: m.user ? { id: m.user.id, name: m.user.name, email: m.user.email, image: m.user.image } : null, createdAt: m.createdAt?.toISOString() })), total, page, limit }
}

export async function inviteMember(workspaceId: string, email: string, role: WorkspaceRole) {
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) throw new MemberServiceError(404, "用户不存在")
  const existing = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: user.id } } })
  if (existing) throw new MemberServiceError(409, "该用户已是成员")
  const member = await prisma.workspaceMember.create({ data: { workspaceId, userId: user.id, role }, include: { user: { select: { id: true, name: true, email: true } } } })
  void writeAuditLog({ actor: await actorFromSession(), action: "member.invite", targetType: "member", targetId: member.id, detail: `邀请成员: ${email} 角色 ${role}`, riskLevel: "medium", workspaceId }).catch(() => {})
  return { id: member.id, role: member.role, user: member.user, createdAt: member.createdAt?.toISOString() }
}

export async function changeMemberRole(workspaceId: string, userId: string, role: WorkspaceRole) {
  const where = { workspaceId_userId: { workspaceId, userId } }
  const member = await prisma.workspaceMember.findUnique({ where })
  if (!member) throw new MemberServiceError(404, "成员不存在")
  const updated = await prisma.workspaceMember.update({ where, data: { role } })
  void writeAuditLog({ actor: await actorFromSession(), action: "member.role.change", targetType: "member", targetId: updated.id, detail: `变更角色: ${member.role} → ${role}`, riskLevel: "high", workspaceId }).catch(() => {})
  return { id: updated.id, role: updated.role }
}

export async function removeMember(workspaceId: string, userId: string) {
  const where = { workspaceId_userId: { workspaceId, userId } }
  const member = await prisma.workspaceMember.findUnique({ where })
  if (!member) throw new MemberServiceError(404, "成员不存在")
  await prisma.workspaceMember.delete({ where })
  void writeAuditLog({ actor: await actorFromSession(), action: "member.remove", targetType: "member", targetId: member.id, detail: `移除成员: ${userId}`, riskLevel: "high", workspaceId }).catch(() => {})
  return { removed: true }
}
