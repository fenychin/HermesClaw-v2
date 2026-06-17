import { z } from "zod"; import { generateWorkflow } from "@/lib/server/agents/workflow-generator"
import { successResponse, errorResponse } from "@/lib/api-utils"; import { validateBody } from "@/lib/server/validators"
import { rateLimit } from "@/lib/rate-limit"; import { logger } from "@/lib/logger"
import { withRBAC } from "@/lib/server/api-handler"; import { auditedWrite } from "@/lib/server/audited-write"
import { actorFromSession } from "@/lib/server/audit"; import type { WorkspaceContext } from "@/lib/workspace"
export const runtime = "nodejs"; export const maxDuration = 60

const WorkflowGenerateSchema = z.object({ intent: z.string().min(1).max(2000), industryContext: z.string().min(1) })

export const POST = withRBAC(async (request: Request, ctx: WorkspaceContext) => {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown"
    if (!rateLimit(ip, 5, 60_000)) return errorResponse("请求过于频繁", 429)
    const rawBody = await request.json(); const parsed = validateBody(rawBody, WorkflowGenerateSchema); if (parsed instanceof Response) return parsed
    const { intent, industryContext } = parsed; const workflowId = crypto.randomUUID(); const actor = await actorFromSession()
    const result = await auditedWrite({ actor, action: "workflow.generate", targetType: "workflow", targetId: workflowId, detail: `生成工作流: ${intent.slice(0, 100)}`, riskLevel: "low", workspaceId: ctx.workspaceId, automationLevel: "L2", triggeredBy: "user" }, () => generateWorkflow({ intent, industryContext, actor, workspaceId: ctx.workspaceId, workflowId }), { onSuccess: (res: any) => ({ detail: `成功生成工作流 "${res.name}"`, contextSnapshot: { workflowId: res.workflowId, name: res.name, nodeCount: res.nodes.length } }) })
    return successResponse({ workflowId: result.workflowId, name: result.name, nodes: result.nodes, edges: result.edges, metadata: result.metadata })
  } catch (error) { logger.error("POST /api/workflows/generate: 失败"); return errorResponse(`工作流生成失败：${error instanceof Error ? error.message : "未知错误"}`, 502) }
}, "MEMBER")
