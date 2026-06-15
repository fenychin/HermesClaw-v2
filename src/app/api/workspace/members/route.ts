/**
 * Workspace 成员管理 API
 * —— GET 列出成员 / POST 邀请 / PATCH 变更角色 / DELETE 移除
 * —— RBAC：仅 ADMIN/OWNER 可管理成员
 */
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { successResponse, errorResponse } from "@/lib/api-utils"
import { writeAuditLog, actorFromSession } from "@/lib/server/audit"
import {
  buildWorkspaceContext,
  guardRole,
  type WorkspaceRole,
  WORKSPACE_ROLES,
} from "@/lib/workspace"
import { z } from "zod"

// ---- Schema ----

const InviteMemberSchema = z.object({
  email: z.string().email("请输入有效邮箱"),
  role: z.string().refine((r) => (WORKSPACE_ROLES as readonly string[]).includes(r), {
    message: "无效的角色，可选：OWNER / ADMIN / MEMBER / VIEWER",
  }),
})

const ChangeRoleSchema = z.object({
  userId: z.string().min(1),
  role: z.string().refine((r) => (WORKSPACE_ROLES as readonly string[]).includes(r), {
    message: "无效的角色",
  }),
})

// ---- GET /api/workspace/members ----

export async function GET(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request)

    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId: ctx.workspaceId },
      include: {
        user: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
      orderBy: { userId: "asc" },
    })

    const workspace = await prisma.workspace.findUnique({
      where: { id: ctx.workspaceId },
      select: { id: true, name: true, plan: true, createdAt: true, automationLevel: true },
    })

    return successResponse({
      workspace,
      members: members.map((m) => ({
        userId: m.userId,
        name: m.user.name ?? "未知用户",
        email: m.user.email,
        image: m.user.image,
        role: m.role as WorkspaceRole,
      })),
    })
  } catch (error) {
    logger.error("GET /api/workspace/members: 失败", {
      error: error instanceof Error ? error.message : "未知错误",
    })
    return errorResponse("服务器内部错误")
  }
}

// ---- POST /api/workspace/members (邀请成员) ----

export async function POST(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request)

    // RBAC：仅 ADMIN/OWNER 可邀请
    const inviteGuard = guardRole(ctx.role, "ADMIN", "权限不足，仅管理员可邀请成员")
    if (inviteGuard) return inviteGuard

    const body = await request.json()
    const parsed = InviteMemberSchema.safeParse(body)
    if (!parsed.success) {
      return errorResponse(
        parsed.error.issues.map((i) => i.message).join("；"),
        400,
      )
    }

    // 查找被邀请用户
    const targetUser = await prisma.user.findUnique({
      where: { email: parsed.data.email },
    })
    if (!targetUser) {
      return errorResponse("用户不存在，请确认邮箱地址", 404)
    }

    // 检查是否已是成员
    const existing = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: ctx.workspaceId,
          userId: targetUser.id,
        },
      },
    })
    if (existing) {
      return errorResponse("该用户已是此工作空间的成员", 409)
    }

    // OWNER 角色保护：不可邀请他人为 OWNER（仅限初始创建）
    if (parsed.data.role === "OWNER") {
      return errorResponse("不可通过邀请设置 OWNER 角色", 400)
    }

    const member = await prisma.workspaceMember.create({
      data: {
        workspaceId: ctx.workspaceId,
        userId: targetUser.id,
        role: parsed.data.role,
      },
    })

    await writeAuditLog({
      actor: await actorFromSession(),
      action: "invite.member",
      targetType: "workspace",
      targetId: ctx.workspaceId,
      detail: `邀请 ${targetUser.email} 加入，角色 ${parsed.data.role}`,
      riskLevel: "low",
      workspaceId: ctx.workspaceId,
    })

    return successResponse(
      {
        userId: member.userId,
        role: member.role,
        name: targetUser.name ?? "未知用户",
        email: targetUser.email,
        image: targetUser.image,
      },
      201,
    )
  } catch (error) {
    logger.error("POST /api/workspace/members: 失败", {
      error: error instanceof Error ? error.message : "未知错误",
    })
    return errorResponse("服务器内部错误")
  }
}

// ---- PATCH /api/workspace/members (变更角色) ----

export async function PATCH(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request)

    // RBAC：仅 ADMIN/OWNER 可变更角色
    const changeGuard = guardRole(ctx.role, "ADMIN", "权限不足，仅管理员可变更角色")
    if (changeGuard) return changeGuard

    const body = await request.json()
    const parsed = ChangeRoleSchema.safeParse(body)
    if (!parsed.success) {
      return errorResponse(
        parsed.error.issues.map((i) => i.message).join("；"),
        400,
      )
    }

    // OWNER 不可被降级
    const targetMember = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: ctx.workspaceId,
          userId: parsed.data.userId,
        },
      },
    })
    if (!targetMember) {
      return errorResponse("成员不存在", 404)
    }
    if (targetMember.role === "OWNER" && parsed.data.role !== "OWNER") {
      return errorResponse("不可降级 OWNER 角色", 403)
    }
    // 仅 OWNER 可设置他人为 OWNER
    if (parsed.data.role === "OWNER" && ctx.role !== "OWNER") {
      return errorResponse("仅 OWNER 可授予 OWNER 角色", 403)
    }

    const updated = await prisma.workspaceMember.update({
      where: {
        workspaceId_userId: {
          workspaceId: ctx.workspaceId,
          userId: parsed.data.userId,
        },
      },
      data: { role: parsed.data.role },
    })

    await writeAuditLog({
      actor: await actorFromSession(),
      action: "change.role",
      targetType: "workspace",
      targetId: ctx.workspaceId,
      detail: `变更用户 ${parsed.data.userId} 角色：${targetMember.role} → ${parsed.data.role}`,
      riskLevel: "medium",
      workspaceId: ctx.workspaceId,
    })

    return successResponse({ userId: updated.userId, role: updated.role })
  } catch (error) {
    logger.error("PATCH /api/workspace/members: 失败", {
      error: error instanceof Error ? error.message : "未知错误",
    })
    return errorResponse("服务器内部错误")
  }
}

// ---- DELETE /api/workspace/members (移除成员) ----

export async function DELETE(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request)

    // RBAC：仅 ADMIN/OWNER 可移除成员
    const removeGuard = guardRole(ctx.role, "ADMIN", "权限不足，仅管理员可移除成员")
    if (removeGuard) return removeGuard

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("userId")
    if (!userId) {
      return errorResponse("缺少 userId 参数", 400)
    }

    // OWNER 不可被移除
    const targetMember = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: ctx.workspaceId,
          userId,
        },
      },
    })
    if (!targetMember) {
      return errorResponse("成员不存在", 404)
    }
    if (targetMember.role === "OWNER") {
      return errorResponse("不可移除 OWNER", 403)
    }

    await prisma.workspaceMember.delete({
      where: {
        workspaceId_userId: {
          workspaceId: ctx.workspaceId,
          userId,
        },
      },
    })

    await writeAuditLog({
      actor: await actorFromSession(),
      action: "remove.member",
      targetType: "workspace",
      targetId: ctx.workspaceId,
      detail: `移除成员 ${userId}`,
      riskLevel: "medium",
      workspaceId: ctx.workspaceId,
    })

    return successResponse({ removed: true })
  } catch (error) {
    logger.error("DELETE /api/workspace/members: 失败", {
      error: error instanceof Error ? error.message : "未知错误",
    })
    return errorResponse("服务器内部错误")
  }
}
