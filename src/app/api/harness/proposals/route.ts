import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger';
import {
  parseJsonField,
  stringifyJsonField,
  successResponse,
  errorResponse,
} from "@/lib/api-utils"
import { automationLevelFromRisk } from "@/types"
import type { AutomationLevel, RiskLevel } from "@/types"
import { HarnessProposalCreateSchema, validateBody } from "@/lib/validators"

/** 序列化 HarnessProposal，将 JSON 字符串字段反序列化 */
function serializeProposal(proposal: Record<string, unknown>) {
  return {
    ...proposal,
    evidence: parseJsonField(proposal.evidence as string, []),
  }
}

/** GET /api/harness/proposals —— 获取所有 Harness 升级提案列表 */
export async function GET() {
  try {
    const proposals = await prisma.harnessProposal.findMany({
      orderBy: { createdAt: "desc" },
    })

    return successResponse({
      proposals: proposals.map((p) => serializeProposal(p as unknown as Record<string, unknown>)),
    })
  } catch (error) {
    logger.error('GET /api/harness/proposals: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}

/** POST /api/harness/proposals —— 创建新提案 */
export async function POST(request: Request) {
  try {
    const rawBody = await request.json()
    const parsed = validateBody(rawBody, HarnessProposalCreateSchema)
    if (parsed instanceof Response) return parsed
    const body = parsed

    const riskLevel: RiskLevel = body.riskLevel ?? "low"
    // 自动化授权等级：显式优先，否则按 riskLevel 派生（AGENTS.md §4.7）
    const automationLevel: AutomationLevel =
      body.automationLevel ?? automationLevelFromRisk(riskLevel)

    const proposal = await prisma.harnessProposal.create({
      data: {
        id: crypto.randomUUID(),
        proposalId: body.proposalId ?? `HP-${crypto.randomUUID().slice(0, 8)}`,
        triggeredBy: body.triggeredBy,
        problemStatement: body.problemStatement,
        evidence: stringifyJsonField(body.evidence),
        targetComponent: body.targetComponent,
        proposedChange: body.proposedChange,
        riskLevel,
        automationLevel,
        status: body.status,
        estimatedImpact: body.estimatedImpact,
        reviewedBy: body.reviewedBy,
        reviewedAt: body.reviewedAt,
      },
    })

    return successResponse(
      { proposal: serializeProposal(proposal as unknown as Record<string, unknown>) },
      201,
    )
  } catch (error) {
    logger.error('POST /api/harness/proposals: 失败', { error: error instanceof Error ? error.message : '未知错误' })
    return errorResponse("服务器内部错误")
  }
}
