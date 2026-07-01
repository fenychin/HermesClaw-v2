/**
 * 询盘 API 路由
 *
 * 三域原则：询盘业务逻辑属于外贸行业包（industry-packs/foreign-trade），
 * 本路由仅作为通用 HTTP 入口通过动态 import 调用行业包 handler，
 * 避免 Hermes 控制平面对行业包代码产生编译期硬依赖。
 */
import { successResponse, errorResponse } from "@/lib/api-utils"
import { type WorkspaceContext } from "@/lib/workspace"
import { withRBAC } from "@/lib/server/api-handler"
import { validateBody, InquiryCreateSchema } from "@/lib/server/validators"
import { actorFromSession } from "@/lib/server/audit"
import { auditedWrite } from "@/lib/server/audited-write"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { WorkflowSchedulerService } from "@/lib/server/workflow/scheduler"
import { executeWorkflowRun } from "@/lib/server/workflow/runtime-engine"

async function loadInquiryHandlers() {
  try {
    // 动态加载外贸行业包 handler。路径以变量形式传入，避免 Hermes 控制平面
    // 对行业包产生编译期模块解析依赖——删除行业包后本路由仍可编译，
    // 仅在运行时返回 503 降级。
    const handlerPath = "@foreign-trade/handlers/inquiry-handler"
    const mod: any = await import(/* @vite-ignore */ handlerPath)
    return {
      listInquiries: mod.listInquiries as (input: any, deps: { prisma: typeof prisma }) => Promise<any>,
      createInquiry: mod.createInquiry as (input: any, deps: { prisma: typeof prisma }) => Promise<any>,
    }
  } catch (error) {
    logger.warn("[InquiryRoute] 外贸行业包 inquiry-handler 不可用", {
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

export const GET = withRBAC(async (request: Request, ctx: WorkspaceContext) => {
  const handlers = await loadInquiryHandlers()
  if (!handlers) {
    return errorResponse("外贸行业包未安装或不可用", 503)
  }

  try {
    const url = new URL(request.url)
    const result = await handlers.listInquiries(
      {
        workspaceId: ctx.workspaceId,
        priority: url.searchParams.get("priority") || undefined,
        status: url.searchParams.get("status") || undefined,
        fromCountry: url.searchParams.get("fromCountry") || undefined,
        page: Math.max(Number(url.searchParams.get("page")) || 1, 1),
        limit: Math.min(Number(url.searchParams.get("limit")) || 20, 500),
      },
      { prisma },
    )
    return successResponse(result)
  } catch {
    return errorResponse("服务器内部错误")
  }
}, "VIEWER")

export const POST = withRBAC(async (request: Request, ctx: WorkspaceContext) => {
  const handlers = await loadInquiryHandlers()
  if (!handlers) {
    return errorResponse("外贸行业包未安装或不可用", 503)
  }

  const parsed = validateBody(await request.json(), InquiryCreateSchema)
  if (parsed instanceof Response) return parsed

  try {
    // BUG-03 修复：先调用 createInquiry 取得真实 inquiry.id，再以此 ID 写入 AuditLog，
    // 确保审计链路中 targetId 与数据库记录 id 严格一致。
    const result = await handlers.createInquiry(
      { workspaceId: ctx.workspaceId, ...parsed, countryCode: parsed.countryCode },
      { prisma },
    )
    await auditedWrite(
      {
        actor: await actorFromSession(),
        action: "inquiry.create",
        targetType: "inquiry",
        targetId: result.id,  // ← 使用实际 Inquiry ID
        detail: `创建询盘: ${parsed.subject.slice(0, 100)}`,
        riskLevel: "low",
        workspaceId: ctx.workspaceId,
        automationLevel: "L2",
        triggeredBy: "user",
      },
      () => Promise.resolve(result),  // 数据已写入，仅补审计日志
    )

    let workflowRunId: string | undefined
    let workflowStatus: string = "pending"
    let workflowOutput: any = null
    let finalPriority = result.priority || "mid"

    try {
      logger.info("[InquiryRoute] 自动启动询盘分级工作流...", {
        inquiryId: result.id,
        workspaceId: ctx.workspaceId,
      })

      // 1. 运行 inquiry-grade 工作流
      const runResult = await WorkflowSchedulerService.runWorkflow({
        workflowId: "inquiry-grade",
        workspaceId: ctx.workspaceId,
        inputs: {
          inquiry_text: parsed.content,
          customer_country: parsed.countryCode,
          inquiryId: result.id, // 传入 inquiryId 供数据写入使用
        },
      })
      workflowRunId = runResult.runId

      // 2. 同步等待工作流执行结束
      const finalRun = await executeWorkflowRun(runResult.runId, ctx.workspaceId)
      workflowStatus = finalRun.status
      workflowOutput = finalRun.outputContext

      // 3. 重新获取更新后的等级
      const updatedInquiry = await prisma.inquiry.findUnique({
        where: { id: result.id },
      })
      if (updatedInquiry) {
        finalPriority = updatedInquiry.priority || "mid"
      }
    } catch (wfError: any) {
      logger.error("[InquiryRoute] 自动运行询盘分级工作流失败", {
        inquiryId: result.id,
        error: wfError.message,
      })
    }

    const responseData = {
      ...result,
      priority: finalPriority,
      workflowRunId,
      workflowStatus,
      workflowOutput,
    }

    return successResponse(responseData, 201)
  } catch {
    return errorResponse("创建询盘失败", 500)
  }
}, "MEMBER")
