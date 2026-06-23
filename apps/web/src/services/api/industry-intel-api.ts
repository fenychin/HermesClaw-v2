/**
 * Industry Intelligence Center — API Service Adapter
 *
 * 三域原则：所有 API 调用统一走此 adapter，组件不得直接 fetch。
 * Adapter 只做请求/响应映射，不做业务逻辑判断。
 */
import type {
  IndustryIntelSnapshot,
  ScenarioResult,
  SandboxSubmitInput,
  ConnectorHealthItem,
} from "@/types/industry-intel"

const BASE = "/api/v1"

// ─── REST API ──────────────────────────────────────────────────────────

/** 获取 KPI 快照（行业情报总览） */
export async function fetchKpiSnapshot(packId: string): Promise<IndustryIntelSnapshot> {
  const res = await fetch(`${BASE}/industry/kpi-snapshot?packId=${encodeURIComponent(packId)}`)
  if (!res.ok) throw new Error(`KPI snapshot 请求失败: ${res.status}`)
  const json = await res.json()
  if (!json.success) throw new Error(json.error ?? "未知错误")
  return json.data as IndustryIntelSnapshot
}

/** 获取知识图谱 */
export async function fetchKnowledgeGraph(packId: string): Promise<{
  nodes: Array<{ id: string; label: string; category: string; weight: number }>
  edges: Array<{ id: string; source: string; target: string; weight: number; relation: string }>
  generatedAt: string
}> {
  const res = await fetch(`${BASE}/industry/knowledge-graph?packId=${encodeURIComponent(packId)}`)
  if (!res.ok) throw new Error(`Knowledge graph 请求失败: ${res.status}`)
  const json = await res.json()
  if (!json.success) throw new Error(json.error ?? "未知错误")
  return json.data
}

