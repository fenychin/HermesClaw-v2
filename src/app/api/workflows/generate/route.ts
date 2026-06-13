/**
 * POST /api/workflows/generate —— WorkflowGenerator Agent API
 *
 * 接收用户自然语言意图 + 行业上下文，调用 WorkflowGenerator Agent
 * 生成 DAG 工作流并写入 DB（状态为 draft，需人工 Review 后激活）。
 *
 * 请求体：{ intent: string, industryContext: string }
 * 响应：  { success: true, data: { workflowId, name, nodes, edges, metadata } }
 *
 * 约束（AGENTS.md §4.7 L3）：生成的工作流不可直接执行
 */
import { z } from "zod"
import { generateWorkflow } from "@/lib/server/agents/workflow-generator"
import { successResponse, errorResponse } from "@/lib/api-utils"
import { validateBody } from "@/lib/validators"
import { rateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"
import { withRBAC } from "@/lib/server/api-handler"

export const runtime = "nodejs"
// AI 调用可能稍慢
export const maxDuration = 60

/** 工作流生成请求 Schema */
const WorkflowGenerateSchema = z.object({
  /** 用户自然语言意图描述 */
  intent: z.string().min(1).max(2000),
  /** 行业上下文（当前仅支持 'foreign-trade'） */
  industryContext: z.enum(["foreign-trade"]),
})

/**
 * POST /api/workflows/generate
 *
 * 生成外贸行业 DAG 工作流，状态为 draft。
 * 生成后需人工在 Review 页面确认并手动激活，不可直接执行。
 */
export const POST = withRBAC(async (request: Request) => {
  try {
    // 频率限制：每分钟最多 5 次（AI 调用成本高）
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown"
    if (!rateLimit(ip, 5, 60_000)) {
      return errorResponse("请求过于频繁，请稍后重试（每分钟最多 5 次）", 429)
    }

    // 1. 解析并校验请求体
    const rawBody = await request.json()
    const parsed = validateBody(rawBody, WorkflowGenerateSchema)
    if (parsed instanceof Response) return parsed
    const { intent, industryContext } = parsed

    // 2. 调用 WorkflowGenerator Agent
    const result = await generateWorkflow({ intent, industryContext })

    // 3. 返回生成结果
    return successResponse({
      workflowId: result.workflowId,
      name: result.name,
      nodes: result.nodes,
      edges: result.edges,
      metadata: result.metadata,
    })
  } catch (error) {
    logger.error("POST /api/workflows/generate: 生成失败", {
      error: error instanceof Error ? error.message : "未知错误",
    })
    const message = error instanceof Error ? error.message : "未知错误"
    return errorResponse(`工作流生成失败：${message}`, 502)
  }
}, "MEMBER")
