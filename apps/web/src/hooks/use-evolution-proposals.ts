/**
 * useEvolutionProposals — 进化提案 + 评估报告 Hook (Phase 5)
 *
 * 接入真实 API：
 * - GET /api/v1/harness/evaluation-report → 评估报告 + GEN-N
 * - GET /api/v1/harness/evolution-proposals → 提案列表
 * - GET /api/v1/audit/latest-approval → 审批签名
 *
 * PERF(v3.42.05): 不再自己创建 SSE 连接，通过 IntelStreamContext 订阅页面级共享流。
 *
 * 所有审批动作只跳转审批中心，不允许直接批准。
 *
 * 治理边界：提案类型仅限 WorkflowTemplate / SkillBinding / EvalRuleSet / MemoryPolicy。
 */
"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import {
  fetchEvaluationReport,
  fetchEvolutionProposals,
  fetchLatestApproval,
} from "@/services/api/industry-intel-api"
import { intelEventBus } from "@/contexts/intel-event-bus"

// ─── 类型 ──────────────────────────────────────────────────────────────

export interface EvolutionProposalItem {
  proposalId: string
  harnessProposalId?: string
  workspaceId: string
  triggeredBy: "auto" | "manual"
  triggerReason: string
  problemStatement: string
  evidence: string[]
  targetComponent: string
  targetObjectId: string
  targetObjectType: "WorkflowTemplate" | "AgentPolicy" | "SkillBinding" | "ContextPolicy" | "MemoryPolicy" | "ConnectorPolicy" | "EvalRuleSet"
  riskLevel: "low" | "medium" | "high" | "critical"
  automationLevel: "L1" | "L2" | "L3" | "L4"
  requiresHumanApproval: boolean
  estimatedImpact: string
  rollbackPlan: string
  status: "draft" | "pending" | "approved" | "rejected" | "implemented" | "rolled-back"
  reviewedBy: string | null
  reviewedAt: string | null
  implementedAt: string | null
  createdAt: string
  updatedAt: string
  version: string
}

export interface EvolutionDnaMetrics {
  generation: number
  decisionAlignment: number
  weightStability: number
  policyEffectiveness: number
}

export interface ApprovalSignature {
  actor: string
  action: string
  createdAt: string
  proposalTitle?: string
}

export interface UseEvolutionProposalsReturn {
  /** 进化 DNA 指标 */
  dna: EvolutionDnaMetrics
  /** 提案列表 */
  proposals: EvolutionProposalItem[]
  /** 待审批计数 */
  pendingCount: number
  /** 提案总数 */
  totalCount: number
  /** 最近审批签名 */
  latestSignature: ApprovalSignature | null
  /** 对齐度历史（用于折线图） */
  alignmentHistory: number[]
  /** 加载态 */
  isLoading: boolean
  /** 错误 */
  error: string | null
  /** 手动刷新 */
  refresh: () => void
  /** 跳转审批中心 URL */
  approvalCenterUrl: string
}

// ─── 默认 DNA ──────────────────────────────────────────────────────────

const DEFAULT_DNA: EvolutionDnaMetrics = {
  generation: 1,
  decisionAlignment: 0,
  weightStability: 1,
  policyEffectiveness: 0,
}

// ─── Hook ──────────────────────────────────────────────────────────────

export function useEvolutionProposals(): UseEvolutionProposalsReturn {
  const [dna, setDna] = useState<EvolutionDnaMetrics>(DEFAULT_DNA)
  const [proposals, setProposals] = useState<EvolutionProposalItem[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [latestSignature, setLatestSignature] = useState<ApprovalSignature | null>(null)
  const [alignmentHistory, setAlignmentHistory] = useState<number[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const mountedRef = useRef(true)

  // PERF(v3.42.05): 独立订阅事件总线——只监听 proposal 事件
  useEffect(() => intelEventBus.on("proposal", () => {
    if (mountedRef.current) loadAllRef.current?.()
  }), [])

  // 用 ref 持有 loadAll 以避免 effect 依赖问题
  const loadAllRef = useRef<(() => void) | null>(null)

  const loadAll = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const [reportData, proposalsData, approvalData] = await Promise.allSettled([
        fetchEvaluationReport(),
        fetchEvolutionProposals({ limit: 20 }),
        fetchLatestApproval(),
      ])

      // 评估报告 → DNA + 对齐度
      if (reportData.status === "fulfilled") {
        const { report, pendingCount: pc, totalCount: tc, latestApproval } = reportData.value
        const metrics = (report.metrics as Record<string, number>) ?? {}
        const successRate = metrics.successRate ?? 0

        setDna({
          generation: tc > 0 ? Math.ceil(tc / 10) + 1 : 1,
          decisionAlignment: successRate,
          weightStability: 1 - (metrics.errorRate ?? 0),
          policyEffectiveness: successRate,
        })
        setPendingCount(pc)
        setTotalCount(tc)
        setAlignmentHistory((prev) => {
          const next = [...prev, successRate]
          return next.slice(-20)
        })
      } else {
        setError(reportData.reason?.message ?? "评估报告加载失败")
      }

      // 进化提案列表
      if (proposalsData.status === "fulfilled") {
        setProposals(proposalsData.value.items as EvolutionProposalItem[])
      }

      // 审批签名
      if (approvalData.status === "fulfilled") {
        const { latestApproval, proposal: aproposal } = approvalData.value
        if (latestApproval) {
          setLatestSignature({
            actor: latestApproval.actor,
            action: latestApproval.action,
            createdAt: latestApproval.createdAt,
            proposalTitle: aproposal?.title,
          })
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败")
    } finally {
      if (mountedRef.current) setIsLoading(false)
    }
  }, [])

  // 同步 loadAll 到 ref，供 SSE 回调使用
  useEffect(() => {
    loadAllRef.current = loadAll
  }, [loadAll])

  // 初始加载 + 轮询（60s）
  useEffect(() => {
    mountedRef.current = true
    loadAll()

    const interval = setInterval(() => {
      if (mountedRef.current) loadAll()
    }, 60_000)

    return () => {
      mountedRef.current = false
      clearInterval(interval)
    }
  }, [loadAll])

  const refresh = useCallback(() => {
    loadAll()
  }, [loadAll])

  // 审批中心 URL（跳转用，不在大盘直接批准）
  const approvalCenterUrl = "/settings/harness?tab=proposals"

  return {
    dna,
    proposals,
    pendingCount,
    totalCount,
    latestSignature,
    alignmentHistory,
    isLoading,
    error,
    refresh,
    approvalCenterUrl,
  }
}
