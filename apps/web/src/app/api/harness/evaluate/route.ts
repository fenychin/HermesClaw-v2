/**
 * POST /api/harness/evaluate — Harness 评估 + 提案生成
 *
 * Sprint 3 MVP：调用 hermes-kernel 真实评估引擎 + 提案生成器，
 * 替代旧 hermesClient.evaluateHarness() 的外部 API 依赖。
 *
 * 流程：
 *  1. runHarnessEvaluation() — 采集 DB 信号 + LLM 分析
 *  2. generateHarnessProposals() — severity≥medium 的结果写入 HarnessProposal 表
 *  3. 返回 { results, proposals, anomalies }
 */
import { prisma } from "@/lib/prisma";
import { withRBAC } from "@/lib/server/api-handler";
import type { WorkspaceContext } from "@/lib/workspace";
import { ApiResponse } from "@/lib/server/api-response";
import { z } from "zod";
import { validateBody } from "@/lib/server/validators";
import {
  runHarnessEvaluation,
  generateHarnessProposals,
} from "@hermesclaw/hermes-kernel";
import { callLlmText } from "@/lib/server/llm-provider";
import { logger } from "@/lib/logger";

const HarnessEvaluateSchema = z.object({
  agentId: z.string().optional(),
  triggerReason: z.string().min(1),
  /** 评估回看窗口（小时），默认 24 */
  windowHours: z.number().int().min(1).max(168).optional(),
});

/**
 * 适配层：将 callLlmText (apps/web 侧) 映射为 kernel 期望的
 * (systemPrompt, userPrompt) → string 签名。
 */
function makeCallLlmAdapter() {
  return async (systemPrompt: string, userPrompt: string): Promise<string> => {
    return callLlmText({
      provider: "deepseek",
      model: "deepseek-chat",
      systemPrompt,
      userPrompt,
    });
  };
}

export const POST = withRBAC(async (req: Request, ctx: WorkspaceContext) => {
  try {
    const raw = await req.json();
    const body = validateBody(raw, HarnessEvaluateSchema);
    if (body instanceof Response) return body;

    const windowHours = body.windowHours ?? 24;
    const callLlm = makeCallLlmAdapter();

    // Step 1: 评估引擎 — 采集信号 + LLM 分析
    const evalResult = await runHarnessEvaluation(
      { workspaceId: ctx.workspaceId, windowHours },
      { prisma, callLlm },
    );

    // Step 2: 提案生成 — severity≥medium 的结果写入 DB
    const proposalResult = await generateHarnessProposals(
      { workspaceId: ctx.workspaceId, windowHours },
      { prisma, callLlm },
    );

    logger.info("Harness 评估完成", {
      workspaceId: ctx.workspaceId,
      results: evalResult.results.length,
      anomalies: evalResult.anomalies,
      proposalsGenerated: proposalResult.generated,
    });

    return ApiResponse.ok({
      results: evalResult.results,
      anomalies: evalResult.anomalies,
      proposals: proposalResult.proposals,
      generated: proposalResult.generated,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    logger.error("Harness 评估失败", { error: message });
    return ApiResponse.error(message, 500);
  }
}, "MEMBER");
