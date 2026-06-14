import { TRADE_AGENT_PROMPTS } from "@/lib/system-prompts";
import { writeAgentLog } from "@/lib/server/shared/agent-log";
import { rateLimit } from "@/lib/rate-limit";
import { TaskExecuteSchema, validateBody } from "@/lib/validators";
import { TypedTaskInputSchema, isCriticalActionType } from "@/contracts";
import { logger } from "@/lib/logger";
import type { WorkspaceContext } from "@/lib/workspace";
import { withRBAC } from "@/lib/server/shared/api-handler";
import { selectModel } from "@/lib/server/shared/model-router";
import {
  callAnthropicText,
  classifyUpstreamError,
  type LlmProvider,
} from "@/lib/server/shared/llm-provider";

export const runtime = "nodejs";

type TaskType = keyof typeof TRADE_AGENT_PROMPTS;

/** 置信度护栏阈值（AGENTS.md 4.5：置信度 < 0.7 自动暂停请求人工） */
const CONFIDENCE_THRESHOLD = 0.7;

/**
 * DeepSeek Chat API 端点（OpenAI 兼容）
 * —— 共享常量，与 llm-provider.ts 对齐，避免硬编码
 */
const DEEPSEEK_CHAT_URL = "https://api.deepseek.com/v1/chat/completions";

/** 要求模型在末尾自评置信度，供护栏判定 */
const CONFIDENCE_INSTRUCTION = `\n\n在回答的最后另起一行，按格式输出你对本次结果的置信度（0~1 小数）：\nCONFIDENCE: <数值>`;

/** 从结果文本中抽取并剥离 CONFIDENCE 行；抽取不到返回 null（优雅降级） */
function extractConfidence(text: string): { cleaned: string; confidence: number | null } {
  const match = text.match(/CONFIDENCE:\s*([0-1](?:\.\d+)?)/i);
  if (!match) return { cleaned: text, confidence: null };
  const value = Number(match[1]);
  const cleaned = text.replace(/\n?CONFIDENCE:\s*[0-1](?:\.\d+)?/i, "").trim();
  return {
    cleaned,
    confidence: Number.isFinite(value) ? value : null,
  };
}

/** DeepSeek 非流式文本调用（无 JSON 模式，返回纯文本） */
async function callDeepSeekText(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  signal?: AbortSignal,
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY 未配置");

  const res = await fetch(DEEPSEEK_CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      temperature: 0.4,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
    signal,
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    const classified = classifyUpstreamError(res.status);
    throw Object.assign(
      new Error(`DeepSeek 请求失败 (${res.status})：${errBody.slice(0, 200)}`),
      { upstreamStatus: res.status, classified },
    );
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("DeepSeek 未返回文本内容");
  return content;
}

/**
 * 执行 LLM 调用（非流式），根据 Provider 分派
 * —— 取代硬编码的 anthropic.messages.create，经 selectModel() 策略路由决策 Provider/Model
 */
async function callLlmText(
  provider: LlmProvider,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  signal?: AbortSignal,
): Promise<string> {
  if (provider === "anthropic") {
    return callAnthropicText({
      systemPrompt,
      userPrompt,
      model,
      maxTokens: 2048,
    });
  }
  return callDeepSeekText(model, systemPrompt, userPrompt, signal);
}

/** 从回复中提取建议的下一步行动（以 "- " 开头的行） */
function extractSuggestedActions(text: string): string[] {
  const actions: string[] = [];
  const lines = text.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- ") || trimmed.startsWith("• ")) {
      actions.push(trimmed.replace(/^[-•]\s*/, ""));
    }
  }
  return actions;
}

/**
 * POST /api/task
 * —— 快捷任务非流式接口，用于 /new 页面的快捷卡片。
 *
 * §4.12 策略路由：经 selectModel() 决策 Provider/Model（不再硬编码），
 *   决策自动写入 AuditLog(action='model.route')。
 *
 * §4.11 RBAC：经 withRBAC(MEMBER) 包裹，VIEWER 不可写。
 *
 * 请求体：{ taskType: string, input: string }
 *   taskType 对应 TRADE_AGENT_PROMPTS 中的 key：
 *     - inquiryAnalysis     分析询盘
 *     - developmentLetter   开发信
 *     - quotation           报价策略
 *     - customerProfile     客户画像
 * 响应体：{ status: "ok" | "needs_human", result, confidence, suggestedActions, reason? }
 *   confidence < 0.7 时 status 为 "needs_human"，建议人工复核（HTTP 仍 200）。
 *   无置信度信号（降级）时 confidence 为 null、status 为 "ok"。
 */
