import { prisma } from "@/lib/prisma"; import { withRBAC } from "@/lib/server/api-handler"
import { successResponse, errorResponse } from "@/lib/api-utils"
import { writeAuditLog } from "@/lib/server/audit"; import { buildWorkspaceContext } from "@/lib/workspace"

const L4_CONFIRM_TOKEN = "CONFIRM_L4_RELEASE_ALL_RISKS"
const L3_CONFIRM_TOKEN = process.env["AUTOMATION_L3_CONFIRM_TOKEN"] ?? "CONFIRM_L3_SUPERVISED_AUTO"

export async function GET(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request)
    const workspace = await prisma.workspace.findUnique({ where: { id: ctx.workspaceId }, select: { automationLevel: true } })
    return successResponse({ workspaceId: ctx.workspaceId, automationLevel: workspace?.automationLevel || "L2" })
  } catch { return errorResponse("获取配置失败", 500) }
}

export const PATCH = withRBAC(async (request: any, ctx: any) => {
  try {
    const { level, confirmToken } = await request.json()
    if (!["L1", "L2", "L3", "L4"].includes(level)) return errorResponse("非法的自动化等级参数", 400)
    if (level === "L4" && confirmToken !== L4_CONFIRM_TOKEN) return Response.json({ success: false, error: "L4_TOKEN_INVALID", message: "设置全自动需要输入正确的安全确认标识" }, { status: 400 })
    if (level === "L3" && confirmToken !== L3_CONFIRM_TOKEN) return Response.json({ success: false, error: "L3_TOKEN_INVALID", message: "启用监督自动需要后端确认令牌", requiresConfirmation: true }, { status: 400 })
    const prev = await prisma.workspace.findUnique({ where: { id: ctx.workspaceId }, select: { automationLevel: true } })
    const updated = await prisma.workspace.update({ where: { id: ctx.workspaceId }, data: { automationLevel: level } })
    void writeAuditLog({ actor: ctx.userId || "owner", action: "automation.level.change", targetType: "workspace", targetId: ctx.workspaceId, detail: `更新自动化等级: ${prev?.automationLevel || "L2"} → ${level}`, riskLevel: level === "L4" || level === "L3" ? "high" : "medium", workspaceId: ctx.workspaceId })
    return successResponse({ workspaceId: ctx.workspaceId, automationLevel: updated.automationLevel })
  } catch (error) { return errorResponse(error instanceof Error ? error.message : "修改自动化等级失败", 500) }
}, "OWNER")
