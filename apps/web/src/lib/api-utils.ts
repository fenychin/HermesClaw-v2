/**
 * API Route Handler 通用工具函数
 * —— 提供 JSON 字段序列化/反序列化、统一响应格式、错误处理
 */

/**
 * 安全解析数据库中的 JSON 字符串字段，失败时返回 fallback
 */
export function parseJsonField<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

/**
 * 将任意值序列化为 JSON 字符串，用于写入数据库 JSON 字段
 */
export function stringifyJsonField(value: unknown): string {
  return JSON.stringify(value ?? [])
}

/** 统一成功响应 */
export function successResponse(data: unknown, status = 200) {
  return Response.json({ success: true, data }, { status })
}

/**
 * 将记录中的 Date 字段统一转为 ISO 字符串
 * —— 消除各 API 路由中重复的 serialize* 样板
 * @param record  数据库查询结果（含 Date 字段）
 * @param dateKeys 需要序列化的 Date 字段名列表
 */
export function serializeDates<T extends Record<string, unknown>>(
  record: T,
  dateKeys: string[],
): T {
  const result = { ...record }
  for (const key of dateKeys) {
    const val = result[key]
    if (val instanceof Date) {
      ;(result as Record<string, unknown>)[key] = val.toISOString()
    }
  }
  return result
}

/**
 * 工作流共享序列化 —— 将 DB 中的 JSON 字符串 nodes/edges 解析为结构化对象，
 * 同时过滤内部字段（workspaceId），仅暴露安全字段给前端。
 *
 * 消除 route.ts 与 [id]/route.ts 中的重复解析逻辑。
 *
 * @param wf  — Prisma Workflow 查询结果（含 nodes / edges 字符串或已解析对象）
 * @param extraFields — 额外需透传的字段名列表（默认不含 workspaceId）
 */
export function serializeWorkflow<
  T extends { nodes: string | object; edges: string | object } & Record<string, unknown>,
>(wf: T, extraFields: string[] = []): Omit<T, 'nodes' | 'edges'> & { nodes: unknown; edges: unknown } {
  const nodes = typeof wf.nodes === 'string' ? parseJsonField(wf.nodes, []) : wf.nodes
  const edges = typeof wf.edges === 'string' ? parseJsonField(wf.edges, []) : wf.edges

  // 白名单：仅保留安全字段（排除 workspaceId 等内部字段）
  const safeKeys = new Set(['id', 'name', 'description', 'status', 'nodes', 'edges', 'createdAt', 'updatedAt', ...extraFields])
  const result: Record<string, unknown> = { nodes, edges }
  for (const key of Object.keys(wf)) {
    if (safeKeys.has(key)) {
      result[key] = wf[key]
    }
  }
  return result as Omit<T, 'nodes' | 'edges'> & { nodes: unknown; edges: unknown }
}

/**
 * 项目共享序列化 —— 将 DB 中的 JSON 字符串字段反序列化。
 * 消除 projects/route.ts 与 projects/[id]/route.ts 中的重复定义。
 */
export function serializeProject(project: Record<string, unknown>) {
  return {
    ...project,
    activeAgents: parseJsonField(project.activeAgents as string, []),
    riskPoints: parseJsonField(project.riskPoints as string, []),
    nextActions: parseJsonField(project.nextActions as string, []),
    tags: parseJsonField(project.tags as string, []),
  }
}

import type { Connector, Memory, Skill } from "@/types"

/**
 * 记忆共享序列化 —— 将 DB 中的 JSON 字符串 tags 反序列化。
 * 消除 memory/route.ts、memory/[id]/route.ts、projects/[id]/memory/route.ts 中的重复定义。
 */
export function serializeMemory(m: Record<string, unknown>): Memory {
  const serialized = serializeDates(m, ["createdAt", "updatedAt"])
  return {
    ...serialized,
    tags: parseJsonField(serialized.tags as string, []),
  } as unknown as Memory
}

/** 序列化 Connector，将 JSON 字符串字段反序列化 */
export function serializeConnector(connector: Record<string, unknown>): Connector {
  const serialized = serializeDates(connector, ["createdAt", "updatedAt"])
  return {
    ...serialized,
    source: (serialized.source as Connector["source"]) || "custom",
    permissions: parseJsonField(serialized.permissions as string, []),
    usedByAgents: parseJsonField(serialized.usedByAgents as string, []),
  } as unknown as Connector
}

/** 序列化 DB 中的 Skill 实体 */
export function serializeSkill(skill: Record<string, unknown>): Skill {
  const serialized = serializeDates(skill, ["createdAt", "updatedAt"])
  return {
    ...serialized,
    usedByAgents: parseJsonField(serialized.usedByAgents as string, []),
    scenarios: parseJsonField(serialized.scenarios as string, []),
  } as unknown as Skill
}

/** 统一错误响应（支持附加 data 负载，如 approval 引导） */
export function errorResponse(message: string, status = 500, data?: Record<string, unknown>) {
  return Response.json({ success: false, error: message, ...(data ? { data } : {}) }, { status })
}