export const POST = withRBAC(async (request: Request, ctx: WorkspaceContext) => {
  // 记录执行起点，供运行日志统计耗时
  const start = Date.now();
  const elapsed = () => `${((Date.now() - start) / 1000).toFixed(1)}s`;

  // 频率限制：每分钟最多 15 次
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimit(ip, 15, 60_000)) {
    return Response.json(
      { error: "请求过于频繁，请稍后重试" },
      { status: 429 },
    );
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = validateBody(rawBody, TaskExecuteSchema);
  if (parsed instanceof Response) return parsed;
  const { taskType, input } = parsed;

  let parsedInput: unknown = null;
  try {
    parsedInput = JSON.parse(input);
  } catch {
    // 忽略非 JSON 文本输入，向下兼容
  }

  if (parsedInput && typeof parsedInput === "object") {
    const actionType = typeof (parsedInput as any)._type === "string" ? (parsedInput as any)._type : "";
    const typedInput = TypedTaskInputSchema.safeParse(parsedInput);
    if (!typedInput.success && isCriticalActionType(actionType)) {
      logger.warn('快捷任务输入被拦截：任务输入不符合 actionType 要求', {
        taskType,
        actionType,
        errors: typedInput.error.issues.map(i => `${i.path.join('.')}: ${i.message}`)
      });
      return Response.json(
        { error: "任务输入不符合 actionType 要求" },
        { status: 400 },
      );
    }
  }

  const systemPrompt = TRADE_AGENT_PROMPTS[taskType as TaskType];
  if (!systemPrompt) {
    return Response.json(
      { error: `不支持的任务类型: ${taskType}` },
      { status: 400 },
    );
  }

  // 预估 token 数（粗略：约 4 字符 / token），供 selectModel 路由预算策略使用
  const estimatedTokens = Math.ceil((systemPrompt.length + input.length) / 4);

  // §4.12 策略路由：按 analysis 任务 + low 风险决策 Provider/Model 并留痕
  const routing = await selectModel({
    taskType: "analysis",
    riskLevel: "low",
    estimatedTokens,
    workspaceId: ctx.workspaceId,
  });

  // 超时保护：最多等待 30 秒
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const rawText = await callLlmText(
      routing.provider,
      routing.model,
      systemPrompt + CONFIDENCE_INSTRUCTION,
      input,
      controller.signal,
    );

    clearTimeout(timeout);

    // 抽取并剥离置信度行（抽不到则降级为 null）
    const { cleaned: resultText, confidence } = extractConfidence(rawText);

    // 从回复中提取建议的下一步行动
    const suggestedActions = extractSuggestedActions(resultText);

    // §4.5 护栏判定：置信度低于阈值则标记需人工复核
    const needsHuman =
      confidence !== null && confidence < CONFIDENCE_THRESHOLD;

    void writeAgentLog({
      source: "quick-task",
      taskName: taskType,
      status: needsHuman ? "needs_human" : "success",
      duration: elapsed(),
      detail:
        (needsHuman ? `[置信度 ${confidence}] ` : "") +
        `${routing.provider}/${routing.model} · ` +
        resultText.slice(0, 100),
    });

    return Response.json({
      status: needsHuman ? "needs_human" : "ok",
      result: resultText,
      confidence,
      suggestedActions,
      ...(needsHuman
        ? {
            reason: `模型置信度 ${confidence} 低于阈值 ${CONFIDENCE_THRESHOLD}，建议人工复核后再采用`,
          }
        : {}),
    });
  } catch (err) {
    clearTimeout(timeout);

    if (err instanceof Error && err.name === "AbortError") {
      void writeAgentLog({
        source: "quick-task",
        taskName: taskType,
        status: "timeout",
        duration: elapsed(),
        detail: "任务处理超时（>30s）",
      });
      return Response.json(
        { error: "任务处理超时，请稍后重试" },
        { status: 504 },
      );
    }

    // 上游错误友好降级
    const classified = (err as { classified?: { status: number; message: string } }).classified;
    if (classified) {
      void writeAgentLog({
        source: "quick-task",
        taskName: taskType,
        status: "error",
        duration: elapsed(),
        detail: `上游错误 ${classified.status}: ${classified.message}`,
      });
      return Response.json(
        { error: classified.message },
        { status: classified.status },
      );
    }

    throw err;
  }
}, "MEMBER");
