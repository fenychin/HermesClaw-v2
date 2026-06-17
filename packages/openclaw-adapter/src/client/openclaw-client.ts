// 从主应用 api-client.ts 迁移的连接器管理函数
// 重新设计为适配器包内的纯 HTTP 客户端，不依赖 Next.js API 路由

interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

/**
 * 可注入的 fetch 函数类型（用于不同环境的适配）
 */
let injectedFetch: typeof globalThis.fetch | null = null
let injectedBaseUrl: string | null = null

/**
 * 配置连接器 API 的基础 URL 和 fetch 实现。
 * 调用方（如主应用）须在初始化时调用。
 */
export function configureConnectorClient(config: {
  baseUrl: string
  fetch?: typeof globalThis.fetch
}): void {
  injectedBaseUrl = config.baseUrl.replace(/\/$/, '')
  injectedFetch = config.fetch ?? null
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const fetchImpl = injectedFetch ?? globalThis.fetch
  const baseUrl = injectedBaseUrl ?? ''

  const url = path.startsWith('http') ? path : `${baseUrl}${path}`

  const res = await fetchImpl(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })

  const json: ApiResponse<T> = await res.json().catch(() => ({
    success: false,
    error: '响应解析失败',
  }))

  if (!res.ok || !json.success) {
    throw new Error(json.error ?? `HTTP ${res.status}`)
  }

  return json.data as T
}

/**
 * 获取连接器列表
 */
export async function getConnectors(): Promise<{ connectors: any[] }> {
  return apiFetch<{ connectors: any[] }>('/api/connectors')
}

/**
 * 更新连接器配置
 */
export async function updateConnector(
  id: string,
  data: Record<string, unknown>,
): Promise<{ connector: any }> {
  return apiFetch<{ connector: any }>(`/api/connectors/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}
