import { prisma } from "@/lib/prisma"
import { withRBAC } from "@/lib/server/api-handler"
import { successResponse, errorResponse } from "@/lib/api-utils"
import { writeAuditLog } from "@/lib/server/audit"
import { buildWorkspaceContext } from "@/lib/workspace"

const L4_CONFIRM_TOKEN = "CONFIRM_L4_RELEASE_ALL_RISKS";
/** L3 确认令牌：防止绕过前端弹窗直接 API 调用（AGENTS.md §4.7） */
const L3_CONFIRM_TOKEN =
  process.env["AUTOMATION_L3_CONFIRM_TOKEN"] ?? "CONFIRM_L3_SUPERVISED_AUTO";

/**
 * GET /api/settings/automation-level —— 获取当前 Workspace 自动化授权等级
 */
export async function GET(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request)
    const workspace = await prisma.workspace.findUnique({
      where: { id: ctx.workspaceId },
      select: { id: true, name: true, automationLevel: true }
    })
    return successResponse({ 
      workspaceId: ctx.workspaceId, 
      automationLevel: workspace?.automationLevel || "L2" 
    })
  } catch (error) {
    return errorResponse("获取配置失败", 500)
  }
}

/**
 * PATCH /api/settings/automation-level —— 修改 Workspace 自动化授权等级 (限 OWNER)
 *
 * L4：须额外携带 confirmToken="CONFIRM_L4_RELEASE_ALL_RISKS"
 * L3：须额外携带 confirmToken 环境变量（AUTOMATION_L3_CONFIRM_TOKEN，默认 CONFIRM_L3_SUPERVISED_AUTO）
 *     防止绕过前端弹窗直接 API 调用（AGENTS.md §4.7 高风险操作须显式二次确认）
 */
export const PATCH = withRBAC(
  async (request, ctx) => {
    try {
      const body = await request.json()
      const { level, confirmToken } = body

      // 验证 level 参数
      if (!["L1", "L2", "L3", "L4"].includes(level)) {
        return errorResponse("非法的自动化等级参数", 400)
      }

      // L4 额外 confirmToken 验证
      if (level === "L4") {
        if (confirmToken !== L4_CONFIRM_TOKEN) {
          return Response.json(
            {
              success: false,
              error: "L4_TOKEN_INVALID",
              message: "设置全自动 (L4) 需要输入正确的安全确认标识，以明确理解所有自动执行风险。"
            },
            { status: 400 }
          )
        }
      }

      // L3 也须后端 confirmToken 校验（AGENTS.md §4.7）
      // 防止绕过前端弹窗，OWNER 可直接 API 调用绕过确认弹窗
      if (level === "L3") {
        if (confirmToken !== L3_CONFIRM_TOKEN) {
          return Response.json(
            {
              success: false,
              error: "L3_TOKEN_INVALID",
              message: "启用监督自动 (L3) 需要后端确认令牌，请通过设置页面操作。",
              requiresConfirmation: true,
            },
            { status: 400 }
          )
        }
      }

      const prevWorkspace = await prisma.workspace.findUnique({
        where: { id: ctx.workspaceId },
        select: { automationLevel: true }
      })

      const updated = await prisma.workspace.update({
        where: { id: ctx.workspaceId },
        data: {
          automationLevel: level
        }
      })

      // 写系统审计日志（AGENTS.md §6.2 automation.level.change 必须记录）
      await writeAuditLog({
        actor: ctx.userId || "owner",
        action: "automation.level.change",
        targetType: "workspace",
        targetId: ctx.workspaceId,
        detail: `更新自动化授权等级: 从 ${prevWorkspace?.automationLevel || "L2"} 改为 ${level}`,
        riskLevel: level === "L4" || level === "L3" ? "high" : "medium",
        workspaceId: ctx.workspaceId
      })

      return successResponse({ 
        workspaceId: ctx.workspaceId, 
        automationLevel: updated.automationLevel 
      })
    } catch (error) {
      return errorResponse(error instanceof Error ? error.message : "修改自动化等级失败", 500)
    }
  },
  "OWNER" // 仅限 OWNER 角色修改（AGENTS.md §6.2）
)
