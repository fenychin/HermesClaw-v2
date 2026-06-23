/**
 * Tavily Web Search Adapter — 全网真实数据采集
 *
 * 三域原则第二域（OpenClaw Execution Runtime）：
 * - 仅做外部 HTTP 客户端封装与基础错误归一化
 * - 不做策略决策、不做 LLM 推理（属于 Hermes / Industry Pack 职责）
 * - 失败时按 classifyTavilyError 归一化错误，调用方决定降级路径
 *
 * Tavily API 文档：https://docs.tavily.com/documentation/api-reference/endpoint/search
 * 认证：API key 通过请求体 `api_key` 字段传递（不是 Header）。
 * 免费额度：约 1000 次/月（推荐用 advanced 模式做行业情报扫描）。
 *
 * 内置基础设施（v3.42.05-dev）：
 * - 5min TTL 内存缓存：同 query+options 在窗口内零调用
 * - 并发上限：全局 3 个 in-flight 请求，防止瞬间打爆 quota / 触发限流
 * - 缓存命中统计：可通过 getCacheStats() 查看节省的 quota
 */

const TAVILY_SEARCH_URL = 'https://api.tavily.com/search'
const CACHE_TTL_MS = 5 * 60 * 1000  // 5 分钟
const CACHE_MAX_ENTRIES = 200       // 缓存超过此值时清理 LRU
const CONCURRENCY_LIMIT = 3         // 同时 in-flight 最大请求数

// ─── 类型 ───────────────────────────────────────────────────────────────

export interface TavilySearchOptions {
  /** 搜索关键词（必填，建议中英文混合） */
  query: string
  /** 搜索深度 — basic（更快）/ advanced（更准，token 多） */
  searchDepth?: 'basic' | 'advanced'
  /** 主题 — general（通用）/ news（仅新闻，可配合 days 过滤） */
  topic?: 'general' | 'news'
  /** topic=news 时按近 N 天过滤，默认 7 */
  days?: number
  /** 返回结果数量上限，1-20，默认 5 */
  maxResults?: number
  /** 是否让 Tavily 自带 LLM 生成摘要（true 时响应里有 answer 字段） */
  includeAnswer?: boolean
  /** 是否返回页面原始内容（更大体积） */
  includeRawContent?: boolean
  /** 仅包含这些域名 */
  includeDomains?: string[]
  /** 排除这些域名 */
  excludeDomains?: string[]
  /** 超时 ms，默认 15s */
  timeoutMs?: number
}

export interface TavilySearchResultItem {
  title: string
  url: string
  /** 抓取并精简后的页面摘要 */
  content: string
  /** 0-1 相关性分数 */
  score: number
  /** 新闻类结果会带发布日期 */
  publishedDate?: string
  /** include_raw_content=true 时存在 */
  rawContent?: string
}

export interface TavilySearchResult {
  query: string
  /** Tavily 自带 LLM 给出的一句话总览（include_answer=true 时） */
  answer?: string
  results: TavilySearchResultItem[]
  /** 上游响应耗时（秒） */
  responseTime: number
  /** 标记是否命中缓存（供调用方诊断） */
  cached?: boolean
}

export interface TavilyErrorInfo {
  /** 归一化后的 HTTP 状态码（供调用方决定降级路径） */
  status: number
  /** 友好错误消息 */
  message: string
  /** 错误分类 */
  kind: 'auth' | 'quota' | 'rate-limit' | 'upstream' | 'network' | 'timeout' | 'unknown'
}

// ─── 缓存层 ─────────────────────────────────────────────────────────────

interface CacheEntry {
  result: TavilySearchResult
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()
let cacheHits = 0
let cacheMisses = 0
let cacheEvictions = 0

function cacheKey(options: TavilySearchOptions): string {
  // 排除 timeoutMs（不影响结果），其余作为缓存维度
  return JSON.stringify({
    q: options.query.trim().toLowerCase(),
    d: options.searchDepth ?? 'basic',
    t: options.topic ?? 'general',
    days: options.topic === 'news' ? options.days ?? 7 : 0,
    n: options.maxResults ?? 5,
    a: options.includeAnswer ?? false,
    rc: options.includeRawContent ?? false,
    inc: options.includeDomains?.slice().sort().join(',') ?? '',
    exc: options.excludeDomains?.slice().sort().join(',') ?? '',
  })
}

function cacheGet(key: string): TavilySearchResult | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    cache.delete(key)
    return null
  }
  // LRU touch
  cache.delete(key)
  cache.set(key, entry)
  cacheHits++
  return { ...entry.result, cached: true }
}

function cachePut(key: string, result: TavilySearchResult): void {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    // 清理最旧的 1/4 条目
    const targetSize = Math.floor(CACHE_MAX_ENTRIES * 0.75)
    const toEvict = cache.size - targetSize
    let evicted = 0
    for (const k of cache.keys()) {
      if (evicted >= toEvict) break
      cache.delete(k)
      evicted++
    }
    cacheEvictions += evicted
  }
  cache.set(key, {
    result,
    expiresAt: Date.now() + CACHE_TTL_MS,
  })
  cacheMisses++
}

export function clearTavilyCache(): void {
  cache.clear()
  cacheHits = 0
  cacheMisses = 0
  cacheEvictions = 0
}

export function getTavilyCacheStats(): {
  size: number
  hits: number
  misses: number
  evictions: number
  hitRate: number
} {
  const total = cacheHits + cacheMisses
  return {
    size: cache.size,
    hits: cacheHits,
    misses: cacheMisses,
    evictions: cacheEvictions,
    hitRate: total > 0 ? cacheHits / total : 0,
  }
}

// ─── 并发限流（信号量） ────────────────────────────────────────────────

