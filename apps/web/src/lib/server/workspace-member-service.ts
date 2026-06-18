/**
 * Workspace Member Service — 成员管理业务逻辑
 *
 * 从 apps/web/src/app/api/workspace/members/route.ts 下沉至此。
 *
 * v3.20（TD-2026-06-17-002 已修复）：
 *   - WorkspaceMember 已具备独立 id（cuid PK）+ createdAt 列；
 *   - 复合 (workspaceId, userId) 改为 @@unique，业务唯一性语义不变；
 *   - 不再用 `${workspaceId}:${userId}` 拼接对外 id，统一使用真实 id。
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

/** listMembers / inviteMember / changeMemberRole / removeMember 的统一返回形态 */
type MemberDTO = {
  id: string
  role: string
  createdAt: Date
  user: { id: string; name: string | null; email: string } | null
}

const userSelect = { id: true, name: true, email: true } as const
const memberSelect = { id: true, role: true, createdAt: true, user: { select: userSelect } } as const

export async function listMembers(workspaceId: string, page = 1, limit = 50) {
  const [members, total] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: { workspaceId },
      select: memberSelect,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: "asc" },
    }),
    prisma.workspaceMember.count({ where: { workspaceId } }),
  ])
  const items: MemberDTO[] = members.map((m) => ({
    id: m.id,
    role: m.role,
    createdAt: m.createdAt,
    user: m.user ? { id: m.user.id, name: m.user.name, email: m.user.email } : null,
  }))
  return { items, total, page, limit }
}

export async function inviteMember(workspaceId: string, email: string, role: WorkspaceRole) {
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) throw new MemberServiceError(404, "用户不存在")
  const existing = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: user.id } } })
  if (existing) throw new MemberServiceError(409, "该用户已是成员")
  const member = await prisma.workspaceMember.create({
    data: { workspaceId, userId: user.id, role },
    select: memberSelect,
  })
  void writeAuditLog({ actor: await actorFromSession(), action: "member.invite", targetType: "member", targetId: member.id, detail: `邀请成员: ${email} 角色 ${role}`, riskLevel: "medium", workspaceId }).catch(() => {})
  const dto: MemberDTO = { id: member.id, role: member.role, createdAt: member.createdAt, user: member.user }
  return dto
}

export async function changeMemberRole(workspaceId: string, userId: string, role: WorkspaceRole) {
  const where = { workspaceId_userId: { workspaceId, userId } }
  const existing = await prisma.workspaceMember.findUnique({ where })
  if (!existing) throw new MemberServiceError(404, "成员不存在")
  const updated = await prisma.workspaceMember.update({ where, data: { role }, select: { id: true, role: true } })
  void writeAuditLog({ actor: await actorFromSession(), action: "member.role.change", targetType: "member", targetId: updated.id, detail: `变更角色: ${existing.role} → ${role}`, riskLevel: "high", workspaceId }).catch(() => {})
  return { id: updated.id, role: updated.role }
}

export async function removeMember(workspaceId: string, userId: string) {
  const where = { workspaceId_userId: { workspaceId, userId } }
  const member = await prisma.workspaceMember.findUnique({ where, select: { id: true } })
  if (!member) throw new MemberServiceError(404, "成员不存在")
  await prisma.workspaceMember.delete({ where })
  void writeAuditLog({ actor: await actorFromSession(), action: "member.remove", targetType: "member", targetId: member.id, detail: `移除成员: ${userId}`, riskLevel: "high", workspaceId }).catch(() => {})
  return { removed: true }
}
