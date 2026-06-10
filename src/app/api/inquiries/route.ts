import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger'
import { successResponse, errorResponse } from "@/lib/api-utils"
import { buildWorkspaceContext, type WorkspaceContext } from "@/lib/workspace"
import { withRBAC } from "@/lib/server/api-handler"
import { validateBody, InquiryCreateSchema } from "@/lib/validators"
import { createAuditEntry, updateAuditEntry, actorFromSession } from "@/lib/server/audit"
import { ApiResponse } from "@/lib/server/api-response"

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
 * ISO 两位国家代码 → 国旗 emoji
 * 例: "US" → 🇺🇸, "CN" → 🇨🇳
 */
function countryCodeToFlag(code: string): string {
  if (code.length !== 2) return "🌐"
  try {
    const codePoints = [...code.toUpperCase()].map(
      (c) => 0x1f1e6 + c.charCodeAt(0) - 65,
    )
    return String.fromCodePoint(...codePoints)
  } catch {
    return "🌐"
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

/** GET /api/inquiries —— 获取询盘列表（按接收时间倒序） */
export async function GET(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request)
    const inquiries = await prisma.inquiry.findMany({
      where: { workspaceId: ctx.workspaceId },
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

  // 2. 预记录审计日志（AGENTS.md §5 #3 禁止静默执行：写操作前先留痕）
  const auditEntry = await createAuditEntry({
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
  })

  // 3. 创建 Inquiry 记录
  let inquiry: Awaited<ReturnType<typeof prisma.inquiry.create>>
  try {
    inquiry = await prisma.inquiry.create({
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
  } catch (error) {
    logger.error("POST /api/inquiries: 创建 Inquiry 记录失败", {
      error: error instanceof Error ? error.message : "未知错误",
    })
    await updateAuditEntry({
      auditId: auditEntry.auditId,
      status: "failed",
      detail: `创建失败: ${error instanceof Error ? error.message : "未知错误"}`,
    })
    return ApiResponse.error("创建询盘失败", 500)
  }

  // 4. 尝试触发询盘分级工作流（inquiry-grade），失败不阻断主流程
  try {
    const workflow = await prisma.workflow.findFirst({
      where: { workspaceId: ctx.workspaceId, name: "inquiry-grade" },
    })
    if (workflow) {
      await prisma.workflowRun.create({
        data: {
          id: crypto.randomUUID(),
          workspaceId: ctx.workspaceId,
          workflowId: workflow.id,
          status: "pending",
          trigger: "auto",
          input: JSON.stringify({
            inquiryId,
            subject: body.subject,
            content: body.content,
            fromEmail: body.fromEmail,
            countryCode: body.countryCode,
          }),
          startedAt: now,
        },
      })
      logger.info("POST /api/inquiries: 已关联询盘分级工作流", {
        inquiryId,
        workflowId: workflow.id,
      })
    } else {
      logger.warn("POST /api/inquiries: 未找到 inquiry-grade 工作流，跳过自动触发", {
        inquiryId,
        workspaceId: ctx.workspaceId,
      })
    }
  } catch (wfError) {
    logger.error("POST /api/inquiries: 触发分级工作流失败（询盘已创建）", {
      inquiryId,
      error: wfError instanceof Error ? wfError.message : "未知错误",
    })
  }

  // 5. 更新审计状态为成功
  await updateAuditEntry({
    auditId: auditEntry.auditId,
    status: "success",
    contextSnapshot: { inquiryId, workflowTriggered: true },
  })

  return ApiResponse.ok(serializeInquiry(inquiry))
}, "MEMBER")
