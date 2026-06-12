/**
 * 智能体共享序列化工具
 * —— 将数据库 JSON 字符串字段反序列化为对象/数组，供所有 Agent API 路由复用。
 *
 * 消除 route.ts 与 [id]/route.ts 中的重复 serializeAgent 定义。
 */
import { parseJsonField } from "@/lib/api-utils"

/**
 * 序列化 Agent 数据库记录：将 category / bindSkills / bindConnectors / canDo / cannotDo / statsJson
 * 六个 JSON 字符串字段反序列化为对应的 TS 类型。
 *
 * 注意：statsJson（数据库字段名）映射为 stats（前端 Agent 类型字段名），
 * 同时保留 statsJson 以保证列表页等已使用 statsJson 的地方不中断。
 */
export function serializeAgent(agent: Record<string, unknown>) {
  const stats = parseJsonField(agent.statsJson as string, {})
  return {
    ...agent,
    category: parseJsonField(agent.category as string, []),
    bindSkills: parseJsonField(agent.bindSkills as string, []),
    bindConnectors: parseJsonField(agent.bindConnectors as string, []),
    canDo: parseJsonField(agent.canDo as string, []),
    cannotDo: parseJsonField(agent.cannotDo as string, []),
    statsJson: stats,
    stats,
  }
}
