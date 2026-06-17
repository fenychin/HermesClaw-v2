/**
 * Quick Task Handler — 快捷任务核心业务逻辑
 *
 * 从 apps/web/src/app/api/task/route.ts 下沉至此，
 * 包含 LLM prompt 拼装、置信度提取、业务分支判断、策略路由调用。
 *
 * 三域归属：Hermes Control Kernel
 *
 * 此模块不直接 import Next.js / Prisma / Anthropic SDK，
 * 所有外部依赖通过 TaskHandlerDeps（DI 注入）提供。
 */

// ==============================
// DI 接口
// ==============================

export interface TaskHandlerDeps {
  /** LLM 文本调用（非流式） */
  callLlm: (params: {
    provider: string;
    model: string;
    systemPrompt: string;
    userPrompt: string;
    signal?: AbortSignal;
  }) => Promise<string>;

  /** 加载行业包 prompt */
  loadPrompt: (industryId: string, key: string) => string | null;

  /** 模型策略路由 */
  selectModel: (ctx: {
    taskType: string;
    riskLevel: string;
    estimatedTokens: number;
    workspaceId: string;
  }) => Promise<{ provider: string; model: string; reason: string }>;

  /** 运行日志写入（fire-and-forget） */
  writeLog: (input: {
    source: string;
    taskName: string;
    status: string;
    duration: string;
    detail?: string;
  }) => Promise<void>;

  /** taskType → prompt key 映射表 */
  promptMap: Record<string, string>;
}

// ==============================
// 常量
// ==============================

/** 置信度护栏阈值（AGENTS.md 4.5：置信度 < 0.7 自动暂停请求人工） */
const CONFIDENCE_THRESHOLD = 0.7;

/** 要求模型在末尾自评置信度，供护栏判定 */
const CONFIDENCE_INSTRUCTION =
  "\n\n在回答的最后另起一行，按格式输出你对本次结果的置信度（0~1 小数）：\nCONFIDENCE: <数值>";

// ==============================
// 输入 / 输出
// ==============================

export interface QuickTaskInput {
  taskType: string;
  userInput: string;
  workspaceId: string;
  /** 行业包 ID（从 WorkspaceContext 传入，禁止在 kernel 内硬编码） */
  industryId: string;
}

export interface QuickTaskResult {
  status: "ok" | "needs_human";
  result: string;
  confidence: number | null;
  suggestedActions: string[];
  reason?: string;
}

// ==============================
// 内部工具（纯函数，无外部依赖）
// ==============================

/** 从结果文本中抽取并剥离 CONFIDENCE 行；抽取不到返回 null（优雅降级） */
function extractConfidence(text: string): {
  cleaned: string;
  confidence: number | null;
} {
  const match = text.match(/CONFIDENCE:\s*([0-1](?:\.\d+)?)/i);
  if (!match) return { cleaned: text, confidence: null };
  const value = Number(match[1]);
  const cleaned = text
    .replace(/\n?CONFIDENCE:\s*[0-1](?:\.\d+)?/i, "")
    .trim();
  return { cleaned, confidence: Number.isFinite(value) ? value : null };
}

/** 从回复中提取建议的下一步行动（以 "- " 或 "• " 开头的行） */
function extractSuggestedActions(text: string): string[] {
  const actions: string[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- ") || trimmed.startsWith("• ")) {
      actions.push(trimmed.replace(/^[-•]\s*/, ""));
    }
  }
  return actions;
}

// ==============================
// 错误类型
// ==============================

export class TaskHandlerError extends Error {
  public readonly httpStatus: number;

  constructor(message: string, httpStatus: number) {
    super(message);
    this.name = "TaskHandlerError";
    this.httpStatus = httpStatus;
  }
}

// ==============================
// 主函数
// ==============================

