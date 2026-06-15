/**
 * 内部回调 Token 校验工具（D2 修复：原逻辑在 dispatch、evaluate-event 两处重复）
 *
 * 使用模式：
 *   - 生产环境：环境变量 INTERNAL_TASK_CALLBACK_TOKEN 必配；请求必须带
 *     x-internal-token 头且值相等，否则 401。
 *   - 开发/CI：未配 token 时直接放行（不等于免认证 —— route handler 内的
 *     production 守卫仍然拦截 NODE_ENV === "production"）。
 *
 * 设计要点：
 *   - 仅校验 token，不涉及 RBAC / workspace 上下文。
 *   - 是 dispatch 与 evaluate-event 两个 M2M 端点的共享入口。
 */

export interface InternalAuthResult {
  ok: true
  token: string | null
}

export interface InternalAuthFailure {
  ok: false
  reason: string
  status: number
}

/**
 * 校验 x-internal-token 请求头。
 *
 * @param headers  request.headers（仅取 .get()）
 * @param opts.productionGuard 若 true 且 token 未配 → 校验失败（默认 true）
 *
 * @returns ok=true 的 token 可能为 null（dev 未配 token 场景）
 */
export function checkInternalToken(
  headers: { get(name: string): string | null },
  opts: { productionGuard?: boolean } = {},
): InternalAuthResult | InternalAuthFailure {
  const { productionGuard = true } = opts
  const expected = process.env.INTERNAL_TASK_CALLBACK_TOKEN

  if (!expected) {
    if (productionGuard && process.env.NODE_ENV === "production") {
      return { ok: false, reason: "INTERNAL_TOKEN_NOT_CONFIGURED", status: 401 }
    }
    return { ok: true, token: null }
  }

  const provided = headers.get("x-internal-token")
  if (provided !== expected) {
    return { ok: false, reason: "INVALID_INTERNAL_TOKEN", status: 401 }
  }

  return { ok: true, token: expected }
}

/**
 * 为 outgoing fetch 构造 x-internal-token 头（如果环境变量已配）。
 * 用于 OpenClaw events → Harness evaluate-event 等 M2M 外呼场景。
 */
export function buildInternalCallbackHeaders(): Partial<Record<string, string>> {
  const token = process.env.INTERNAL_TASK_CALLBACK_TOKEN
  return token ? { "x-internal-token": token } : {}
}

/**
 * 校验 x-internal-token 并直接返回 Response 错误体（便捷 wrapper）。
 * 校验通过时返回 headers（可展开到 outgoing fetch 请求头）。
 *
 * @example
 *   const auth = withInternalAuth(request)
 *   if (!auth.ok) return Response.json({ error: auth.reason }, { status: auth.status })
 */
export function withInternalAuth(
  headers: { get(name: string): string | null },
  opts?: { productionGuard?: boolean },
): InternalAuthFailure | (InternalAuthResult & { headers: Record<string, string> }) {
  const result = checkInternalToken(headers, opts)
  if (!result.ok) return result

  return {
    ...result,
    headers: result.token ? { "x-internal-token": result.token } : {},
  }
}
