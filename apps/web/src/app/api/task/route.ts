import { rateLimit } from "@/lib/rate-limit";
import { TaskExecuteSchema, validateBody } from "@/lib/server/validators";
import { TypedTaskInputSchema, isCriticalActionType } from "@hermesclaw/event-contracts";
import type { WorkspaceContext } from "@/lib/workspace";
import { withRBAC } from "@/lib/server/api-handler";
import { selectModel } from "@/lib/server/model-router";
import { callLlmText } from "@/lib/server/llm-provider";
import { loadIndustryPrompt } from "@hermesclaw/industry-pack-sdk";
import { handleQuickTask, checkPolicy, TaskHandlerError } from "@hermesclaw/hermes-kernel";
import { writeAgentLog } from "@/lib/server/agent-log";
import { TRADE_AGENT_PROMPTS } from "@/lib/system-prompts";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export const POST = withRBAC(async (req: Request, ctx: WorkspaceContext) => {
  if (!rateLimit(req.headers.get("x-forwarded-for") || "unknown", 15, 60_000))
    return Response.json({ error: "过于频繁，请稍后重试" }, { status: 429 });
  const p = validateBody(await req.json().catch(() => null), TaskExecuteSchema);
  if (p instanceof Response) return p;
  let pj: any = null;
  try { pj = JSON.parse(p.input); } catch { /* pass */ }
  if (pj?._type && !TypedTaskInputSchema.safeParse(pj).success && isCriticalActionType(pj._type))
    return Response.json({ error: "参数不符合 actionType 要求" }, { status: 400 });

  // ─── Sprint 3 场景 E：checkPolicy 拦截 critical action ───
  // 对 isCriticalActionType=true 的操作，调用 kernel checkPolicy()
  // 按 workspace.automationLevel × riskLevel 矩阵裁决
  if (pj?._type && isCriticalActionType(pj._type)) {
    try {
      const policyResult = await checkPolicy(
        {
          workspaceId: ctx.workspaceId,
          action: pj._type,
          riskLevel: "high",
          automationLevel: undefined, // 由 DB workspace.automationLevel 决定
        },
        { prisma },
      );

      if (!policyResult.allowed) {
        logger.info("Task 被 Policy 拦截", {
          workspaceId: ctx.workspaceId,
          action: pj._type,
          level: policyResult.level,
          reason: policyResult.reason,
        });

        const status = policyResult.requiresApproval ? 403 : 403;
        return Response.json(
          {
            success: false,
            error: policyResult.reason ?? "操作被策略拦截",
            requiresApproval: policyResult.requiresApproval,
            policyLevel: policyResult.level,
          },
          { status },
        );
      }
    } catch (policyErr) {
      // checkPolicy 本身异常不阻断任务，仅记录
      logger.warn("checkPolicy 检查异常，降级放行", {
        error: policyErr instanceof Error ? policyErr.message : "未知错误",
      });
    }
  }

  // 从上下文驱动 industryId，禁止 kernel 内硬编码
  const industryId = ctx.industryId ?? "foreign-trade"

  try {
    return Response.json(await handleQuickTask(
      { taskType: p.taskType, userInput: p.input, workspaceId: ctx.workspaceId, industryId }, {
        promptMap: { ...TRADE_AGENT_PROMPTS }, loadPrompt: (id, k) => loadIndustryPrompt(id, k),
        callLlm: (o: any) => callLlmText(o), writeLog: (i: any) => writeAgentLog(i),
        selectModel: (c) => selectModel({ taskType: c.taskType as "analysis", riskLevel: c.riskLevel as "low",
          estimatedTokens: c.estimatedTokens, workspaceId: c.workspaceId }),
      }));
  } catch (err) {
    if (err instanceof TaskHandlerError) return Response.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}, "MEMBER");
