/**
 * Report Handler — 报告生成核心业务逻辑
 *
 * 从 apps/web/src/app/api/reports/[id]/route.ts 下沉至此
 *
 * 三域归属：Hermes Control Kernel
 */

export interface ReportHandlerDeps {
  /** 调用 LLM 生成文本（非流式） */
  callLlm: (params: {
    provider: string;
    model: string;
    systemPrompt: string;
    userPrompt: string;
    maxTokens?: number;
  }) => Promise<string>;
  /** 模型策略路由 */
  selectModel: (ctx: {
    taskType: string;
    riskLevel: string;
    estimatedTokens: number;
    workspaceId: string;
  }) => Promise<{ provider: string; model: string; reason: string }>;
}

export type ReportType = "MORNING" | "EVENING" | "WEEKLY";

const REPORT_TYPE_LABEL: Record<ReportType, string> = {
  MORNING: "晨报", EVENING: "晚报", WEEKLY: "周报",
};

function buildReportPrompt(data: {
  intelTitles: string[];
  inquiryCount: number;
  urgentCount: number;
  pendingTasks: number;
  workflowSummary: string;
  dateStr: string;
  reportType: ReportType;
}): string {
  const label = REPORT_TYPE_LABEL[data.reportType];
  const scope = data.reportType === "WEEKLY" ? "本周" : "今日";

  const lines = [
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
  ];
  return lines.join("\n");
}

export interface ReportGenerateInput {
  workspaceId: string;
  type?: ReportType;
  /** 数据采集函数 — 由上层注入（因为需要访问 prisma） */
  collectData: () => Promise<{
    intelTitles: string[];
    inquiryCount: number;
    urgentCount: number;
    pendingTasks: number;
    workflowSummary: string;
    dateStr: string;
  }>;
}

export interface ReportGenerateResult {
  content: string;
  reportType: ReportType;
  dateStr: string;
  intelTitles: string[];
  inquiryCount: number;
  urgentCount: number;
  pendingTasks: number;
  workflowSummary: string;
}

export async function generateReport(
  input: ReportGenerateInput,
  deps: ReportHandlerDeps,
): Promise<ReportGenerateResult> {
  const reportType = input.type ?? "MORNING";
  const data = await input.collectData();

  const systemPrompt = "你是一个专业的外贸助理 AI，负责生成简洁、有洞察力的每日/每周报告。";
  const userPrompt = buildReportPrompt({ ...data, reportType });

  const decision = await deps.selectModel({
    taskType: "analysis", riskLevel: "low", estimatedTokens: 500, workspaceId: input.workspaceId,
  });

  const content = await deps.callLlm({
    provider: decision.provider,
    model: decision.model,
    systemPrompt,
    userPrompt,
    maxTokens: 1024,
  });

  return { content, reportType, dateStr: data.dateStr, intelTitles: data.intelTitles,
    inquiryCount: data.inquiryCount, urgentCount: data.urgentCount,
    pendingTasks: data.pendingTasks, workflowSummary: data.workflowSummary };
}
