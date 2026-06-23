/**
 * POST /api/v1/sandbox/submit
 *
 * 沙盘推演提交 —— Hermes 侧写接口。
 * 生成 TaskEnvelope → OpenClaw 执行 → 回传 run.completed。
 * automationLevel 硬锁 L1，前端不可修改。
 */
import { NextRequest } from "next/server"
import { buildWorkspaceContext } from "@/lib/workspace"
import { submitSandbox } from "@/lib/server/industry-intel-service"
import { SandboxScenarioRequestSchema } from "@hermesclaw/event-contracts"
import { ApiResponse } from "@/lib/server/api-response"
import { actorFromSession } from "@/lib/server/audit"
import { logger } from "@/lib/logger"

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const ctx = await buildWorkspaceContext(req)
    const actor = await actorFromSession()

    const raw = await req.json().catch(() => null)
    if (!raw || typeof raw !== "object") {
      return ApiResponse.apiError("请求体必须为 JSON", 400, "INVALID_JSON")
    }

    // 将前端 SandboxSubmitInput 映射为合约 SandboxScenarioRequest
    const requestId = `sandbox-req-${Date.now()}`
    const contractInput = {
      requestId,
      workspaceId: ctx.workspaceId,
      industryId: raw.packId ?? "industry-intelligence-v2",
      automationLevel: "L1" as const,
      scenarioInput: {
        scenario: raw.scenario ?? "",
        hypothesis: raw.hypothesis ?? "",
        timeHorizon: raw.timeHorizon ?? "30d",
      },
      hypothesisLabel: (raw.hypothesis ?? raw.scenario ?? "").slice(0, 100),
      callbackTarget: `sandbox-result-${requestId}`,
      idempotencyKey: raw._idempotencyKey ?? requestId,
      version: "1.0.0",
    }

    const parsed = SandboxScenarioRequestSchema.safeParse(contractInput)
    if (!parsed.success) {
      return ApiResponse.apiError(
        `校验失败: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
        400,
        "VALIDATION_ERROR",
      )
    }

    const result = await submitSandbox({ body: parsed.data, actor })

    return ApiResponse.ok(result)
  } catch (error) {
    logger.error("[sandbox/submit] 提交失败", {
      error: error instanceof Error ? error.message : String(error),
    })
    return ApiResponse.apiError("沙盘推演提交失败", 500, "SANDBOX_SUBMIT_ERROR")
  }
}
