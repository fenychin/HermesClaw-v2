/**
 * Chat Handler — Hermes 智能控制面流式对话核心业务逻辑
 *
 * 从 apps/web/src/app/api/chat/route.ts 下沉至此，
 * 包含 prompt 拼装、治理条款注入、策略路由、模型覆写、流式执行、错误处理。
 *
 * 三域归属：Hermes Control Kernel
 *
 * 此模块不直接 import Next.js / Prisma / Anthropic SDK，
 * 所有外部依赖通过 ChatHandlerDeps（DI 注入）提供。
 */

import type { ReasoningTrace } from "@hermesclaw/event-contracts";

// ==============================
// DI 接口
// ==============================

/** SSE 帧入队回调：每次调用推送一帧到客户端 */
export type SseEnqueue = (data: string) => void;

/** 流式文本增量回调 */
export type StreamDeltaCallback = (
  text: string,
  isReasoning?: boolean,
) => void | Promise<void>;

export interface ChatHandlerDeps {
  /** 打开 LLM 流式对话，按增量回调推送文本 */
  openStream: (
    params: {
      provider: string;
      model: string;
      system: string;
      messages: Array<{ role: string; content: string }>;
      maxTokens?: number;
    },
    onDelta: StreamDeltaCallback,
  ) => Promise<void>;

  /** 加载行业包 prompt；返回 null 表示未找到 */
  loadPrompt: (industryId: string, key: string) => string | null;

  /** 加载 AGENTS.md 治理条款（用于注入 system prompt 末尾） */
  loadGovernance: () => Promise<string>;

  /** 模型策略路由 */
  selectModel: (ctx: {
    taskType: string;
    riskLevel: string;
    estimatedTokens: number;
    workspaceId: string;
  }, trace?: ReasoningTrace) => Promise<{
    provider: string;
    model: string;
    reason: string;
  }>;

  /** 运行日志写入（fire-and-forget，失败不抛异常） */
  writeLog: (input: {
    source: string;
    taskName: string;
    status: string;
    duration: string;
    detail?: string;
  }) => Promise<void>;

  /** 创建推理轨迹对象 */
  createTrace: (params: {
    workspaceId: string;
    conversationId: string;
  }) => ReasoningTrace;

  /** 向 trace 追加步骤 */
  addTraceStep: (
    trace: ReasoningTrace,
    step: {
      type: string;
      label: string;
      status: string;
      modelUsed?: string;
    },
  ) => any;

  /** 完成 trace 步骤 */
  completeTraceStep: (step: any, update: { status: string }) => void;

  /** SSE 帧头（"data: [DONE]\n\n"） */
  readonly SSE_DONE: string;
}

// ==============================
// 输入 / 输出
// ==============================

export interface ChatInput {
  messages: Array<{ role: string; content: string }>;
  systemPrompt?: string;
  modelId?: string;
  workspaceId: string;
  /** 行业包 ID（从 WorkspaceContext 传入，禁止在 kernel 内硬编码） */
  industryId?: string;
}

// ==============================
// 工具函数（纯函数，无外部依赖）
// ==============================

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
} as const;

/**
 * 将客户端模型 ID 映射为 provider + model。
 * 支持 Anthropic 模型（claude-*）→ anthropic Provider，
 * 未识别的 ID 返回 null（由策略路由兜底）。
 */
function resolveClientModelId(
  modelId: string,
): { provider: string; model: string } | null {
  const lower = modelId.toLowerCase().trim();

  // Anthropic 系列
  if (lower.startsWith("claude-")) {
    return { provider: "anthropic", model: modelId };
  }

  // DeepSeek 系列
  if (lower.includes("deepseek")) {
    return { provider: "deepseek", model: modelId };
  }

  return null;
}

// ==============================
// 错误类型
// ==============================

export class ChatHandlerError extends Error {
  public readonly httpStatus: number;

  constructor(message: string, httpStatus: number) {
    super(message);
    this.name = "ChatHandlerError";
    this.httpStatus = httpStatus;
  }
}

// ==============================
// 主函数
// ==============================

/**
 * 执行一次完整的 Chat 流式对话，将 SSE 帧通过 enqueue 推送。
 *
 * 流程：
 *  1. 加载治理条款
 *  2. 从行业包加载 system prompt（优先她 key，降级为 raw systemPrompt）
 *  3. 拼接 system + governance
 *  4. 预估 token 并策略路由
 *  5. 客户端模型偏好覆写
 *  6. 初始化推理轨迹并推送给客户端
 *  7. 打开 LLM 流式通道，持续 enqueue 文本增量
 *  8. 完成后推送 trace 更新 + DONE 标记 + 写成功日志
 *  9. 失败时推送友好错误帧 + DONE 标记 + 写错误日志
 *
 * @param input   聊天输入
 * @param deps    依赖注入
 * @param enqueue SSE 帧推送回调
 * @param controller 流控制器（用于 close/error）
 */
