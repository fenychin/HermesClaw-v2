import { NextRequest } from "next/server";
import { logger } from '@/lib/logger';
import { HERMES_SYSTEM_PROMPT } from "@/lib/system-prompts";
import { writeAgentLog } from "@/lib/server/agent-log";
import { getGovernanceClause } from "@/lib/server/agents-md";
import { rateLimit } from "@/lib/rate-limit";
import { ChatMessageSchema, validateBody } from "@/lib/validators";
import { buildWorkspaceContext, requireWritable, ForbiddenError } from "@/lib/workspace";
import { selectModel } from "@/lib/server/model-router";
import { openChatStream } from "@/lib/server/llm-provider";

export const runtime = "nodejs";

/**
 * POST /api/chat
 * —— Hermes 智能控制面流式对话接口（SSE）。
 *
 * 模型不再硬编码：经策略路由 selectModel() 决策 Provider 与模型
 * （AGENTS.md §1.2 环境驱动 + 数据主权），统一经共享流式层 openChatStream() 输出。
 *
 * 请求体：{ messages: { role, content }[], systemPrompt?: string }
 * 响应：  text/event-stream，每个 text_delta 以 data: { text } 推送，
 *        结束标记 data: [DONE]
 */
export async function POST(req: NextRequest) {
  // 记录执行起点，供运行日志统计耗时（AGENTS.md 闭环反馈）
  const start = Date.now();
  const elapsed = () => `${((Date.now() - start) / 1000).toFixed(1)}s`;

  try {
    // 频率限制：每分钟最多 20 次
    const ip = req.headers.get("x-forwarded-for") || "unknown";
    if (!rateLimit(ip, 20, 60_000)) {
      return Response.json(
        { error: "请求过于频繁，请稍后重试" },
        { status: 429 },
      );
    }

    const rawBody = await req.json();
    const parsed = validateBody(rawBody, ChatMessageSchema);
    if (parsed instanceof Response) return parsed;
    const { messages, systemPrompt, modelId } = parsed;

    // 解析工作空间上下文（供路由配置读取 + 审计归属）
    const ctx = await buildWorkspaceContext(req);
    requireWritable(ctx.role); // 对话写入需 MEMBER+ 权限（AGENTS.md §4.11）
    const { workspaceId } = ctx;

    // 注入 AGENTS.md 治理条款（运行时加载，最高优先级）
    const governance = await getGovernanceClause();
    const baseSystem = systemPrompt || HERMES_SYSTEM_PROMPT;
    const fullSystem = baseSystem + governance;

    // 预估 token 数（粗略：约 4 字符 / token），供路由预算策略使用
    const estimatedTokens = Math.ceil(
      (fullSystem.length + messages.reduce((sum, m) => sum + m.content.length, 0)) / 4,
    );

    // 策略路由：对话为低风险 chat 任务，由 selectModel 决策 Provider/模型并留痕
    const routing = await selectModel({
      taskType: "chat",
      riskLevel: "low",
      estimatedTokens,
      workspaceId,
    });

    // 客户端模型偏好覆写（modelId 非空时映射到 Provider + Model）
    if (modelId) {
      const resolved = resolveClientModelId(modelId);
      if (resolved) {
        routing.provider = resolved.provider;
        routing.model = resolved.model;
        routing.reason += `；客户端指定模型: ${modelId}`;
      }
    }

    // 统一 SSE 流式管道：openChatStream 处理 Provider 差异，本文件只做 SSE 封帧 + 审计
    return sseChatStream({
      provider: routing.provider,
      model: routing.model,
      system: fullSystem,
      messages,
      elapsed,
    });
  } catch (error) {
    // 权限不足（VIEWER）：返回 403
    if (error instanceof ForbiddenError) {
      return Response.json(
        { error: error.message },
        { status: 403 },
      );
    }

    const errMsg = error instanceof Error ? error.message : "";
    logger.error('Chat API 请求失败', { error: errMsg });

    void writeAgentLog({
      source: "hermes-chat",
      taskName: "Hermes 对话",
      status: "error",
      duration: elapsed(),
      detail: errMsg || "对话请求失败",
    });

    // 网络 / 超时错误
    if (
      errMsg.includes("timeout") ||
      errMsg.includes("ECONNRESET") ||
      errMsg.includes("ECONNREFUSED") ||
      errMsg.includes("fetch failed")
    ) {
      return Response.json(
        { error: "网络连接超时，请检查网络后重试" },
        { status: 504 },
      );
    }

    // 流式中断
    if (errMsg.includes("abort") || errMsg.includes("cancel")) {
      return Response.json(
        { error: "请求已被取消" },
        { status: 499 },
      );
    }

    return Response.json(
      { error: "AI 服务暂时不可用，请稍后重试" },
      { status: 500 },
    );
  }
}

// ==============================
// 统一 SSE 流式管道
// ==============================

/**
 * 将客户端模型 ID 映射为 provider + model。
 * —— 支持 Anthropic 模型（claude-*）→ anthropic Provider，
 *    未识别的 ID 返回 null（由策略路由兜底）。
 */
function resolveClientModelId(
  modelId: string,
): { provider: "anthropic" | "deepseek"; model: string } | null {
  const lower = modelId.toLowerCase().trim();

  // Anthropic 系列：claude-*
  if (lower.startsWith("claude-")) {
    return { provider: "anthropic", model: modelId };
  }

  // DeepSeek 系列
  if (lower.includes("deepseek")) {
    return { provider: "deepseek", model: modelId };
  }

  // 未识别的模型 ID（如 gemini / gpt / minimax）：返回 null，走策略路由兜底
  return null;
}

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
} as const;

interface SseChatArgs {
  provider: "anthropic" | "deepseek";
  model: string;
  system: string;
  messages: { role: string; content: string }[];
  elapsed: () => string;
}

/**
 * SSE 流式封装：将 openChatStream 的文本增量封帧为 data: {text} 格式，
 * 统一处理完成 / 错误审计与上游错误友好降级（DeepSeek + Anthropic 对齐）。
 */
function sseChatStream({ provider, model, system, messages, elapsed }: SseChatArgs) {
  const encoder = new TextEncoder();

  const readableStream = new ReadableStream({
    async start(controller) {
      try {
        await openChatStream(
          { provider, model, system, messages, maxTokens: 2048 },
          (text) => {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text })}\n\n`),
            );
          },
        );

        // 流正常结束，发送终止标记
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
        void writeAgentLog({
          source: "hermes-chat",
          taskName: "Hermes 对话",
          status: "success",
          duration: elapsed(),
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "";

        // 🟡 上游错误友好降级（DeepSeek + Anthropic 对齐）
        // openChatStream 抛出时附带 classified: UpstreamErrorInfo
        const classified = (err as { classified?: { status: number; message: string } }).classified;
        if (classified) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: classified.message })}\n\n`),
          );
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
          void writeAgentLog({
            source: "hermes-chat",
            taskName: "Hermes 对话",
            status: "error",
            duration: elapsed(),
            detail: `上游错误 ${classified.status}: ${classified.message}`,
          });
          return;
        }

        logger.error('SSE 流式响应失败', { error: errMsg });
        void writeAgentLog({
          source: "hermes-chat",
          taskName: "Hermes 对话",
          status: "error",
          duration: elapsed(),
          detail: "流式响应中断",
        });
        controller.error(err);
      }
    },
  });

  return new Response(readableStream, { headers: SSE_HEADERS });
}
