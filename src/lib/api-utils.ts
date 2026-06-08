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

/** 统一错误响应 */
export function errorResponse(message: string, status = 500) {
  return Response.json({ success: false, error: message }, { status })
}
