import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { successResponse, errorResponse } from "@/lib/api-utils"
import { type WorkspaceContext } from "@/lib/workspace"
import { withRBAC } from "@/lib/server/api-handler"

/** 大盘统计数据结构 */
interface DashboardStats {
  /** 今日询盘数 */
  todayInquiries: number
  /** 今日询盘较昨日变化量（正数=增加） */
  todayInquiriesChange: number
  /** 跟进中客户数（来源去重） */
  followingCustomers: number
  /** 待处理任务数（未回复询盘） */
  pendingTasks: number
  /** 活跃项目数 */
  activeProjects: number
  /** 紧急待办数（高优先级 + 未回复询盘） */
  urgentCount: number
  /** 本周工作流执行概览（按天聚合成功/失败数） */
  weeklyWorkflowRuns: WeeklyWorkflowDay[]
}

interface WeeklyWorkflowDay {
  day: string      // 周一、周二...
  success: number
  failed: number
}

/** 获取当天 00:00:00.000 */
function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

/** 获取本周一 00:00:00.000 */
function startOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // 周一为起始
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

/** 周一至周日中文标签 */
const DAY_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]

/** GET /api/dashboard/stats —— 大盘统计数据聚合（RBAC: VIEWER） */
export const GET = withRBAC(async (request: Request, ctx: WorkspaceContext) => {
  try {
    const now = new Date()
    const todayStart = startOfDay(now)
    const yesterdayStart = new Date(todayStart.getTime() - 86400000)
    const weekStart = startOfWeek(now)

    // 并行查询所有聚合数据
    const [
      todayCount,
      yesterdayCount,
      allInquiries,
      pendingCount,
      urgentCount,
      activeProjectCount,
      weekWorkflowRuns,
    ] = await Promise.all([
      // 今日询盘数
      prisma.inquiry.count({
        where: {
          workspaceId: ctx.workspaceId,
          createdAt: { gte: todayStart },
        },
      }),
      // 昨日询盘数（用于变化量计算）
      prisma.inquiry.count({
        where: {
          workspaceId: ctx.workspaceId,
          createdAt: { gte: yesterdayStart, lt: todayStart },
        },
      }),
      // 所有询盘（用于去重客户统计）
      prisma.inquiry.findMany({
        where: { workspaceId: ctx.workspaceId },
        select: { companyName: true },
      }),
      // 待处理任务（OPEN + IN_PROGRESS 状态的 Task 实体）
      prisma.task.count({
        where: {
          workspaceId: ctx.workspaceId,
          status: { in: ["OPEN", "IN_PROGRESS"] },
        },
      }),
      // 紧急待办（高优先级 + 未回复）
      prisma.inquiry.count({
        where: {
          workspaceId: ctx.workspaceId,
          priority: "high",
          replied: false,
        },
      }),
      // 活跃项目数
      prisma.project.count({
        where: {
          workspaceId: ctx.workspaceId,
          status: "active",
        },
      }),
      // 本周工作流运行记录
      prisma.workflowRun.findMany({
        where: {
          workspaceId: ctx.workspaceId,
          startedAt: { gte: weekStart },
        },
        select: { status: true, startedAt: true },
      }),
    ])

    // 客户去重统计
    const uniqueCompanies = new Set(
      allInquiries.map((i) => i.companyName).filter(Boolean),
    )

    // 周工作流按天聚合
    const weeklyData: WeeklyWorkflowDay[] = DAY_LABELS.map((day, index) => {
      const dayStart = new Date(weekStart.getTime() + index * 86400000)
      const dayEnd = new Date(dayStart.getTime() + 86400000)
      const dayRuns = weekWorkflowRuns.filter((r) => {
        const t = r.startedAt.getTime()
        return t >= dayStart.getTime() && t < dayEnd.getTime()
      })
      return {
        day,
        success: dayRuns.filter((r) => r.status === "completed").length,
        failed: dayRuns.filter((r) => r.status === "failed").length,
      }
    })

    // 变化量 = 今日 - 昨日
    const todayInquiriesChange =
      yesterdayCount > 0
        ? Math.round(((todayCount - yesterdayCount) / yesterdayCount) * 100)
        : todayCount > 0
          ? 100
          : 0

    const stats: DashboardStats = {
      todayInquiries: todayCount,
      todayInquiriesChange,
      followingCustomers: uniqueCompanies.size,
      pendingTasks: pendingCount,
      urgentCount,
      activeProjects: activeProjectCount,
      weeklyWorkflowRuns: weeklyData,
    }

    return successResponse(stats)
  } catch (error) {
    logger.error("GET /api/dashboard/stats: 失败", {
      error: error instanceof Error ? error.message : "未知错误",
    })
    return errorResponse("服务器内部错误")
  }
}, "VIEWER")
