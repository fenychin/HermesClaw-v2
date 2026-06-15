/**
 * POST /api/packs/foreign-trade/inquiries/[inquiryId]/grade
 *
 * 询盘自动分级 —— 基于规则引擎计算 HIGH / MEDIUM / LOW
 * 会写入 AuditLog（inquiry.grade）
 *
 * TODO: Week 4 替换为 LLM 驱动的 ft-inquiry-grading skill 调用
 */
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { buildWorkspaceContext } from "@/lib/workspace"
import { createAuditEntry, updateAuditEntry, actorFromSession } from "@/lib/server/shared/audit"
import { logger } from "@/lib/logger"

type Grade = "HIGH" | "MEDIUM" | "LOW"

/**
 * 基于预估金额和优先级字段的规则引擎
 * MVP 阶段不依赖 LLM；Week 4 替换为 ft-inquiry-grading skill
 */
function computeGrade(inquiry: {
  priority?: string | null
  fromCountry?: string
}): { grade: Grade; reason: string } {
  const priority = inquiry.priority ?? "mid"

  // 高优先级（urgent / high）→ HIGH
  if (priority === "high") {
    return { grade: "HIGH", reason: "高优先级询盘，建议 4h 内回复" }
  }
  // 中优先级 → MEDIUM
  if (priority === "mid") {
    return { grade: "MEDIUM", reason: "中优先级询盘，建议 24h 内回复" }
  }
  return { grade: "LOW", reason: "低优先级询盘，建议 48h 内回复" }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ inquiryId: string }> },
) {
  const { inquiryId } = await params

  try {
    const ctx = await buildWorkspaceContext(req)
    const inquiry = await prisma.inquiry.findFirst({
      where: { id: inquiryId, workspaceId: ctx.workspaceId },
    })

    if (!inquiry) {
      return NextResponse.json({ error: "INQUIRY_NOT_FOUND" }, { status: 404 })
    }

    const { grade, reason } = computeGrade(inquiry)

    // 预记录审计
    const actor = await actorFromSession()
    const audit = await createAuditEntry({
      actor,
      action: "inquiry.grade",
      targetType: "inquiry",
      targetId: inquiryId,
      riskLevel: "low",
      workspaceId: ctx.workspaceId,
      automationLevel: "L2",
      triggeredBy: "user",
      detail: `询盘分级: ${grade} — ${reason}`,
      contextSnapshot: {
        previousGrade: inquiry.grade ?? null,
        newGrade: grade,
        priority: inquiry.priority,
        step: "inquiry-grade",
      },
    })

    try {
      await prisma.inquiry.update({
        where: { id: inquiryId },
        data: { grade, gradedAt: new Date() },
      })

      await updateAuditEntry({
        auditId: audit.auditId,
        status: "success",
        contextSnapshot: {
          grade,
          gradedAt: new Date().toISOString(),
          previousGrade: inquiry.grade ?? null,
        },
      })

      return NextResponse.json({
        inquiryId,
        grade,
        reason,
        previousGrade: inquiry.grade ?? null,
      })
    } catch (err) {
      await updateAuditEntry({ auditId: audit.auditId, status: "failed" })
      logger.error("POST /api/inquiries/[inquiryId]/grade: 更新失败", {
        inquiryId,
        error: err instanceof Error ? err.message : "未知错误",
      })
      return NextResponse.json({ error: "GRADE_UPDATE_FAILED" }, { status: 500 })
    }
  } catch (error) {
    logger.error("POST /api/inquiries/[inquiryId]/grade: 失败", {
      inquiryId,
      error: error instanceof Error ? error.message : "未知错误",
    })
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 })
  }
}
