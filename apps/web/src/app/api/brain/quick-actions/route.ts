import { listIndustryWorkflows, loadIndustrySkills } from "@hermesclaw/industry-pack-sdk"
import { prisma } from "@/lib/prisma"
import { withRBAC } from "@/lib/server/api-handler"
import { NextResponse } from "next/server"

// 固定不可删除的入口（对应核心工作流/技能）
const FIXED_WORKFLOW_IDS = ["inquiry-grade", "dev-letter", "quote-gen", "agent-dispatch"]

export const GET = withRBAC(async (req, ctx) => {
  const { workspaceId, userId } = ctx

  // 1. 获取已安装的行业包
  const installations = await prisma.industryPackInstallation.findMany({
    where: { workspaceId, status: "installed" },
    select: { packId: true }
  })

  // 2. 从已安装的行业包加载 workflows 和 skills
  const allAvailable: any[] = []

  for (const { packId } of installations) {
    try {
      const wfs = listIndustryWorkflows(packId)
      allAvailable.push(...wfs.map(w => ({
        id: w.id,
        label: w.title,
        description: w.description,
        packId,
        icon: w.icon ?? "workflow",
        pinned: FIXED_WORKFLOW_IDS.includes(w.id),
        type: "workflow"
      })))

      const sks = loadIndustrySkills(packId)
      // 过滤出核心快捷技能，如 project-space 和 agent-dispatch
      const QUICK_ACTION_SKILL_IDS = ["project-space", "agent-dispatch"]
      const filteredSkills = sks.filter(s => QUICK_ACTION_SKILL_IDS.includes(s.id))

      allAvailable.push(...filteredSkills.map(s => ({
        id: s.id,
        label: (s as any).displayName || s.name,
        description: s.description,
        packId,
        icon: s.id === "project-space" ? "FolderPlus" : "Bot",
        pinned: FIXED_WORKFLOW_IDS.includes(s.id),
        type: "skill"
      })))
    } catch (err) {
      console.error(`[QuickActions API] 加载行业包 ${packId} 能力失败:`, err)
    }
  }

  // 3. 获取用户自定义快捷入口配置
  const userPref = await prisma.userPreference.findFirst({
    where: { userId }
  })

  let quickActionOrder: string[] = []
  if (userPref && userPref.quickActionOrder) {
    try {
      quickActionOrder = JSON.parse(userPref.quickActionOrder)
    } catch {}
  }

  // 如无自定义，默认展现 6 个
  if (quickActionOrder.length === 0) {
    quickActionOrder = ["inquiry-grade", "dev-letter", "quote-gen", "customer-profile", "project-space", "agent-dispatch"]
  }

  // 去重且对齐 fixed entries
  const orderSet = new Set(quickActionOrder)
  FIXED_WORKFLOW_IDS.forEach(id => orderSet.add(id))
  const finalOrderList = Array.from(orderSet)

  // 按偏好排序
  const sortedActions = finalOrderList
    .map(id => allAvailable.find(a => a.id === id))
    .filter(Boolean)
    .slice(0, 6)

  return NextResponse.json({
    success: true,
    data: {
      quickActions: sortedActions,
      allAvailable
    }
  })
}, "VIEWER")
