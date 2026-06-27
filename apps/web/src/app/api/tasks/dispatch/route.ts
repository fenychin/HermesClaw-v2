/**
 * POST /api/tasks/dispatch — 新对话 TaskEnvelope 写入端点
 *
 * 职责：
 *   - 接收用户 chat 输入，调用 dispatchChatTask 完成 TaskEnvelope 写入闭环
 *   - L3 风险返回 409（带 requiresConfirmation 标记）
 *   - L4 风险返回 403（硬拒绝）
 *   - 失败降级不阻断对话，前端可自行决定是否继续
 *
 * Request:
 *   { input: string, confirmed?: boolean }
 *
 * Success (200):
 *   { success: true, data: { taskId, workflowRunId, envelope: { actionType, riskLevel, automationLevel }, fallback } }
 *
 * L3 Confirmation Required (409):
 *   { success: false, requiresConfirmation: true, riskLevel, automationLevel, error }
 *
 * L4 Blocked (403):
 *   { success: false, blocked: true, error }
 */
import { NextRequest } from "next/server";
import { buildWorkspaceContext } from "@/lib/workspace";
import { rateLimit } from "@/lib/rate-limit";
import { dispatchChatTask, ChatDispatchError } from "@/lib/server/chat-task-dispatch";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // 限流保护
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimit(ip, 30, 60_000)) {
    return Response.json(
      { success: false, error: "请求过于频繁，请稍后重试" },
      { status: 429 },
    );
  }

  // 解析请求体
  let body: { input?: string; confirmed?: boolean };
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { success: false, error: "请求体格式错误，需要 JSON" },
      { status: 400 },
    );
  }

  if (!body.input?.trim()) {
    return Response.json(
      { success: false, error: "input 不能为空" },
      { status: 400 },
    );
  }

  // 构建 workspace 上下文
  let ctx;
  try {
    ctx = await buildWorkspaceContext(req);
  } catch (err) {
    console.error("[POST /api/tasks/dispatch] buildWorkspaceContext 失败:", err);
    return Response.json(
      { success: false, error: "无法获取工作区上下文" },
      { status: 500 },
    );
  }

  try {
    const result = await dispatchChatTask(
      body.input.trim(),
      {
        workspaceId: ctx.workspaceId,
        industryId: ctx.industryId || "foreign-trade",
        userId: ctx.userId,
      },
      { confirmed: body.confirmed },
    );

    return Response.json({
      success: true,
      data: result,
    });
  } catch (err) {
    if (err instanceof ChatDispatchError) {
      // L3: 需确认
      if (err.requiresConfirmation) {
        return Response.json(
          {
            success: false,
            requiresConfirmation: true,
            error: err.message,
            riskLevel: err.riskLevel,
            automationLevel: err.automationLevel,
          },
          { status: 409 },
        );
      }
      // L4: 硬拒绝
      if (err.httpStatus === 403) {
        return Response.json(
          {
            success: false,
            blocked: true,
            error: err.message,
            riskLevel: err.riskLevel,
            automationLevel: err.automationLevel,
          },
          { status: 403 },
        );
      }
      return Response.json(
        { success: false, error: err.message },
        { status: err.httpStatus },
      );
    }

    console.error("[POST /api/tasks/dispatch] 未预期错误:", err);
    return Response.json(
      { success: false, error: "服务器内部错误" },
      { status: 500 },
    );
  }
}
