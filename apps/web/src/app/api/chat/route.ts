import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { ChatMessageSchema, validateBody } from "@/lib/server/validators";
import { buildWorkspaceContext, requireWritable, ForbiddenError } from "@/lib/workspace";
import { selectModel } from "@/lib/server/model-router";
import { openChatStream, callDeepSeekText } from "@/lib/server/llm-provider";
import { loadIndustryPrompt } from "@hermesclaw/industry-pack-sdk";
import { getGovernanceClause } from "@/lib/server/agents-md";
import { createTrace, addTraceStep, completeTraceStep } from "@/lib/server/reasoning-trace";
import { writeAgentLog } from "@/lib/server/agent-log";
import { createSseResponse, parseIntent } from "@hermesclaw/hermes-kernel";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimit(ip, 20, 60_000))
    return Response.json({ error: "过于频繁，请稍后重试" }, { status: 429 });

  const p = validateBody(await req.json(), ChatMessageSchema);
  if (p instanceof Response) return p;

  let ctx;
  try { ctx = await buildWorkspaceContext(req); requireWritable(ctx.role); }
  catch (e) { return e instanceof ForbiddenError ? Response.json({ error: e.message }, { status: 403 }) : (() => { throw e; })(); }

  const lastUserMsg = [...p.messages].reverse().find((m: any) => m.role === "user");
  const parseResult = await parseIntent(
    {
      rawText: lastUserMsg?.content || "",
      workspaceId: ctx.workspaceId,
      userId: ctx.user?.id || "anonymous",
      conversationHistory: p.messages.map((m: any) => ({ role: m.role as "user" | "assistant", content: m.content })),
    },
    {
      callLlm: async (system: string, user: string) => {
        const result = await callDeepSeekText({ systemPrompt: system, userPrompt: user, model: "deepseek-chat" });
        return result;
      },
      prisma,
    },
  ).catch(() => null);

  return createSseResponse({ ...p, workspaceId: ctx.workspaceId, industryId: ctx.industryId }, {
    openStream: (o: any, od: any) => openChatStream({ ...o, maxTokens: o.maxTokens ?? 8192 }, od),
    loadPrompt: (id: any, k: any) => loadIndustryPrompt(id, k),
    loadGovernance: () => getGovernanceClause(),
    selectModel: (c: any, t: any) => selectModel({ taskType: c.taskType as "chat", riskLevel: c.riskLevel as "low", estimatedTokens: c.estimatedTokens, workspaceId: c.workspaceId }, t as any),
    createTrace: (tp: any) => createTrace({ workspaceId: tp.workspaceId, conversationId: tp.conversationId }),
    addTraceStep: (tr: any, s: any) => addTraceStep(tr as any, s as any),
    completeTraceStep: (st: any, u: any) => completeTraceStep(st as any, u),
    writeLog: (i: any) => writeAgentLog(i),
    SSE_DONE: "data: [DONE]\n\n",
  });
}