let inFlight = 0
const waitQueue: Array<() => void> = []

async function acquireSlot(): Promise<void> {
  if (inFlight < CONCURRENCY_LIMIT) {
    inFlight++
    return
  }
  await new Promise<void>((resolve) => waitQueue.push(resolve))
  inFlight++
}

function releaseSlot(): void {
  inFlight--
  const next = waitQueue.shift()
  if (next) next()
}

// ─── 错误归一化 ─────────────────────────────────────────────────────────

export function classifyTavilyError(httpStatus: number, body?: string): TavilyErrorInfo {
  if (httpStatus === 401 || httpStatus === 403) {
    return {
      status: 503,
      message: 'Tavily API Key 无效或权限不足',
      kind: 'auth',
    }
  }
  if (httpStatus === 432 || (body && body.toLowerCase().includes('quota'))) {
    return {
      status: 503,
      message: 'Tavily 配额已耗尽',
      kind: 'quota',
    }
  }
  if (httpStatus === 429) {
    return {
      status: 429,
      message: 'Tavily 限流，请稍后重试',
      kind: 'rate-limit',
    }
  }
  if (httpStatus >= 500) {
    return {
      status: 503,
      message: 'Tavily 上游服务故障',
      kind: 'upstream',
    }
  }
  return {
    status: 502,
    message: `Tavily 请求失败 (${httpStatus})`,
    kind: 'unknown',
  }
}

// ─── 主调用函数 ─────────────────────────────────────────────────────────

/**
 * 是否配置了 Tavily API Key（调用方在调用前应自行判断，避免无意义请求）。
 */
export function isTavilyAvailable(): boolean {
  return Boolean(process.env.TAVILY_API_KEY?.trim())
}

/**
 * 调用 Tavily Search API 获取全网真实搜索结果。
 *
 * - 5min TTL 缓存：相同 query+options 在窗口内直接返回缓存结果
 * - 全局并发限制：最多 3 个 in-flight 请求，超过则排队等待
 *
 * @throws 当 API Key 未配置 或 上游失败时抛出 Error，附带 classified 字段
 */
export async function searchWeb(options: TavilySearchOptions): Promise<TavilySearchResult> {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) {
    throw new Error('TAVILY_API_KEY 未配置')
  }

  if (!options.query || options.query.trim().length === 0) {
    throw new Error('Tavily query 不能为空')
  }

  // ─── 缓存检查 ────────────────────────────────────────────────────────
  const key = cacheKey(options)
  const cached = cacheGet(key)
  if (cached) return cached

  // ─── 并发限流 ────────────────────────────────────────────────────────
  await acquireSlot()
  try {
    const result = await doSearch(options, apiKey)
    cachePut(key, result)
    return result
  } finally {
    releaseSlot()
  }
}

async function doSearch(
  options: TavilySearchOptions,
  apiKey: string,
): Promise<TavilySearchResult> {
  const {
    query,
    searchDepth = 'basic',
    topic = 'general',
    days = 7,
    maxResults = 5,
    includeAnswer = false,
    includeRawContent = false,
    includeDomains,
    excludeDomains,
    timeoutMs = 15_000,
  } = options

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const body: Record<string, unknown> = {
      api_key: apiKey,
      query: query.trim(),
      search_depth: searchDepth,
      topic,
      max_results: Math.max(1, Math.min(20, maxResults)),
      include_answer: includeAnswer,
      include_raw_content: includeRawContent,
    }
    if (topic === 'news') body.days = Math.max(1, Math.min(30, days))
    if (includeDomains && includeDomains.length > 0) body.include_domains = includeDomains
    if (excludeDomains && excludeDomains.length > 0) body.exclude_domains = excludeDomains

    const res = await fetch(TAVILY_SEARCH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      const classified = classifyTavilyError(res.status, errBody)
      throw Object.assign(
        new Error(`${classified.message} (${res.status}): ${errBody.slice(0, 200)}`),
        { upstreamStatus: res.status, classified },
      )
    }

    const data = (await res.json()) as {
      query: string
      answer?: string
      results?: Array<{
        title: string
        url: string
        content: string
        score: number
        published_date?: string
        raw_content?: string
      }>
      response_time?: number
    }

    return {
      query: data.query ?? query,
      answer: data.answer,
      results: (data.results ?? []).map((r) => ({
        title: r.title,
        url: r.url,
        content: r.content,
        score: r.score,
        publishedDate: r.published_date,
        rawContent: r.raw_content,
      })),
      responseTime: data.response_time ?? 0,
      cached: false,
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw Object.assign(new Error(`Tavily 请求超时 (>${timeoutMs}ms)`), {
        classified: { status: 504, message: '搜索超时', kind: 'timeout' as const },
      })
    }
    if (err instanceof Error && (err as { classified?: unknown }).classified) {
      throw err
    }
    throw Object.assign(
      new Error(`Tavily 网络错误: ${err instanceof Error ? err.message : String(err)}`),
      { classified: { status: 503, message: '搜索服务不可达', kind: 'network' as const } },
    )
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * 批量并发搜索（每个 query 独立调用，失败的项返回 null 不影响其他）。
 * 注意：并发上限由 searchWeb 内部信号量控制（CONCURRENCY_LIMIT=3）。
 * 用于 A1 政策扫描场景：一次性扫描多个关键词。
 */
export async function searchWebBatch(
  queries: string[],
  options?: Omit<TavilySearchOptions, 'query'>,
): Promise<Array<TavilySearchResult | null>> {
  if (!isTavilyAvailable()) {
    return queries.map(() => null)
  }
  return Promise.all(
    queries.map((q) =>
      searchWeb({ ...options, query: q }).catch(() => null),
    ),
  )
}
