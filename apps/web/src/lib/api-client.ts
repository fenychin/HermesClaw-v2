/**
 * 统一 API Client
 * —— 所有前端数据请求的单一入口，调用 Next.js Route Handler
 *
 * API 响应格式（来自 successResponse / errorResponse）：
 *   { success: true, data: { agents: [...], ... } }
 *   { success: false, error: "错误信息" }
 */

import type { HarnessStatus, HarnessEvaluateResult, HermesSuggestionsResult } from "@/types"
import { getConnectors, updateConnector } from "@hermesclaw/openclaw-adapter"

// ============================================================
// 基础 fetch 封装
// ============================================================

/** 通用 API 响应包装 */
interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  /** 高危操作护栏：为 true 时需二次确认后重试 */
  requiresConfirmation?: boolean
}

/** 携带「需二次确认」标记的错误，供调用方弹确认对话框 */
export class ConfirmationRequiredError extends Error {
  requiresConfirmation = true as const
  constructor(message: string) {
    super(message)
    this.name = "ConfirmationRequiredError"
  }
}

async function apiFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const isFormData = options?.body instanceof FormData
  const defaultHeaders = isFormData ? {} : { "Content-Type": "application/json" }

  const res = await fetch(path, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...(options?.headers || {}),
    } as any,
  })

  const json: ApiResponse<T> = await res.json().catch(() => ({
    success: false,
    error: "响应解析失败",
  }))

  if (!res.ok || !json.success) {
    // 409 + requiresConfirmation：抛专用错误，供 UI 触发二次确认
    if (res.status === 409 && json.requiresConfirmation) {
      throw new ConfirmationRequiredError(json.error || "需要二次确认")
    }
    const error = new Error(json.error || `HTTP ${res.status}`)
    ;(error as any).status = res.status
    throw error
  }

  return json.data as T
}

// ============================================================
// API 方法
// ============================================================

