/**
 * Report Service — 报告生成服务
 *
 * 从 apps/web/src/app/api/reports/generate/route.ts 下沉至此，
 * 路由层仅负责鉴权 + 参数解析 + 调用本服务。
 */
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { createAuditEntry, updateAuditEntry } from "@/lib/server/audit"
import { selectModel } from "@/lib/server/model-router"
import { callAnthropicText } from "@/lib/server/llm-provider"

export type ReportType = "MORNING" | "EVENING" | "WEEKLY"
const REPORT_TYPE_LABEL: Record<ReportType, string> = { MORNING: "晨报", EVENING: "晚报", WEEKLY: "周报" }
const DEEPSEEK_CHAT_URL = "https://api.deepseek.com/v1/chat/completions"

async function callDeepSeekText(systemPrompt: string, userPrompt: string, model: string): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY 未配置")
  const res = await fetch(DEEPSEEK_CHAT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, max_tokens: 1024, temperature: 0.7, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }] }),
  })
  if (!res.ok) throw new Error(`DeepSeek 请求失败 (${res.status})`)
  const data = (await res.json()) as any
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error("DeepSeek 未返回内容")
  return content
}

export class ReportServiceError extends Error {
  constructor(public readonly httpStatus: number, message: string) { super(message); this.name = "ReportServiceError" }
}

export interface GenerateReportInput {
  workspaceId: string
  actor: string
  type?: ReportType
}

export async function generateAndStoreReport(input: GenerateReportInput): Promise<{ reportId: string; type: ReportType; title: string; content: string; createdAt: string }> {
  const reportType = input.type ?? "MORNING"
  const reportId = crypto.randomUUID()
  const now = new Date()
  const typeLabel = REPORT_TYPE_LABEL[reportType]
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
  const startTime = Date.now()

  const auditEntry = await createAuditEntry({ actor: input.actor, action: "report.generate", targetType: "report", targetId: reportId, detail: `生成${typeLabel}: ${dateStr}`, riskLevel: "low", workspaceId: input.workspaceId, automationLevel: "L2", triggeredBy: "user", contextSnapshot: { type: reportType, date: dateStr } })

  let intelTitles: string[] = [], inquiryCount = 0, urgentCount = 0, pendingTasks = 0, workflowSummary = ""
  try {
    const [intelItems, inquiries, pendingTaskCount, workflowRuns, urgentInquiries] = await Promise.all([
      prisma.marketIntelligence.findMany({ where: { workspaceId: input.workspaceId }, orderBy: { publishedAt: "desc" }, take: 3, select: { title: true } }),
      prisma.inquiry.count({ where: { workspaceId: input.workspaceId, replied: false } }),
      prisma.task.count({ where: { workspaceId: input.workspaceId, status: { in: ["OPEN", "IN_PROGRESS"] } } }),
      prisma.workflowRun.findMany({ where: { workspaceId: input.workspaceId, startedAt: { gte: new Date(Date.now() - 7 * 86400_000) } }, select: { status: true } }),
      prisma.inquiry.count({ where: { workspaceId: input.workspaceId, replied: false, priority: "high" } }),
    ])
    intelTitles = intelItems.map((i: any) => i.title)
    inquiryCount = inquiries; pendingTasks = pendingTaskCount; urgentCount = urgentInquiries
    const completed = workflowRuns.filter((r: any) => r.status === "completed").length
    const failed = workflowRuns.filter((r: any) => r.status === "failed").length
    workflowSummary = `本周执行 ${workflowRuns.length} 次，成功 ${completed} 次，失败 ${failed} 次`
  } catch (e) {
    logger.error("[report-service] 数据采集失败", { error: e instanceof Error ? e.message : "未知错误" })
    await updateAuditEntry({ auditId: auditEntry.auditId, status: "failed", detail: "数据采集失败" })
    throw new ReportServiceError(500, "数据采集失败，无法生成报告")
  }

  const systemPrompt = "你是一个专业的外贸助理 AI，负责生成简洁、有洞察力的每日/每周报告。"
  const scope = reportType === "WEEKLY" ? "本周" : "今日"
  const userPrompt = [
    `你是外贸助理。基于以下数据，为 ${dateStr} 生成一份${scope}${typeLabel}。`,
    reportType === "WEEKLY" ? "要求：300 字以内，中文，使用 Markdown，包含三个段落：本周市场回顾、询盘周统计、下周待办。" : "要求：200 字以内，中文，使用 Markdown，包含三个段落：市场动态、询盘概况、待办提醒。",
    "", `**${scope}数据**：`,
    `- 高影响力情报：${intelTitles.length > 0 ? intelTitles.join("；") : "暂无"}`,
    `- 待处理询盘：${inquiryCount} 条`, `- 紧急待办：${urgentCount} 项`, `- 待办任务：${pendingTasks} 项`,
    `- 工作流执行：${workflowSummary || "本周暂无执行记录"}`,
    "", `请直接输出${typeLabel}内容（Markdown 格式），不要包含前言或后记。`,
  ].join("\n")

  let content: string
  try {
    const decision = await selectModel({ taskType: "analysis", riskLevel: "low", estimatedTokens: 500, workspaceId: input.workspaceId })
    content = decision.provider === "anthropic"
      ? await callAnthropicText({ systemPrompt, userPrompt, model: decision.model, maxTokens: 1024 })
      : await callDeepSeekText(systemPrompt, userPrompt, decision.model)
  } catch (e) {
    logger.error("[report-service] LLM 调用失败", { error: e instanceof Error ? e.message : "未知错误" })
    await updateAuditEntry({ auditId: auditEntry.auditId, status: "failed", detail: `LLM 调用失败: ${e instanceof Error ? e.message : "未知错误"}` })
    throw new ReportServiceError(503, "AI 服务暂时不可用，请稍后重试")
  }

  const duration = `${Math.round((Date.now() - startTime) / 1000)}s`
  const dataSnapshot = { intelTitles, inquiryCount, urgentCount, pendingTasks, workflowSummary, date: dateStr, reportType }
  await Promise.all([
    updateAuditEntry({ auditId: auditEntry.auditId, status: "success", detail: `已生成${typeLabel} (${duration})`, contextSnapshot: { reportId, type: reportType, duration } }),
    prisma.report.create({ data: { id: reportId, workspaceId: input.workspaceId, type: reportType, content, title: `${dateStr} ${typeLabel}`, dataSnapshot: JSON.stringify(dataSnapshot), createdBy: input.actor || "system" } }),
    prisma.agentLog.create({ data: { id: crypto.randomUUID(), workspaceId: input.workspaceId, source: reportType === "WEEKLY" ? "weekly-brief" : reportType === "EVENING" ? "evening-brief" : "morning-brief", taskName: `生成${typeLabel} ${dateStr}`, status: "success", duration, detail: content.slice(0, 200), riskLevel: "low" } }),
  ]).catch(() => {})

  return { reportId, type: reportType, title: `${dateStr} ${typeLabel}`, content, createdAt: now.toISOString() }
}
