/**
 * Hermes Prompt 组装器 —— 独立纯函数
 *
 * 遵循 Hermes 定义的 Prompt 组装规则：
 *   系统角色注入 → 上下文策略应用 → 记忆条目注入 → 工具清单注入。
 *
 * 本文件为纯函数，不依赖任何外部状态或网络请求。
 * 可在 HermesClient 类内委托调用，也可在无副作用的上下文中独立使用和测试。
 *
 * 🔄 P2 整改（问题5.2）：从 HermesClient 类中提取，消除对 HTTP 客户端类的非必要依赖。
 */

import type {
  HermesPromptAssemblyRequest,
  HermesAssembledPrompt,
} from "./types"

/**
 * 组装 Hermes Agent 完整 Prompt（系统 prompt + 用户 prompt + 工具清单）。
 *
 * @example
 *   const prompt = assembleHermesPrompt({
 *     intent: "帮我生成一份德国客户的报价单",
 *     conversationHistory: [{ role: "user", content: "上次..." }],
 *     contextPolicy: { maxConversationTurns: 10, includeProjectContext: true, includeOrgContext: false, toolCallMaxDepth: 3 },
 *     memoryEntries: [{ key: "client_de", value: { name: "ACME GmbH" }, level: "long", writtenAt: "2026-06-01", confidence: 0.9 }],
 *     availableTools: [{ name: "quote_generator", description: "生成报价单", input_schema: {}, automationLevel: "L2" }],
 *     maxAutomationLevel: "L3",
 *   })
 */
export function assembleHermesPrompt(
  req: HermesPromptAssemblyRequest,
): HermesAssembledPrompt {
  // 系统 Prompt：注入自动化等级约束
  const levelNote = req.maxAutomationLevel
    ? `\n当前自动化授权上限：${req.maxAutomationLevel}。不得执行超出此等级的自动化动作。`
    : ""
  const system = `你是 HermesClaw-v2 的智能体，负责执行用户指派的工作流与任务。${levelNote}`

  // 用户 Prompt：意图 + 上下文策略 + 记忆
  const contextParts: string[] = [req.intent]

  if (req.conversationHistory && req.conversationHistory.length > 0) {
    const history = req.conversationHistory
      .slice(-(req.contextPolicy?.maxConversationTurns ?? 10))
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n")
    contextParts.push(`\n--- 会话历史 ---\n${history}`)
  }

  if (req.contextPolicy?.includeProjectContext && req.memoryEntries) {
    const projectMemories = req.memoryEntries
      .filter((m) => m.level === "mid" || m.level === "long")
      .map((m) => `[${m.key}]: ${JSON.stringify(m.value)}`)
      .join("\n")
    if (projectMemories) {
      contextParts.push(`\n--- 项目上下文 ---\n${projectMemories}`)
    }
  }

  if (req.contextPolicy?.includeOrgContext && req.memoryEntries) {
    const orgMemories = req.memoryEntries
      .filter((m) => m.level === "long")
      .map((m) => `[${m.key}]: ${JSON.stringify(m.value)}`)
      .join("\n")
    if (orgMemories) {
      contextParts.push(`\n--- 组织上下文 ---\n${orgMemories}`)
    }
  }

  return {
    system,
    user: contextParts.join("\n"),
    tools: req.availableTools ?? [],
  }
}
