import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger'
import { successResponse, errorResponse } from "@/lib/api-utils"
import { buildWorkspaceContext, type WorkspaceContext } from "@/lib/workspace"
import { withRBAC } from "@/lib/server/api-handler"
import { validateBody, InquiryCreateSchema } from "@/lib/server/validators"
import { actorFromSession } from "@/lib/server/audit"
import { auditedWrite } from "@/lib/server/audited-write"
import { ApiResponse } from "@/lib/server/api-response"
import { countryCodeToFlag } from "@/lib/country-utils"
// LEGACY ENGINE ROUTE: Operating on WorkflowNodeRun table.
import { runWorkflow } from '@/lib/server/workflow/dag-runner'
import { WorkflowNotFoundError } from '@/lib/server/exceptions'

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

/** GET /api/inquiries —— 获取询盘列表，支持分页、优先级与状态筛选，按优先级 DESC + 跟进时间 ASC 内存排序 */
export async function GET(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request)
    const url = new URL(request.url)
    
    // 筛选参数
    const priorityParam = url.searchParams.get("priority") || undefined // high | medium | low
    const statusParam = url.searchParams.get("status") || undefined // 跟进中 | 已报价 | 已成交 | 已流失
    const fromCountry = url.searchParams.get("fromCountry") || undefined

    // 分页参数
    const page = Math.max(Number(url.searchParams.get("page")) || 1, 1)
    const limitParam = Number(url.searchParams.get("limit") || url.searchParams.get("pageSize"))
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 500) : 20
    const skip = (page - 1) * limit

    // 1. 先把当前 workspace 的所有询盘查出来，以便进行内存关联与复杂状态计算
    const where: any = { workspaceId: ctx.workspaceId }
    if (fromCountry) {
      where.fromCountry = fromCountry.toUpperCase()
    }
    
    const inquiries = await prisma.inquiry.findMany({
      where,
      orderBy: { receivedAt: "desc" },
    })

    // 2. 查出这些询盘相关的所有报价单
    const quotations = await prisma.quotation.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        projectId: { in: inquiries.map(i => i.id) }
      }
    })

    // 3. 在内存中将询盘和报价关联，计算出丰富的外贸业务字段
    const formattedList = inquiries.map(inquiry => {
      const relatedQuotes = quotations.filter(q => q.projectId === inquiry.id)

      // a. 计算最后跟进时间
      let lastFollowUpAt = inquiry.receivedAt
      if (relatedQuotes.length > 0) {
        const quoteTimes = relatedQuotes.map(q => q.createdAt.getTime())
        lastFollowUpAt = new Date(Math.max(...quoteTimes))
      }

      // b. 计算最后跟进天数
      const diffTime = Math.max(0, Date.now() - lastFollowUpAt.getTime())
      const daysSinceLastContact = Math.floor(diffTime / (1000 * 60 * 60 * 24))

      // c. 估算金额：取最贵的一个报价单，没有则为 0
      let value = 0
      let currency = "USD"
      if (relatedQuotes.length > 0) {
        const amounts = relatedQuotes.map(q => {
          const num = parseFloat(q.totalAmount.replace(/[^0-9.]/g, ""))
          return isNaN(num) ? 0 : num
        })
        const maxIdx = amounts.indexOf(Math.max(...amounts))
        if (maxIdx !== -1) {
          value = amounts[maxIdx]
          currency = relatedQuotes[maxIdx].currency || "USD"
        }
      }

      // d. 动态计算状态
      let status = "跟进中"
      const hasAccepted = relatedQuotes.some(q => q.status === "accepted")
      const hasRejected = relatedQuotes.some(q => q.status === "rejected")
      const hasSent = relatedQuotes.some(q => q.status === "sent")
      
      if (hasAccepted) {
        status = "已成交"
      } else if (hasRejected && !hasSent) {
        status = "已流失"
      } else if (relatedQuotes.length > 0 || inquiry.replied) {
        status = "已报价"
      }

      // e. 动态打技能标签
      const summaryLower = (inquiry.summary || '').toLowerCase()
      const tags: string[] = []
      if (summaryLower.includes('email') || summaryLower.includes('mail') || summaryLower.includes('letter') || summaryLower.includes('写信')) {
        tags.push('开发信')
      }
      if (summaryLower.includes('price') || summaryLower.includes('quote') || summaryLower.includes('pricing') || summaryLower.includes('cost') || summaryLower.includes('询价') || summaryLower.includes('报价')) {
        tags.push('询价')
      }
      if (summaryLower.includes('sample') || summaryLower.includes('test') || summaryLower.includes('trial') || summaryLower.includes('样品')) {
        tags.push('样品需求')
      }
      if (summaryLower.includes('urgent') || summaryLower.includes('quick') || summaryLower.includes('fast') || summaryLower.includes('紧急') || summaryLower.includes('立刻')) {
        tags.push('快速响应')
      }
      if (tags.length === 0) {
        tags.push('新询盘')
      }

      return {
        id: inquiry.id,
        customerName: inquiry.companyName,
        country: inquiry.fromCountry,
        countryFlag: inquiry.countryFlag,
        product: inquiry.summary,
        value,
        currency,
        priority: inquiry.priority === "mid" ? "medium" : inquiry.priority, // 统一转化为 medium
        status,
        tags,
        lastFollowUpAt: lastFollowUpAt.toISOString(),
        daysSinceLastContact
      }
    })

    // 4. 内存过滤
    let filteredList = formattedList
    if (priorityParam) {
      filteredList = filteredList.filter(item => item.priority === priorityParam)
    }
    if (statusParam) {
      filteredList = filteredList.filter(item => item.status === statusParam)
    }

    // 5. 内存复杂排序：按 priority DESC (high=3, medium=2, low=1) + lastFollowUpAt ASC
    const priorityWeight: Record<string, number> = {
      high: 3,
      medium: 2,
      low: 1
    }

    filteredList.sort((a, b) => {
      const wa = priorityWeight[a.priority] || 2
      const wb = priorityWeight[b.priority] || 2
      if (wa !== wb) {
        return wb - wa // 优先级高在前
      }
      return new Date(a.lastFollowUpAt).getTime() - new Date(b.lastFollowUpAt).getTime() // 日期久远（跟进天数长）的优先跟进在前
    })

    // 6. 内存分页
    const total = filteredList.length
    const paginatedList = filteredList.slice(skip, skip + limit)

    return successResponse({
      inquiries: paginatedList,
      total,
      page,
      limit,
    })
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
            // LEGACY ROUTE: Using deprecated local workflow runner.
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
        } catch (wfError: unknown) {
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
