import { rateLimit } from "@/lib/rate-limit";
import { TaskExecuteSchema, validateBody } from "@/lib/server/validators";
import { TypedTaskInputSchema, isCriticalActionType } from "@hermesclaw/event-contracts";
import type { WorkspaceContext } from "@/lib/workspace";
import { withRBAC } from "@/lib/server/api-handler";
import { selectModel } from "@/lib/server/model-router";
import { callLlmText } from "@/lib/server/llm-provider";
import { loadIndustryPrompt } from "@hermesclaw/industry-pack-sdk";
import { handleQuickTask, TaskHandlerError } from "@hermesclaw/hermes-kernel";
import { writeAgentLog } from "@/lib/server/agent-log";
import { TRADE_AGENT_PROMPTS } from "@/lib/system-prompts";

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