export const apiClient = {
  // ---- 智能体 ----
  getAgents: (params?: { skillId?: string }) => {
    const query = params?.skillId ? `?skillId=${encodeURIComponent(params.skillId)}` : ""
    return apiFetch<{ agents: unknown[] }>(`/api/agents${query}`)
  },

  getAgent: (id: string) =>
    apiFetch<{ agent: unknown }>(`/api/agents/${id}`),

  getAgentLogs: (id: string) =>
    apiFetch<{ logs: unknown[] }>(`/api/agents/${id}/logs`),

  createAgent: (data: Record<string, unknown>) =>
    apiFetch<{ agent: unknown }>("/api/agents", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateAgent: (id: string, data: Record<string, unknown>) =>
    apiFetch<{ agent: unknown }>(`/api/agents/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  deleteAgent: (id: string, confirm = false) =>
    apiFetch<{ message: string }>(
      `/api/agents/${id}?confirm=${confirm}`,
      { method: "DELETE" },
    ),

  // ---- 项目空间 ----
  getProjects: () =>
    apiFetch<{ projects: unknown[] }>("/api/projects"),

  getProject: (id: string) =>
    apiFetch<{
      project: any
      memories?: any[]
      workflowRuns?: any[]
    }>(`/api/projects/${id}`),

  createProject: (data: Record<string, unknown>) =>
    apiFetch<{ project: unknown }>("/api/projects", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateProject: (id: string, data: Record<string, unknown>) =>
    apiFetch<{ project: unknown }>(`/api/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  deleteProject: (id: string, confirm = false) =>
    apiFetch<{ message: string }>(
      `/api/projects/${id}?confirm=${confirm}`,
      { method: "DELETE" },
    ),

  // ---- 记忆 ----
  getMemories: (type?: string) =>
    apiFetch<{ memories: unknown[] }>(
      `/api/memory${type ? `?type=${type}` : ""}`,
    ),

  getMemory: (id: string) =>
    apiFetch<{ memory: unknown }>(`/api/memory/${id}`),

  createMemory: (data: Record<string, unknown>) =>
    apiFetch<{ memory: unknown }>("/api/memory", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateMemory: (id: string, data: Record<string, unknown>) =>
    apiFetch<{ memory: unknown }>(`/api/memory/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  deleteMemory: (id: string, confirm = false) =>
    apiFetch<{ message: string }>(
      `/api/memory/${id}?confirm=${confirm}`,
      { method: "DELETE" },
    ),

  // ---- Harness 提案 ----
  getProposals: () =>
    apiFetch<{ proposals: unknown[] }>("/api/harness/proposals"),

  getProposal: (id: string) =>
    apiFetch<{ proposal: unknown }>(`/api/harness/proposals/${id}`),

  createProposal: (data: Record<string, unknown>) =>
    apiFetch<{ proposal: unknown }>("/api/harness/proposals", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  reviewProposal: (
    id: string,
    action: "approve" | "reject",
    reviewedBy = "Admin",
    /** L3 二次确认标记：true 时后端放行高风险 approve */
    confirm = false,
  ) =>
    apiFetch<{ proposal: unknown }>(`/api/harness/proposals/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ action, reviewedBy, confirm }),
    }),

  // ---- Harness 自演化引擎 ----
  /** 获取 Harness 演化引擎实时状态 */
  getHarnessStatus: () => apiFetch<HarnessStatus>("/api/harness/status"),

  /** 手动触发一次 Harness 自评估（默认标记为 manual） */
  triggerHarnessEvaluate: (triggeredBy: "auto" | "manual" = "manual") =>
    apiFetch<HarnessEvaluateResult>("/api/harness/evaluate", {
      method: "POST",
      body: JSON.stringify({ triggeredBy }),
    }),

  /** 获取 Harness 进化历史（评估日志） */
  getEvolutionLog: (limit = 50) =>
    apiFetch<{ logs: unknown[] }>(`/api/harness/evolution-log?limit=${limit}`),

  // ---- 对话 ----
  getConversations: () =>
    apiFetch<{ conversations: unknown[] }>("/api/conversations"),

  getConversation: (id: string) =>
    apiFetch<{ conversation: unknown }>(`/api/conversations/${id}`),

  /** 更新对话：关联项目空间或重命名 */
  updateConversation: (id: string, data: { projectId?: string | null; title?: string }) =>
    apiFetch<{ conversation: unknown }>(`/api/conversations/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  createConversation: (title: string, initialMessage?: string) =>
    apiFetch<{ conversation: { id: string } }>("/api/conversations", {
      method: "POST",
      body: JSON.stringify({ title, initialMessage }),
    }),

  /** 原子导入：对话 + 完整消息一次事务落库（用于本地 pending 队列回放） */
  importConversation: (
    title: string,
    messages: Array<{ role: "user" | "assistant"; content: string }>,
  ) =>
    apiFetch<{ conversation: { id: string } }>("/api/conversations", {
      method: "POST",
      body: JSON.stringify({ title, messages }),
    }),

  addMessage: (
    convId: string,
    role: "user" | "assistant",
    content: string,
    trace?: any,
  ) =>
    apiFetch<{ message: unknown }>(
      `/api/conversations/${convId}/messages`,
      {
        method: "POST",
        body: JSON.stringify({ role, content, trace }),
      },
    ),

  // ---- 技能 ----
  getSkills: () =>
    apiFetch<{ skills: unknown[] }>("/api/skills"),

  getSkill: (id: string) =>
    apiFetch<{ skill: unknown }>(`/api/skills/${id}`),

  getSkillFileContent: (id: string, filePath: string) =>
    apiFetch<{ content: string }>(`/api/skills/${id}/file-content?path=${encodeURIComponent(filePath)}`),

  createSkill: (data: {
    name: string
    description: string
    category?: string
    inputSchema?: string
    outputSchema?: string
    scenarios?: string
  }) =>
    apiFetch<{ skill: unknown }>("/api/skills", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateSkill: (id: string, data: Record<string, unknown>) =>
    apiFetch<{ skill: unknown }>(`/api/skills/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  deleteSkill: (id: string, force = false) =>
    apiFetch<{ message: string }>(`/api/skills/${id}${force ? "?force=true" : ""}`, {
      method: "DELETE",
    }),

  installSkill: (formData: FormData) =>
    apiFetch<{ skill: unknown }>("/api/skills/install", {
      method: "POST",
      body: formData,
    }),

  testSkill: (id: string, confirm = false) =>
    apiFetch<{ success?: boolean; message?: string }>(`/api/skills/${id}/test${confirm ? '?confirm=true' : ''}`, {
      method: "POST",
    }),

  // ---- 连接器 ----
  getConnectors: () => getConnectors(),

  updateConnector: (id: string, data: Record<string, unknown>) =>
    updateConnector(id, data),

  // ---- 外贸：询盘 / 情报 / 报价 ----
  getInquiries: () =>
    apiFetch<{ inquiries: unknown[] }>("/api/inquiries"),

  getIntelligence: () =>
    apiFetch<{ intelligence: unknown[] }>("/api/intelligence"),

  getQuotations: () =>
    apiFetch<{ quotations: unknown[] }>("/api/quotations"),

  // ---- 审计日志 ----
  getAuditLogs: (
    limitOrParams?:
      | number
      | {
          page?: number
          limit?: number
          actor?: string
          action?: string
          status?: string
          targetType?: string
          riskLevel?: string
          query?: string
          /** AGENTS.md §3.5 四层日志链顶层关联约定：按工作流运行 ID 关联查询 */
          workflowRunId?: string
        },
  ) => {
    let queryStr = ""
    if (typeof limitOrParams === "number") {
      queryStr = `?limit=${limitOrParams}`
    } else if (limitOrParams) {
      const urlParams = new URLSearchParams()
      Object.entries(limitOrParams).forEach(([k, v]) => {
        if (v !== undefined && v !== null) {
          urlParams.set(k, String(v))
        }
      })
      queryStr = `?${urlParams.toString()}`
    }
    return apiFetch<{ logs: unknown[]; total?: number; page?: number; limit?: number }>(
      `/api/audit${queryStr}`,
    )
  },

  // ---- 工具注册表 ----
  getTools: () =>
    apiFetch<{ tools: unknown[] }>("/api/tools"),

  grantTool: (data: Record<string, unknown>) =>
    apiFetch<{ grant: unknown }>("/api/tools/grant", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // ---- Hermes 今日建议 ----
  getHermesSuggestions: () =>
    apiFetch<HermesSuggestionsResult>("/api/hermes/suggestions"),

  // ---- Harness Spec 生成（P6 Spec-First）----
  generateHarnessSpec: (data: {
    businessIntent: string
    industry: string
    agentRole: string
  }) =>
    apiFetch<{
      spec: Record<string, unknown>
      markdown: string
      provider: string
      model: string
    }>("/api/harness/generate-spec", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // ---- 最近记录 ----
  getRecent: (type = "all", industry?: string) => {
    const params = new URLSearchParams({ type })
    if (industry) params.set("industry", industry)
    return apiFetch<{ records: RecentRecordItem[] }>(
      `/api/recent?${params.toString()}`,
    )
  },

  // ---- AGENTS.md 规则文档 ----
  getAgentsMd: () =>
    apiFetch<{ content: string }>("/api/agents-md"),
}

/** 最近记录统合类型（与 /api/recent 返回一致） */
export interface RecentRecordItem {
  id: string
  type: "conversation" | "task" | "project" | "file" | "upgrade"
  title: string
  timestamp: string
  href: string
  meta?: Record<string, unknown>
}
