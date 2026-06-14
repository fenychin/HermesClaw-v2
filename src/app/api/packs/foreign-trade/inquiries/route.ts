import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger'
import { successResponse, errorResponse } from "@/lib/api-utils"
import { buildWorkspaceContext, type WorkspaceContext } from "@/lib/workspace"
import { withRBAC } from "@/lib/server/shared/api-handler"
import { validateBody, InquiryCreateSchema } from "@/lib/validators"
import { actorFromSession } from "@/lib/server/shared/audit"
import { auditedWrite } from "@/lib/server/shared/audited-write"
import { ApiResponse } from "@/lib/server/shared/api-response"
import { countryCodeToFlag } from "@/lib/country-utils"
import { runWorkflow } from '@/lib/server/workflow/dag-runner'
import { WorkflowNotFoundError } from '@/lib/server/shared/exceptions'

/** 序列化 Inquiry，将 DateTime 转为 ISO 字符串（匹配 types/trade.ts） */
function serializeInquiry(inquiry: {
  receivedAt: Date
  createdAt: Date
} & Record<string, unknown>) {
  return {
    ...inquiry,
    receivedAt: inquiry.receivedAt.toISOString(),
    createdAt: inquiry.createdAt.toISOString(),
  }
}

/**
 * 从邮箱地址提取域名作为公司名兜底
 * 例: "buyer@brightpath.com" → "brightpath.com"
 */
function extractCompanyHint(email: string): string {
  try {
    return email.split("@")[1] ?? email
  } catch {
    return email
  }
}

/** GET /api/inquiries —— 获取询盘列表（按接收时间倒序）
 * —— 查询参数：fromCountry（国家代码）, stage（new/replied/closed）
 * —— ALWAYS 包含 workspaceId（AGENTS.md §4.11）
 */
export async function GET(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request)
    const url = new URL(request.url)
    const fromCountry = url.searchParams.get("fromCountry") || undefined
    const stage = url.searchParams.get("stage") || undefined

    // 构建 Prisma where 条件：workspaceId 强制隔离 + 可选筛选
    const where: Record<string, unknown> = { workspaceId: ctx.workspaceId }
    if (fromCountry) where.fromCountry = fromCountry.toUpperCase()
    if (stage === "new") where.replied = false
    if (stage === "replied") where.replied = true
    // TODO: stage=closed 需 Inquiry.status 字段（当前模型仅有 replied 布尔）
    //       Prisma schema 迁移：为 Inquiry 模型新增 status String @default("open")，枚举 open/closed
    //       迁移后此处改为: if (stage === "closed") where.status = "closed"

    const inquiries = await prisma.inquiry.findMany({
      where,
      orderBy: { receivedAt: "desc" },
    })
    return successResponse({ inquiries: inquiries.map(serializeInquiry) })
  } catch (error) {
    logger.error('GET /api/inquiries: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}

// POST /api/inquiries
// 创建询盘（写操作，需 MEMBER 以上角色）
// —— 写入 Inquiry 记录（初始状态 replied=false 对应 pending）
// —— 自动尝试关联询盘分级工作流（inquiry-grade），失败不阻断主流程
// —— 写入 AuditLog（actionType: inquiry.create，automationLevel: L2）
export const POST = withRBAC(async (request: Request, ctx: WorkspaceContext) => {
  // 1. 参数校验
  const rawBody = await request.json()
  const parsed = validateBody(rawBody, InquiryCreateSchema)
  if (parsed instanceof Response) return parsed
  const body = parsed

  const now = new Date()
  const inquiryId = crypto.randomUUID()
  const companyName = extractCompanyHint(body.fromEmail)
  const summary = `**${body.subject}**\n${body.content}\n\n—— 来源: ${body.fromEmail}`
  const countryFlag = countryCodeToFlag(body.countryCode)
  const actor = await actorFromSession()

  // 2-5. 预记录审计 + 写库 + 不阻断的分级工作流 + 成功/失败回填，统一经 auditedWrite
  //       （AGENTS.md §4.3 / §5 #3：写操作前先留痕，执行后回填溯源上下文）
  const wfRef: { value: { runId: string; status: string; output: unknown } | null } = { value: null }
  try {
    const inquiry = await auditedWrite(
      {
        actor,
        action: "inquiry.create",
        targetType: "inquiry",
        targetId: inquiryId,
        detail: `创建询盘: ${body.subject}（来自 ${body.fromEmail}，${body.countryCode}）`,
        riskLevel: "low",
        workspaceId: ctx.workspaceId,
        automationLevel: "L2",
        triggeredBy: "user",
        contextSnapshot: {
          fromEmail: body.fromEmail,
          countryCode: body.countryCode,
          subject: body.subject,
          step: "inquiry-create",
        },
      },
      async () => {
        // 创建 Inquiry 记录
        const created = await prisma.inquiry.create({
          data: {
            id: inquiryId,
            workspaceId: ctx.workspaceId,
            fromCountry: body.countryCode.toUpperCase(),
            countryFlag,
            companyName,
            summary,
            priority: "mid",           // 初始中优先级，由分级工作流调整
            channel: "email",
            receivedAt: now,
            replied: false,            // false 等效 "pending" 状态
          },
        })

        // 执行询盘分级工作流（inquiry-grading），失败不阻断询盘创建
        try {
          const workflow = await prisma.workflow.findFirst({
            where: { workspaceId: ctx.workspaceId, name: "inquiry-grading" },
          })
          if (workflow) {
            wfRef.value = await runWorkflow(workflow.id, {
              inquiryId,
              subject: body.subject,
              content: body.content,
              fromEmail: body.fromEmail,
              countryCode: body.countryCode,
            })
            logger.info("POST /api/inquiries: 询盘分级工作流已执行", {
              inquiryId,
              workflowId: workflow.id,
              runId: wfRef.value.runId,
              status: wfRef.value.status,
            })
          } else {
            logger.warn("POST /api/inquiries: 未找到 inquiry-grading 工作流，跳过自动触发", {
              inquiryId,
              workspaceId: ctx.workspaceId,
            })
          }
        } catch (wfError) {
          // 分类处理：WorkflowNotFoundError 为配置缺失，其余为运行时异常
          if (wfError instanceof WorkflowNotFoundError) {
            logger.warn("POST /api/inquiries: inquiry-grading 工作流未配置", {
              error: wfError.message,
            })
          } else {
            logger.error("POST /api/inquiries: 执行分级工作流失败（询盘已创建）", {
              inquiryId,
              error: wfError instanceof Error ? wfError.message : "未知错误",
            })
          }
        }

        return created
      },
      {
        onSuccess: () => ({
          contextSnapshot: {
            inquiryId,
            workflowTriggered: wfRef.value !== null,
            workflowRunId: wfRef.value?.runId ?? null,
            workflowStatus: wfRef.value?.status ?? null,
          },
        }),
      },
    )

    return ApiResponse.ok({
      ...serializeInquiry(inquiry),
      workflowRunId: wfRef.value?.runId ?? null,
      workflowStatus: wfRef.value?.status ?? null,
      workflowOutput: wfRef.value?.output ?? null,
    })
  } catch (error) {
    logger.error("POST /api/inquiries: 创建 Inquiry 记录失败", {
      error: error instanceof Error ? error.message : "未知错误",
    })
    return ApiResponse.error("创建询盘失败", 500)
  }
}, "MEMBER")
