import { NextRequest } from "next/server";
import { logger } from '@/lib/logger';
import { HERMES_SYSTEM_PROMPT } from "@/lib/system-prompts";
import { writeAgentLog } from "@/lib/server/agent-log";
import { getGovernanceClause } from "@/lib/server/agents-md";
import { rateLimit } from "@/lib/rate-limit";
import { ChatMessageSchema, validateBody } from "@/lib/validators";

export const runtime = "nodejs";

/**
 * POST /api/chat
 * —— Hermes 智能控制面流式对话接口（SSE），底层使用 DeepSeek API。
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
    const { messages, systemPrompt } = parsed;

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      void writeAgentLog({
        source: "hermes-chat",
        taskName: "Hermes 对话",
        status: "error",
        duration: elapsed(),
        detail: "DeepSeek API Key 未配置",
      });
      return Response.json({ error: "DeepSeek API Key 未配置" }, { status: 500 });
    }

    // 注入 AGENTS.md 治理条款（运行时加载，最高优先级）
    const governance = await getGovernanceClause();
    const baseSystem = systemPrompt || HERMES_SYSTEM_PROMPT;

    // 调用 DeepSeek Chat API（兼容 OpenAI 格式，支持 SSE 流式）
    const deepseekRes = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        max_tokens: 2048,
        temperature: 0.7,
        stream: true,
        messages: [
          { role: "system", content: baseSystem + governance },
          ...messages.map((m: { role: string; content: string }) => ({
            role: m.role,
            content: m.content,
          })),
        ],
      }),
    });

    if (!deepseekRes.ok) {
      const errBody = await deepseekRes.text();
      logger.error('DeepSeek API 请求失败', { status: deepseekRes.status, body: errBody.slice(0, 500) });

      void writeAgentLog({
        source: "hermes-chat",
        taskName: "Hermes 对话",
        status: "error",
        duration: elapsed(),
        detail: `DeepSeek 请求失败 (${deepseekRes.status})`,
      });

      // 根据状态码返回友好的降级提示
      if (deepseekRes.status === 401) {
        return Response.json(
          { error: "AI 服务密钥配置有误，请联系管理员" },
          { status: 503 },
        );
      }
      if (deepseekRes.status === 429) {
        return Response.json(
          { error: "AI 服务暂时繁忙，请 30 秒后重试" },
          { status: 429 },
        );
      }
      if (deepseekRes.status >= 500) {
        return Response.json(
          { error: "AI 上游服务故障，请稍后重试" },
          { status: 503 },
        );
      }

      return Response.json(
        { error: `AI 服务请求失败 (${deepseekRes.status})` },
        { status: 502 },
      );
    }

    if (!deepseekRes.body) {
      return Response.json({ error: "响应流为空" }, { status: 500 });
    }

    // 将 DeepSeek 的 SSE 流转换为统一格式
    const reader = deepseekRes.body.getReader();
    const decoder = new TextDecoder();

    const readableStream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let buffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith("data: ")) continue;

              const data = trimmed.slice(6);
              if (data === "[DONE]") {
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                controller.close();
                void writeAgentLog({
                  source: "hermes-chat",
                  taskName: "Hermes 对话",
                  status: "success",
                  duration: elapsed(),
                });
                return;
              }

              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ text: content })}\n\n`),
                  );
                }
              } catch {
                // 跳过解析失败的中间帧
              }
            }
          }

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
          logger.error('流式响应转换失败', { error: err instanceof Error ? err.message : '未知错误' });
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

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
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