export async function executeChatStream(
  input: ChatInput,
  deps: ChatHandlerDeps,
  enqueue: SseEnqueue,
  controller: ReadableStreamDefaultController<Uint8Array>,
): Promise<void> {
  const start = Date.now();
  const elapsed = () => `${((Date.now() - start) / 1000).toFixed(1)}s`;
  const { messages, systemPrompt, modelId, workspaceId } = input;

  // 1. 加载治理条款
  const governance = await deps.loadGovernance();

  // 2. 加载行业 prompt（仅当调用方传入了 industryId 时才从行业包加载）
  const promptKey =
    !systemPrompt || systemPrompt === "hermes" ? "hermes" : systemPrompt;
  let loadedPrompt: string | null = null;
  if (input.industryId && /^[a-zA-Z0-9_-]+$/.test(promptKey)) {
    loadedPrompt = deps.loadPrompt(input.industryId, promptKey);
  }
  const baseSystem = loadedPrompt || systemPrompt || "";
  const fullSystem = baseSystem + governance;

  // 3. 预估 token
  const estimatedTokens = Math.ceil(
    (fullSystem.length +
      messages.reduce((sum, m) => sum + m.content.length, 0)) /
      4,
  );

  // 4. 推理轨迹
  const trace = deps.createTrace({
    workspaceId,
    conversationId: "ephemeral-chat",
  });

  // 5. 策略路由
  const routing = await deps.selectModel(
    {
      taskType: "chat",
      riskLevel: "low",
      estimatedTokens,
      workspaceId,
    },
    trace,
  );

  // 6. 客户端模型覆写
  if (modelId) {
    const resolved = resolveClientModelId(modelId);
    if (resolved) {
      routing.provider = resolved.provider;
      routing.model = resolved.model;
      routing.reason += `；客户端指定模型: ${modelId}`;
    }
  }

  // 7. 流式执行
  const genStep = deps.addTraceStep(trace, {
    type: "llm.generate",
    label: "模型推理与生成",
    status: "running",
    modelUsed: routing.model,
  });

  // 推送初始 trace
  enqueue(`data: ${JSON.stringify({ type: "trace", trace })}\n\n`);

  try {
    await deps.openStream(
      {
        provider: routing.provider,
        model: routing.model,
        system: fullSystem,
        messages,
        maxTokens: 8192,
      },
      (text, isReasoning) => {
        if (isReasoning) {
          enqueue(
            `data: ${JSON.stringify({ reasoning: text })}\n\n`,
          );
        } else {
          enqueue(`data: ${JSON.stringify({ text })}\n\n`);
        }
      },
    );

    // 8. 完成流 → 更新 trace + DONE + 成功日志
    deps.completeTraceStep(genStep, { status: "passed" });
    enqueue(`data: ${JSON.stringify({ type: "trace", trace })}\n\n`);
    enqueue(deps.SSE_DONE);
    controller.close();

    void deps.writeLog({
      source: "hermes-chat",
      taskName: "Hermes 对话",
      status: "success",
      duration: elapsed(),
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "";

    // 上游错误友好降级（附带 classified 信息）
    const classified = (err as {
      classified?: { status: number; message: string };
    }).classified;
    if (classified) {
      enqueue(
        `data: ${JSON.stringify({ error: classified.message })}\n\n`,
      );
      enqueue(deps.SSE_DONE);
      controller.close();

      void deps.writeLog({
        source: "hermes-chat",
        taskName: "Hermes 对话",
        status: "error",
        duration: elapsed(),
        detail: `上游错误 ${classified.status}: ${classified.message}`,
      });
      return;
    }

    // 其他错误 → SSE 错误帧 + DONE 正常关闭，让前端在 UI 上能友好展示错误描述，避免流式通道崩溃
    enqueue(
      `data: ${JSON.stringify({ error: errMsg || "流式响应中断" })}\n\n`,
    );
    enqueue(deps.SSE_DONE);
    controller.close();

    void deps.writeLog({
      source: "hermes-chat",
      taskName: "Hermes 对话",
      status: "error",
      duration: elapsed(),
      detail: errMsg || "流式响应中断",
    });
  }
}

/**
 * 创建 SSE Response 对象（Next.js / Web API 兼容）。
 *
 * 一行调用即可在 route handler 中使用：
 *   return createSseResponse(input, deps);
 */
export function createSseResponse(
  input: ChatInput,
  deps: ChatHandlerDeps,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller: ReadableStreamDefaultController<Uint8Array>) {
      const enqueue: SseEnqueue = (data: string) =>
        controller.enqueue(encoder.encode(data));
      await executeChatStream(input, deps, enqueue, controller);
    },
  });
  return new Response(stream, { headers: { ...SSE_HEADERS } });
}
