/**
 * Workspace 模型路由设置 API
 * —— GET 读取当前配置 / PATCH 更新默认模型与各 taskType Provider
 * —— RBAC：仅 OWNER/ADMIN 可修改（写操作经 guardRole 门禁）
 */
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { successResponse, errorResponse, parseJsonField } from "@/lib/api-utils"
import { writeAuditLog, actorFromSession } from "@/lib/server/audit"
import { buildWorkspaceContext, guardRole } from "@/lib/workspace"
import { z } from "zod"

// ---- 常量与 Schema ----

const PROVIDERS = ["anthropic", "deepseek"] as const

/** 缺省配置（无记录时返回） */
const DEFAULT_SETTINGS = {
  defaultModel: "deepseek-chat",
  taskProviderMap: {} as Record<string, string>,
}

// 各 taskType 的 Provider 偏好均为可选；未设置即跟随默认模型推断
const ProviderEnum = z.enum(PROVIDERS)
const UpdateSettingsSchema = z.object({
  defaultModel: z.string().min(1, "默认模型不能为空").max(100),
  taskProviderMap: z
    .object({
      chat: ProviderEnum.optional(),
      workflow: ProviderEnum.optional(),
      analysis: ProviderEnum.optional(),
      generation: ProviderEnum.optional(),
    })
    .default({}),
})

// ---- GET /api/workspace/settings ----

export async function GET(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request)

    const row = await prisma.workspaceSettings.findUnique({
      where: { workspaceId: ctx.workspaceId },
    })

    if (!row) {
      return successResponse(DEFAULT_SETTINGS)
    }

    return successResponse({
      defaultModel: row.defaultModel,
      taskProviderMap: parseJsonField<Record<string, string>>(row.taskProviderMap, {}),
    })
  } catch (error) {
    logger.error("GET /api/workspace/settings: 失败", {
      error: error instanceof Error ? error.message : "未知错误",
    })
    return errorResponse("服务器内部错误")
  }
}

// ---- PATCH /api/workspace/settings (更新配置) ----

export async function PATCH(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request)

    // RBAC：仅 ADMIN/OWNER 可配置模型路由
    const guard = guardRole(ctx.role, "ADMIN", "权限不足，仅管理员可配置模型路由")
    if (guard) return guard

    const body = await request.json()
    const parsed = UpdateSettingsSchema.safeParse(body)
    if (!parsed.success) {
      return errorResponse(
        parsed.error.issues.map((i) => i.message).join("；"),
        400,
      )
    }

    const taskProviderMapStr = JSON.stringify(parsed.data.taskProviderMap)

    const saved = await prisma.workspaceSettings.upsert({
      where: { workspaceId: ctx.workspaceId },
      create: {
        workspaceId: ctx.workspaceId,
        defaultModel: parsed.data.defaultModel,
        taskProviderMap: taskProviderMapStr,
      },
      update: {
        defaultModel: parsed.data.defaultModel,
        taskProviderMap: taskProviderMapStr,
      },
    })

    await writeAuditLog({
      actor: await actorFromSession(),
      action: "update.model-routing",
      targetType: "workspace",
      targetId: ctx.workspaceId,
      detail: `更新模型路由：默认模型 ${parsed.data.defaultModel}`,
      riskLevel: "mid",
      workspaceId: ctx.workspaceId,
    })

    return successResponse({
      defaultModel: saved.defaultModel,
      taskProviderMap: parseJsonField<Record<string, string>>(saved.taskProviderMap, {}),
    })
  } catch (error) {
    logger.error("PATCH /api/workspace/settings: 失败", {
      error: error instanceof Error ? error.message : "未知错误",
    })
    return errorResponse("服务器内部错误")
  }
}
