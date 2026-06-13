import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import type { WorkspaceContext } from "@/lib/workspace"
import { withRBAC } from "@/lib/server/api-handler"
import {
  createAuditEntry,
  updateAuditEntry,
  actorFromSession,
} from "@/lib/server/audit"
import { ApiResponse } from "@/lib/server/api-response"
import { selectModel } from "@/lib/server/model-router"
import { callAnthropicText } from "@/lib/server/llm-provider"
import { z } from "zod"

/** POST /api/reports/generate 请求体 schema（type 可选，默认 MORNING） */
const ReportGenerateSchema = z.object({
  type: z.enum(["MORNING", "EVENING", "WEEKLY"]).optional(),
})

/** DeepSeek Chat API 端点 */
const DEEPSEEK_CHAT_URL = "https://api.deepseek.com/v1/chat/completions"

/** DeepSeek 纯文本调用（不强制 JSON 模式） */
async function callDeepSeekText(
  systemPrompt: string,
  userPrompt: string,
  model: string,
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY 未配置")

  const res = await fetch(DEEPSEEK_CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      temperature: 0.7,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  })

  if (!res.ok) {
    const errBody = await res.text().catch(() => "")
    throw new Error(`DeepSeek 请求失败 (${res.status})：${errBody.slice(0, 200)}`)
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error("DeepSeek 未返回内容")
  return content
}

import type { ReportType } from "@/types/dashboard"

/** 报告类型中文标签 */
const REPORT_TYPE_LABEL: Record<ReportType, string> = {
  MORNING: "晨报",
  EVENING: "晚报",
  WEEKLY: "周报",
}

/** 构建报告 prompt（晨报/晚报/周报通用） */
function buildReportPrompt(data: {
  intelTitles: string[]
  inquiryCount: number
  urgentCount: number
  pendingTasks: number
  workflowSummary: string
  dateStr: string
  reportType: ReportType
}): string {
  const label = REPORT_TYPE_LABEL[data.reportType]
  const scope =
    data.reportType === "WEEKLY"
      ? "本周"
      : data.reportType === "EVENING"
        ? "今日"
        : "今日"

  return [
    `你是外贸助理。基于以下数据，为 ${data.dateStr} 生成一份${scope}${label}。`,
    data.reportType === "WEEKLY"
      ? "要求：300 字以内，中文，使用 Markdown，包含三个段落：本周市场回顾、询盘周统计、下周待办。"
      : "要求：200 字以内，中文，使用 Markdown，包含三个段落：市场动态、询盘概况、待办提醒。",
    "",
    `**${scope}数据**：`,
    `- 高影响力情报：${data.intelTitles.length > 0 ? data.intelTitles.join("；") : "暂无"}`,
    `- 待处理询盘：${data.inquiryCount} 条`,
    `- 紧急待办：${data.urgentCount} 项`,
    `- 待办任务：${data.pendingTasks} 项`,
    `- 工作流执行：${data.workflowSummary || "本周暂无执行记录"}`,
    "",
    `请直接输出${label}内容（Markdown 格式），不要包含前言或后记。`,
  ].join("\n")
}

/**
 * POST /api/reports/generate —— 生成 AI 报告（晨报/晚报/周报）
 * —— 请求体可选 { type: "MORNING" | "EVENING" | "WEEKLY" }，默认 MORNING
 * —— RBAC: MEMBER+
 * —— 调用 LLM（selectModel → text generation），存储 Report，写入 AuditLog + AgentLog
 * —— automationLevel: L2, riskLevel: low
 */