/**
 * 执行快捷任务（非流式），供 /api/task 路由调用。
 *
 * 流程：
 *  1. taskType → promptKey 映射
 *  2. 从行业包加载 system prompt
 *  3. 策略路由决策 Provider/Model
 *  4. 超时保护（30s）+ LLM 调用
 *  5. 置信度抽取 + 护栏判定
 *  6. 运行日志写入
 *
 * @throws TaskHandlerError 当业务错误（如不支持的任务类型、上游故障）时抛出
 */
export async function handleQuickTask(
  input: QuickTaskInput,
  deps: TaskHandlerDeps,
): Promise<QuickTaskResult> {
  const { taskType, userInput, workspaceId } = input;
  const start = Date.now();
  const elapsed = () => `${((Date.now() - start) / 1000).toFixed(1)}s`;

  // 1. 映射 prompt key
  const promptKey = deps.promptMap[taskType];
  if (!promptKey) {
    throw new TaskHandlerError(`不支持的任务类型: ${taskType}`, 400);
  }

  // 2. 加载行业 prompt（industryId 从 WorkspaceContext 传入）
  const systemPrompt = deps.loadPrompt(input.industryId, promptKey);
  if (!systemPrompt) {
    throw new TaskHandlerError(
      `未能加载该任务类型的 prompt: ${promptKey}`,
      500,
    );
  }

  // 3. 预估 token 并策略路由
  const estimatedTokens = Math.ceil(
    (systemPrompt.length + userInput.length) / 4,
  );
  const routing = await deps.selectModel({
    taskType: "analysis",
    riskLevel: "low",
    estimatedTokens,
    workspaceId,
  });

  // 4. 超时保护（最多 30 秒）
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const rawText = await deps.callLlm({
      provider: routing.provider,
      model: routing.model,
      systemPrompt: systemPrompt + CONFIDENCE_INSTRUCTION,
      userPrompt: userInput,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    // 5. 抽取置信度 + 建议行动
    const { cleaned: resultText, confidence } = extractConfidence(rawText);
    const suggestedActions = extractSuggestedActions(resultText);

    // 6. 护栏判定：置信度低于阈值则标记需人工复核
    const needsHuman =
      confidence !== null && confidence < CONFIDENCE_THRESHOLD;

    // 7. 写运行日志（fire-and-forget）
    void deps.writeLog({
      source: "quick-task",
      taskName: taskType,
      status: needsHuman ? "needs_human" : "success",
      duration: elapsed(),
      detail:
        (needsHuman ? `[置信度 ${confidence}] ` : "") +
        `${routing.provider}/${routing.model} · ` +
        resultText.slice(0, 100),
    });

    return {
      status: needsHuman ? "needs_human" : "ok",
      result: resultText,
      confidence,
      suggestedActions,
      ...(needsHuman
        ? {
            reason: `模型置信度 ${confidence} 低于阈值 ${CONFIDENCE_THRESHOLD}，建议人工复核后再采用`,
          }
        : {}),
    };
  } catch (err) {
    clearTimeout(timeout);

    // 不吞掉已抛出的 TaskHandlerError
    if (err instanceof TaskHandlerError) throw err;

    // 超时处理
    if (err instanceof Error && err.name === "AbortError") {
      void deps.writeLog({
        source: "quick-task",
        taskName: taskType,
        status: "timeout",
        duration: elapsed(),
        detail: "任务处理超时（>30s）",
      });
      throw new TaskHandlerError("任务处理超时，请稍后重试", 504);
    }

    // 上游错误友好降级（openChatStream / callLlm 抛出时附带 classified）
    const classified = (err as { classified?: { status: number; message: string } })
      .classified;
    if (classified) {
      void deps.writeLog({
        source: "quick-task",
        taskName: taskType,
        status: "error",
        duration: elapsed(),
        detail: `上游错误 ${classified.status}: ${classified.message}`,
      });
      throw new TaskHandlerError(classified.message, classified.status);
    }

    // 其他未知错误继续向上抛出
    throw err;
  }
}
