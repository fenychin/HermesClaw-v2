import { NextRequest } from "next/server";
import { logger } from '@/lib/logger';
import anthropic from "@/lib/anthropic";
import { TRADE_AGENT_PROMPTS } from "@/lib/system-prompts";
import { writeAgentLog } from "@/lib/server/agent-log";
import { rateLimit } from "@/lib/rate-limit";
import { TaskExecuteSchema, validateBody } from "@/lib/validators";

export const runtime = "nodejs";

type TaskType = keyof typeof TRADE_AGENT_PROMPTS;

/** 置信度护栏阈值（AGENTS.md 4.5：置信度 < 0.7 自动暂停请求人工） */
const CONFIDENCE_THRESHOLD = 0.7;

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

/**
 * POST /api/task
 * —— 快捷任务非流式接口，用于 /new 页面的 6 个快捷卡片。
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
export async function POST(req: NextRequest) {
  // 记录执行起点，供运行日志统计耗时
  const start = Date.now();
  const elapsed = () => `${((Date.now() - start) / 1000).toFixed(1)}s`;

  try {
    // 频率限制：每分钟最多 15 次
    const ip = req.headers.get("x-forwarded-for") || "unknown";
    if (!rateLimit(ip, 15, 60_000)) {
      return Response.json(
        { error: "请求过于频繁，请稍后重试" },
        { status: 429 },
      );
    }

    const rawBody = await req.json();
    const parsed = validateBody(rawBody, TaskExecuteSchema);
    if (parsed instanceof Response) return parsed;
    const { taskType, input } = parsed;

    const systemPrompt = TRADE_AGENT_PROMPTS[taskType as TaskType];
    if (!systemPrompt) {
      return Response.json(
        { error: `不支持的任务类型: ${taskType}` },
        { status: 400 },
      );
    }

    // 超时保护：最多等待 30 秒
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await anthropic.messages.create(
        {
          model: "claude-sonnet-4-6",
          max_tokens: 2048,
          system: systemPrompt + CONFIDENCE_INSTRUCTION,
          messages: [
            {
              role: "user",
              content: input,
            },
          ],
        },
        { signal: controller.signal },
      );

      clearTimeout(timeout);

      // 提取文本内容
      const rawText =
        response.content
          .filter((block) => block.type === "text")
          .map((block) => block.text)
          .join("\n") || "任务处理完成，但未生成文本结果。";

      // 抽取并剥离置信度行（抽不到则降级为 null）
      const { cleaned: resultText, confidence } = extractConfidence(rawText);

      // 从回复中提取建议的下一步行动（以 "- " 开头的行）
      const suggestedActions: string[] = [];
      const lines = resultText.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("- ") || trimmed.startsWith("• ")) {
          suggestedActions.push(trimmed.replace(/^[-•]\s*/, ""));
        }
      }

      // 护栏判定：置信度低于阈值则标记需人工复核
      const needsHuman =
        confidence !== null && confidence < CONFIDENCE_THRESHOLD;

      void writeAgentLog({
        source: "quick-task",
        taskName: taskType,
        status: needsHuman ? "needs_human" : "success",
        duration: elapsed(),
        detail:
          (needsHuman ? `[置信度 ${confidence}] ` : "") +
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
      throw err;
    }
  } catch (error) {
    logger.error('快捷任务执行失败', { error: error instanceof Error ? error.message : '未知错误' });
    void writeAgentLog({
      source: "quick-task",
      taskName: "快捷任务",
      status: "error",
      duration: elapsed(),
      detail: error instanceof Error ? error.message : "任务处理失败",
    });
    return Response.json(
      { error: "任务处理失败，请稍后重试" },
      { status: 500 },
    );
  }
}