export const POST = withRBAC(async (request: Request, ctx: WorkspaceContext) => {
  const actor = await actorFromSession()
  const reportId = crypto.randomUUID()
  const now = new Date()

  // 解析请求体中的报告类型（默认晨报）
  let reportType: ReportType = "MORNING"
  try {
    const raw = await request.json()
    const parsed = ReportGenerateSchema.safeParse(raw)
    if (parsed.success && parsed.data.type) {
      reportType = parsed.data.type
    }
  } catch (parseError) {
    // body 为空或 JSON 格式错误，使用默认 MORNING
    logger.warn("[report.generate] 请求体解析失败，使用默认报告类型", {
      error: parseError instanceof Error ? parseError.message : "未知解析错误",
    })
  }

  const typeLabel = REPORT_TYPE_LABEL[reportType]
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
  const startTime = Date.now()

  // 预记录审计日志
  const auditEntry = await createAuditEntry({
    actor,
    action: "report.generate",
    targetType: "report",
    targetId: reportId,
    detail: `生成${typeLabel}: ${dateStr}`,
    riskLevel: "low",
    workspaceId: ctx.workspaceId,
    automationLevel: "L2",
    triggeredBy: "user",
    contextSnapshot: { type: reportType, date: dateStr },
  })

  // 1. 采集数据
  let intelTitles: string[] = []
  let inquiryCount = 0
  let urgentCount = 0
  let pendingTasks = 0
  let workflowSummary = ""

  try {
    const [intelItems, inquiries, pendingTaskCount, workflowRuns, urgentInquiries] =
      await Promise.all([
        prisma.marketIntelligence.findMany({
          where: { workspaceId: ctx.workspaceId },
          orderBy: { publishedAt: "desc" },
          take: 3,
          select: { title: true },
        }),
        prisma.inquiry.count({
          where: { workspaceId: ctx.workspaceId, replied: false },
        }),
        prisma.task.count({
          where: {
            workspaceId: ctx.workspaceId,
            status: { in: ["OPEN", "IN_PROGRESS"] },
          },
        }),
        prisma.workflowRun.findMany({
          where: {
            workspaceId: ctx.workspaceId,
            startedAt: {
              gte: new Date(Date.now() - 7 * 86400_000),
            },
          },
          select: { status: true },
        }),
        // 紧急未回复高优先级询盘（纳入并行查询，消除串行耗时）
        prisma.inquiry.count({
          where: {
            workspaceId: ctx.workspaceId,
            replied: false,
            priority: "high",
          },
        }),
      ])

    intelTitles = intelItems.map((i) => i.title)
    inquiryCount = inquiries
    pendingTasks = pendingTaskCount
    urgentCount = urgentInquiries

    // 工作流摘要
    const completed = workflowRuns.filter((r) => r.status === "completed").length
    const failed = workflowRuns.filter((r) => r.status === "failed").length
    workflowSummary = `本周执行 ${workflowRuns.length} 次，成功 ${completed} 次，失败 ${failed} 次`
  } catch (dataError) {
    logger.error("[report.generate] 数据采集失败", {
      error: dataError instanceof Error ? dataError.message : "未知错误",
    })
    await updateAuditEntry({
      auditId: auditEntry.auditId,
      status: "failed",
      detail: "数据采集失败",
    })
    return ApiResponse.error("数据采集失败，无法生成报告", 500)
  }

  // 2. 构建 prompt
  const systemPrompt =
    "你是一个专业的外贸助理 AI，负责生成简洁、有洞察力的每日/每周报告。"
  const userPrompt = buildReportPrompt({
    intelTitles,
    inquiryCount,
    urgentCount,
    pendingTasks,
    workflowSummary,
    dateStr,
    reportType,
  })

  // 数据快照（存储于 Report.dataSnapshot）
  const dataSnapshot = {
    intelTitles,
    inquiryCount,
    urgentCount,
    pendingTasks,
    workflowSummary,
    date: dateStr,
    reportType,
  }

  // 3. 路由并调用 LLM
  let content: string
  try {
    const decision = await selectModel({
      taskType: "analysis",
      riskLevel: "low",
      estimatedTokens: 500,
      workspaceId: ctx.workspaceId,
    })

    logger.info("[report.generate] LLM 路由决策", {
      provider: decision.provider,
      model: decision.model,
      reason: decision.reason,
    })

    if (decision.provider === "anthropic") {
      content = await callAnthropicText({
        systemPrompt,
        userPrompt,
        model: decision.model,
        maxTokens: 1024,
      })
    } else {
      content = await callDeepSeekText(
        systemPrompt,
        userPrompt,
        decision.model,
      )
    }
  } catch (llmError) {
    logger.error("[report.generate] LLM 调用失败", {
      error: llmError instanceof Error ? llmError.message : "未知错误",
    })
    await updateAuditEntry({
      auditId: auditEntry.auditId,
      status: "failed",
      detail: `LLM 调用失败: ${llmError instanceof Error ? llmError.message : "未知错误"}`,
    })

    // 写入 AgentLog（失败）
    await prisma.agentLog
      .create({
        data: {
          id: crypto.randomUUID(),
          workspaceId: ctx.workspaceId,
          source: reportType === "EVENING" ? "evening-brief" : reportType === "WEEKLY" ? "weekly-brief" : "morning-brief",
          taskName: `生成${typeLabel} ${dateStr}`,
          status: "error",
          duration: `${Math.round((Date.now() - startTime) / 1000)}s`,
          detail: llmError instanceof Error ? llmError.message : "未知错误",
          riskLevel: "low",
        },
      })
      .catch(() => {})

    return ApiResponse.error("AI 服务暂时不可用，请稍后重试", 503)
  }

  const duration = `${Math.round((Date.now() - startTime) / 1000)}s`

  // 3.5. 置信度/质量校验（AGENTS.md §4.5：confidence < 0.7 须警告）
  // —— 自由文本生成无结构化 confidence，以长度阈值为代理指标
  const qualityCheck = {
    passed: content.length >= 50,
    contentLength: content.length,
    threshold: 50,
  }
  if (!qualityCheck.passed) {
    logger.warn(`[report.generate] ${typeLabel}内容质量低于阈值`, {
      reportId,
      contentLength: content.length,
      preview: content.slice(0, 100),
    })
    // 仍在 dataSnapshot 中标记质量警告，不阻断存储
    ;(dataSnapshot as Record<string, unknown>).qualityWarning =
      `内容长度 ${content.length} < 50 字，可能质量不足`
  }

  // 4. 存储 Report
  try {
    await prisma.report.create({
      data: {
        id: reportId,
        workspaceId: ctx.workspaceId,
        type: reportType,
        content,
        generatedAt: now,
        dataSnapshot: JSON.stringify(dataSnapshot),
      },
    })
  } catch (dbError) {
    logger.error("[report.generate] 存储 Report 失败", {
      error: dbError instanceof Error ? dbError.message : "未知错误",
    })
    await updateAuditEntry({
      auditId: auditEntry.auditId,
      status: "failed",
      detail: "存储失败",
    })
    return ApiResponse.error(`存储${typeLabel}失败`, 500)
  }

  // 5. 写入 AgentLog（成功）
  try {
    await prisma.agentLog
      .create({
        data: {
          id: crypto.randomUUID(),
          workspaceId: ctx.workspaceId,
          source: reportType === "EVENING" ? "evening-brief" : reportType === "WEEKLY" ? "weekly-brief" : "morning-brief",
          taskName: `生成${typeLabel} ${dateStr}`,
          status: "success",
          duration,
          detail: `${typeLabel}已生成，${content.length} 字符`,
          riskLevel: "low",
        },
      })
  } catch (agentLogError) {
    logger.error("[report.generate] AgentLog 写入失败", {
      error: agentLogError instanceof Error ? agentLogError.message : "未知错误",
    })
  }

  // 6. 更新审计状态
  await updateAuditEntry({
    auditId: auditEntry.auditId,
    status: "success",
    contextSnapshot: {
      ...dataSnapshot,
      reportId,
      contentLength: content.length,
      duration,
    },
  })

  return ApiResponse.ok({
    id: reportId,
    type: reportType,
    content,
    generatedAt: now.toISOString(),
    dataSnapshot,
  })
}, "MEMBER")
