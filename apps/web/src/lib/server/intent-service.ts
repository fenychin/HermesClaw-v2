import crypto from "crypto"
import { TaskEnvelopeSchema, type TaskEnvelope } from "@hermesclaw/event-contracts"
import type { AutomationLevel, RiskLevel } from "@hermesclaw/event-contracts"
import { selectModel, type RouteRiskLevel } from "@/lib/server/model-router"
import { callAnthropicStructured, callDeepSeekJson } from "@/lib/server/llm-provider"
import { writeAuditLog } from "@/lib/server/audit"
import type { AuditRiskLevel } from "@/types"
import { actorFromSession } from "@/lib/server/audit"
import { GuardrailError } from "@/lib/server/exceptions"
import { withTraceStep } from "./reasoning-trace"
import type { ReasoningTrace } from "@hermesclaw/event-contracts"

const INTENT_EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    actionType: { 
      type: "string", 
      description: "提取的动作类型，必须是非空字符串，表示该任务要执行的动作，例如 email.send, database.query, wechat.send" 
    },
    input: { 
      type: "object", 
      description: "执行该动作所需的参数键值对，包含任务所需的具体参数" 
    },
    callbackTarget: { 
      type: "string", 
      description: "回调的目标标识，如果用户未指定，默认输出 workflow-callback" 
    }
  },
  required: ["actionType", "input"],
  additionalProperties: false
} as const;

const SYSTEM_PROMPT = `你是一个意图解析器，负责将用户的自然语言意图解析为结构化的任务参数。
你需要提取以下字段：
1. actionType: 任务要执行的具体动作，必须是一个简短明确的标识符，如 email.send, inquiry.analyze。
2. input: 动作所需的详细参数键值对，需根据用户输入的自然语言提取。例如，如果是发送邮件，需包含 to, subject, content 等字段。
3. callbackTarget: 回调的目标。如果未指明，请默认使用 "workflow-callback"。`;

/**
 * 将用户自然语言意图解析为 TaskEnvelope
 * 
 * 遵守 AGENTS.md §2.1、§3.1 和 CLAUDE.md §4.1。
 */
export async function parseIntentToTaskEnvelope(
  input: string,
  context: {
    workspaceId: string;
    agentId: string;
    industryId: string;
    automationLevel: AutomationLevel;
    riskLevel: RiskLevel;
  },
  trace?: ReasoningTrace
): Promise<TaskEnvelope> {
  return withTraceStep(
    trace,
    {
      type: 'intent.parse',
      label: '理解您的指令',
      inputs: { userInput: input, agentId: context.agentId },
    },
    async (step) => {
      // 1. 安全护栏：L4 自动化等级绝对禁止自动执行，审批通道亦不得放行
      if (context.automationLevel === "L4") {
        throw new GuardrailError("L4 动作绝对禁止系统自动审批与执行");
      }

      // 2. 模型路由决策
      // 将 RiskLevel ("low" | "medium" | "high" | "critical") 转换为 RouteRiskLevel ("low" | "medium" | "high")
      const routeRiskLevel: RouteRiskLevel =
        context.riskLevel === "critical" ? "high" : (context.riskLevel as RouteRiskLevel);

      const decision = await selectModel({
        taskType: "workflow",
        riskLevel: routeRiskLevel,
        estimatedTokens: 1000,
        workspaceId: context.workspaceId,
      });

      // 3. 调用 LLM 获取结构化输出
      let parsedResult: { actionType: string; input: Record<string, unknown>; callbackTarget?: string };

      if (decision.provider === "anthropic") {
        const raw = await callAnthropicStructured({
          systemPrompt: SYSTEM_PROMPT,
          userPrompt: input,
          schema: INTENT_EXTRACT_SCHEMA as Record<string, unknown>,
          model: decision.model,
          thinking: false,
        });
        parsedResult = raw as typeof parsedResult;
      } else {
        const raw = await callDeepSeekJson({
          systemPrompt: `${SYSTEM_PROMPT}
只输出一个符合以下 JSON 结构的 JSON 对象，不要包含任何额外文字或 Markdown 标记包裹：
{
  "actionType": "动作类型",
  "input": {},
  "callbackTarget": "回调目标"
}`,
          userPrompt: input,
          model: decision.model,
        });
        parsedResult = raw as typeof parsedResult;
      }

      // 校验模型解析结果的基本完整性
      if (!parsedResult || !parsedResult.actionType || !parsedResult.input) {
        throw new Error("模型意图解析失败，无法解析出 actionType 或 input。");
      }

      // 4. 组装并生成唯一 Key
      const taskId = crypto.randomUUID();
      const workflowRunId = crypto.randomUUID();
      const idempotencyKey = crypto.randomUUID();

      const taskEnvelopeData = {
        taskId,
        workflowRunId,
        workspaceId: context.workspaceId,
        industryId: context.industryId,
        agentId: context.agentId,
        actionType: parsedResult.actionType,
        input: parsedResult.input,
        automationLevel: context.automationLevel,
        riskLevel: context.riskLevel,
        idempotencyKey,
        callbackTarget: parsedResult.callbackTarget || "workflow-callback",
        policySnapshotVersion: "1.0.0",
        version: "1.0.0",
      };

      // 5. 写入 AuditLog
      const actor = await actorFromSession();
      const auditRiskLevel: AuditRiskLevel =
        context.riskLevel === "critical" ? "high" : (context.riskLevel as AuditRiskLevel);

      await writeAuditLog({
        actor,
        action: "workflow.generate",
        targetType: "task",
        targetId: taskId,
        detail: `用户意图解析成功: "${input}" -> 动作: "${taskEnvelopeData.actionType}"`,
        riskLevel: auditRiskLevel,
        workspaceId: context.workspaceId,
        workflowRunId: workflowRunId,
      });

      step._pendingUpdate = {
        outputs: {
          actionType: parsedResult.actionType,
          input: parsedResult.input,
        },
        reasoning: `使用 ${decision.model}（${decision.provider}）将用户指令解析为动作「${parsedResult.actionType}」`,
        modelUsed: decision.model,
      }

      // 6. Zod 强校验确保绝对合规，校验失败将抛出 ZodError，杜绝绕过
      return TaskEnvelopeSchema.parse(taskEnvelopeData);
    }
  );
}
