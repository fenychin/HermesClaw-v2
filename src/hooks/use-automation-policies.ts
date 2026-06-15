"use client"

/**
 * AutomationPolicy 前端 hooks（AGENTS.md §4.7 / §5.2）
 *
 * 与 use-model-routing.ts 风格保持一致：
 *   - useAutomationPolicies()         → 列表 + globalPolicy + 可选 effective
 *   - useUpsertAutomationPolicy()     → POST/PATCH（按 policyId 是否存在分流）
 *   - useDeleteAutomationPolicy()     → DELETE
 *   - useEffectivePolicy(...)         → 在内存里按 (agentId, actionType) 解析，
 *                                        避免「模拟器」每次都打 server
 *
 * 业务约束：升级到 L3/L4 由后端 422/403 拦截；前端只负责 toast 与跳转引导。
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import type {
  AutomationLevel,
  RiskLevel,
} from "@hermesclaw/event-contracts"
import { toast } from "sonner"

// ==============================
// 类型
// ==============================

export type PolicySource =
  | "action-specific"
  | "agent-default"
  | "workspace-default"
  | "system-default"

export interface AutomationPolicyDto {
  policyId: string
  workspaceId: string
  agentId: string | null
  actionType: string | null
  automationLevel: AutomationLevel
  riskLevel: RiskLevel
  requireApproval: boolean
  requireApproverIds: string[]
  priority: number
  description: string | null
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
}

export interface ResolvedPolicyDto {
  automationLevel: AutomationLevel
  riskLevel: RiskLevel
  requireApproval: boolean
  approverIds: string[]
  source: PolicySource
  policyId: string | null
}

export interface AutomationPolicyListResponse {
  policies: AutomationPolicyDto[]
  globalPolicy: ResolvedPolicyDto
  effective: ResolvedPolicyDto | null
  l4Allowed: boolean
}

export interface UpsertPolicyPayload {
  policyId?: string
  agentId: string | null
  actionType: string | null
  automationLevel: AutomationLevel
  riskLevel: RiskLevel
  requireApproval?: boolean
  requireApproverIds?: string[]
  priority?: number
  description?: string | null
}

// ==============================
// API
// ==============================

const QUERY_KEY = ["automation-policies"] as const

async function fetchPolicies(): Promise<AutomationPolicyListResponse> {
  const res = await fetch("/api/workspace/automation-policy")
  const json = await res.json()
  if (!json.success) {
    throw new Error(json.error ?? "获取自动化策略失败")
  }
  return json.data as AutomationPolicyListResponse
}

async function postPolicy(
  payload: UpsertPolicyPayload,
): Promise<AutomationPolicyDto> {
  const res = await fetch("/api/workspace/automation-policy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  const json = await res.json()
  if (!json.success) {
    throw new Error(json.message ?? json.error ?? "创建策略失败")
  }
  return json.data.policy as AutomationPolicyDto
}

async function patchPolicy(
  payload: UpsertPolicyPayload,
): Promise<AutomationPolicyDto> {
  const res = await fetch("/api/workspace/automation-policy", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  const json = await res.json()
  if (!json.success) {
    throw new Error(json.message ?? json.error ?? "更新策略失败")
  }
  return json.data.policy as AutomationPolicyDto
}

async function deletePolicy(policyId: string): Promise<void> {
  const res = await fetch(
    `/api/workspace/automation-policy?policyId=${encodeURIComponent(policyId)}&confirm=true`,
    { method: "DELETE" },
  )
  const json = await res.json()
  if (!json.success) {
    throw new Error(json.message ?? json.error ?? "删除策略失败")
  }
}

// ==============================
// Hooks
// ==============================

export function useAutomationPolicies() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchPolicies,
    staleTime: 60_000,
  })
  return {
    data: data ?? null,
    policies: data?.policies ?? [],
    globalPolicy: data?.globalPolicy ?? null,
    l4Allowed: data?.l4Allowed ?? false,
    isLoading,
    error,
    refetch,
  }
}

export function useUpsertAutomationPolicy() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: UpsertPolicyPayload) => {
      return payload.policyId ? patchPolicy(payload) : postPolicy(payload)
    },
    onSuccess: (policy) => {
      toast.success(
        policy.agentId === null && policy.actionType === null
          ? "已保存全局默认策略"
          : "已保存策略",
      )
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}

export function useDeleteAutomationPolicy() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (policyId: string) => deletePolicy(policyId),
    onSuccess: () => {
      toast.success("策略已删除")
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}

// ==============================
// 前端模拟器（不打 server）
// ==============================

const SOURCE_RANK: Record<Exclude<PolicySource, "system-default">, number> = {
  "action-specific": 3,
  "agent-default": 2,
  "workspace-default": 1,
}

const SYSTEM_DEFAULT: ResolvedPolicyDto = {
  automationLevel: "L1",
  riskLevel: "low",
  requireApproval: false,
  approverIds: [],
  source: "system-default",
  policyId: null,
}

/**
 * 客户端模拟「针对 (agentId, actionType) 当前会命中哪一条策略」。
 * 与服务端 resolveAutomationPolicy 保持等价的优先级规则，但只读已加载列表。
 */
export function useEffectivePolicy(
  policies: AutomationPolicyDto[],
  agentId: string | null,
  actionType: string | null,
): ResolvedPolicyDto {
  const candidates = policies.filter((p) => {
    if (p.agentId !== null && p.actionType !== null) {
      return p.agentId === agentId && p.actionType === actionType
    }
    if (p.agentId !== null && p.actionType === null) {
      return p.agentId === agentId
    }
    if (p.agentId === null && p.actionType === null) {
      return true
    }
    return false
  })
  if (candidates.length === 0) return { ...SYSTEM_DEFAULT }

  const sorted = [...candidates].sort((a, b) => {
    const aSource =
      a.agentId !== null && a.actionType !== null
        ? "action-specific"
        : a.agentId !== null
          ? "agent-default"
          : "workspace-default"
    const bSource =
      b.agentId !== null && b.actionType !== null
        ? "action-specific"
        : b.agentId !== null
          ? "agent-default"
          : "workspace-default"
    if (SOURCE_RANK[bSource] !== SOURCE_RANK[aSource]) {
      return SOURCE_RANK[bSource] - SOURCE_RANK[aSource]
    }
    return b.priority - a.priority
  })
  const top = sorted[0]
  const source: PolicySource =
    top.agentId !== null && top.actionType !== null
      ? "action-specific"
      : top.agentId !== null
        ? "agent-default"
        : "workspace-default"
  return {
    automationLevel: top.automationLevel,
    riskLevel: top.riskLevel,
    requireApproval: top.requireApproval,
    approverIds: top.requireApproverIds,
    source,
    policyId: top.policyId,
  }
}
