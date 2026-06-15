/**
 * POST /api/packs/foreign-trade/quotations/[quotationId]/send
 *
 * 报价发送 —— 受 AutomationPolicy 控制：
 * - L1（建议模式）：返回预览，不实际发送
 * - L2（半自动）：人工触发后执行发送
 * - L3/L4 需通过 Harness 提案，此处拒绝
 *
 * MVP 阶段：email connector 默认 stub 模式（返回模拟成功）
 */
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { buildWorkspaceContext } from "@/lib/workspace"
import { createAuditEntry, updateAuditEntry, actorFromSession } from "@/lib/server/shared/audit"
import { resolveAutomationPolicy } from "@/lib/automation/policy-resolver"
import { logger } from "@/lib/logger"

/** Email connector stub（Week 4 替换为真实 connector） */
async function sendQuotationEmailStub(): Promise<{
  sent: boolean
  messageId?: string
  error?: string
}> {
  const enabled = process.env.EMAIL_CONNECTOR_ENABLED === "true"
  if (!enabled) {
    return { sent: true, messageId: `stub-${Date.now()}` }
  }
  // 真实发送逻辑（后续集成）
  try {
    // TODO: import { emailConnector } from "@/lib/server/connectors/email"
    throw new Error("Email connector 尚未集成，请配置 EMAIL_CONNECTOR_ENABLED=false 使用 stub 模式")
  } catch {
    return { sent: false, error: "EMAIL_CONNECTOR_NOT_READY" }
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ quotationId: string }> },
) {
  const { quotationId } = await params

  try {
    const ctx = await buildWorkspaceContext(req)
    const quotation = await prisma.quotation.findFirst({
      where: { id: quotationId, workspaceId: ctx.workspaceId },
    })

    if (!quotation) {
      return NextResponse.json({ error: "QUOTATION_NOT_FOUND" }, { status: 404 })
    }
    if (quotation.status !== "draft") {
      return NextResponse.json(
        { error: "QUOTATION_NOT_DRAFT", currentStatus: quotation.status },
        { status: 409 },
      )
    }

    // 解析 AutomationPolicy
    const policy = await resolveAutomationPolicy(
      ctx.workspaceId,
      "agent-002",       // 报价生成 Agent
      "quotation.send",
    )

    // L3/L4 门禁（需 Harness 提案）
    if (policy.automationLevel === "L3" || policy.automationLevel === "L4") {
      return NextResponse.json(
        {
          error: "REQUIRES_HARNESS_APPROVAL",
          message: "发送报价需通过 Harness 提案审批后执行",
          policy: { level: policy.automationLevel, source: policy.source },
        },
        { status: 403 },
      )
    }

    // L1：仅返回建议
    if (policy.automationLevel === "L1") {
      return NextResponse.json({
        mode: "suggestion",
        message: "当前为 L1 建议模式，请人工确认后手动发送",
        quotation: {
          id: quotation.id,
          totalAmount: quotation.totalAmount,
          currency: quotation.currency,
          status: quotation.status,
        },
        policy: { level: "L1", source: policy.source },
      })
    }

    // L2：执行发送
    const actor = await actorFromSession()
    const audit = await createAuditEntry({
      actor,
      action: "quotation.send",
      targetType: "quotation",
      targetId: quotationId,
      riskLevel: "low",
      workspaceId: ctx.workspaceId,
      automationLevel: "L2",
      triggeredBy: "user",
      detail: `发送报价: ${quotation.totalAmount} ${quotation.currency}（关联项目 ${quotation.projectId}）`,
      contextSnapshot: {
        projectId: quotation.projectId,
        totalAmount: quotation.totalAmount,
        currency: quotation.currency,
        level: policy.automationLevel,
        step: "quotation-send",
      },
    })

    const sendResult = await sendQuotationEmailStub()

    if (!sendResult.sent) {
      await updateAuditEntry({
        auditId: audit.auditId,
        status: "failed",
        detail: sendResult.error,
      })
      return NextResponse.json(
        { error: "SEND_FAILED", detail: sendResult.error },
        { status: 502 },
      )
    }

    const updated = await prisma.quotation.update({
      where: { id: quotationId },
      data: {
        status: "sent",
        sentAt: new Date(),
      },
    })

    await updateAuditEntry({
      auditId: audit.auditId,
      status: "success",
      contextSnapshot: {
        sent: true,
        messageId: sendResult.messageId,
        sentAt: updated.sentAt?.toISOString() ?? new Date().toISOString(),
      },
    })

    return NextResponse.json({
      quotationId: updated.id,
      status: "sent",
      sentAt: updated.sentAt?.toISOString(),
      messageId: sendResult.messageId,
    })
  } catch (error) {
    logger.error("POST /api/quotations/[quotationId]/send: 失败", {
      quotationId,
      error: error instanceof Error ? error.message : "未知错误",
    })
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 })
  }
}