/** 提交沙盘推演请求 */
export async function submitSandbox(
  request: SandboxSubmitInput,
): Promise<{ taskId: string }> {
  const res = await fetch(`${BASE}/sandbox/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  })
  if (!res.ok) throw new Error(`Sandbox submit 失败: ${res.status}`)
  const json = await res.json()
  if (!json.success) throw new Error(json.error ?? "未知错误")
  return json.data as { taskId: string }
}

/** 获取沙盘推演结果 */
export async function fetchScenarioResult(resultId: string): Promise<ScenarioResult> {
  const res = await fetch(`${BASE}/sandbox/scenario-results/${encodeURIComponent(resultId)}`)
  if (!res.ok) throw new Error(`Scenario result 请求失败: ${res.status}`)
  const json = await res.json()
  if (!json.success) throw new Error(json.error ?? "未知错误")
  return json.data as ScenarioResult
}

/** 获取连接器健康状态 */
export async function fetchConnectorHealth(): Promise<ConnectorHealthItem[]> {
  const res = await fetch(`${BASE}/runtime/connector-health`)
  if (!res.ok) throw new Error(`Connector health 请求失败: ${res.status}`)
  const json = await res.json()
  if (!json.success) throw new Error(json.error ?? "未知错误")
  return (json.data?.connectors ?? []) as ConnectorHealthItem[]
}

/** 获取进化提案列表 */
export async function fetchEvolutionProposals(params?: {
  status?: string
  limit?: number
}): Promise<{
  items: Array<{
    proposalId: string
    harnessProposalId?: string
    workspaceId: string
    triggeredBy: string
    triggerReason: string
    problemStatement: string
    evidence: string[]
    targetComponent: string
    targetObjectId: string
    targetObjectType: string
    riskLevel: string
    automationLevel: string
    requiresHumanApproval: boolean
    estimatedImpact: string
    rollbackPlan: string
    status: string
    reviewedBy: string | null
    reviewedAt: string | null
    implementedAt: string | null
    createdAt: string
    updatedAt: string
    version: string
  }>
  total: number
  limit: number
}> {
  const sp = new URLSearchParams()
  if (params?.status) sp.set("status", params.status)
  if (params?.limit) sp.set("limit", String(params.limit))
  const qs = sp.toString()
  const res = await fetch(`${BASE}/harness/evolution-proposals${qs ? `?${qs}` : ""}`)
  if (!res.ok) throw new Error(`Evolution proposals 请求失败: ${res.status}`)
  const json = await res.json()
  if (!json.success) throw new Error(json.error ?? "未知错误")
  return json.data
}

/** 获取评估报告 */
export async function fetchEvaluationReport(): Promise<{
  report: Record<string, unknown>
  pendingCount: number
  totalCount: number
  latestApproval: {
    id: string
    actor: string
    action: string
    createdAt: string
  } | null
}> {
  const res = await fetch(`${BASE}/harness/evaluation-report`)
  if (!res.ok) throw new Error(`Evaluation report 请求失败: ${res.status}`)
  const json = await res.json()
  if (!json.success) throw new Error(json.error ?? "未知错误")
  return json.data
}

/** 获取最近审批记录 */
export async function fetchLatestApproval(): Promise<{
  latestApproval: {
    id: string
    actor: string
    action: string
    targetType: string
    targetId: string
    detail: string | null
    createdAt: string
    status: string
  } | null
  proposal: {
    proposalId: string
    title: string
    status: string
    problemStatement: string
  } | null
}> {
  const res = await fetch(`${BASE}/audit/latest-approval`)
  if (!res.ok) throw new Error(`Latest approval 请求失败: ${res.status}`)
  const json = await res.json()
  if (!json.success) throw new Error(json.error ?? "未知错误")
  return json.data
}

// ─── SSE Stream ────────────────────────────────────────────────────────

/**
 * 订阅行业情报 SSE 事件流。
 * 返回 AbortController 用于取消订阅。
 *
 * 事件类型：
 * - intel.flow.tick
 * - intel.signal.detected
 * - intel.topology.updated
 * - intel.alert.tactical
 * - intel.evolution.proposal-created
 * - intel.agent.heartbeat
 */
export function subscribeIntelSSE(
  packId: string,
  handlers: {
    onFlowTick?: (event: unknown) => void
    onSignalDetected?: (event: unknown) => void
    onTopologyUpdated?: (event: unknown) => void
    onAlertTactical?: (event: unknown) => void
    onEvolutionProposal?: (event: unknown) => void
    onAgentHeartbeat?: (event: unknown) => void
    onError?: (error: Error) => void
    onConnect?: () => void
    onDisconnect?: () => void
  },
): AbortController {
  const controller = new AbortController()
  const url = `${BASE}/stream/industry-intel?packId=${encodeURIComponent(packId)}`

  void (async () => {
    try {
      const res = await fetch(url, { signal: controller.signal })
      if (!res.ok || !res.body) {
        handlers.onError?.(new Error(`SSE 连接失败: ${res.status}`))
        return
      }
      handlers.onConnect?.()

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue

          if (trimmed.startsWith("event: ")) {
            // SSE event type line — stored for next data line
            continue
          }

          if (trimmed.startsWith("data: ")) {
            const jsonStr = trimmed.slice(6)
            try {
              const parsed = JSON.parse(jsonStr)
              dispatchSSEEvent(parsed, handlers)
            } catch {
              // 跳过解析失败的帧
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return
      handlers.onError?.(err instanceof Error ? err : new Error(String(err)))
    } finally {
      handlers.onDisconnect?.()
    }
  })()

  return controller
}

/** 按 eventType 分发 SSE 事件到对应 handler */
function dispatchSSEEvent(
  event: Record<string, unknown>,
  handlers: Parameters<typeof subscribeIntelSSE>[1],
): void {
  const eventType = (event.eventType as string) ?? ""
  switch (eventType) {
    case "intel.flow.tick":
      handlers.onFlowTick?.(event)
      break
    case "intel.signal.detected":
      handlers.onSignalDetected?.(event)
      break
    case "intel.topology.updated":
      handlers.onTopologyUpdated?.(event)
      break
    case "intel.alert.tactical":
      handlers.onAlertTactical?.(event)
      break
    case "intel.evolution.proposal-created":
      handlers.onEvolutionProposal?.(event)
      break
    case "intel.agent.heartbeat":
      handlers.onAgentHeartbeat?.(event)
      break
  }
}
