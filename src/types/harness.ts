/**
 * 动态 Harness 进化提案类型
 * —— 对应 AGENTS.md 第三章 / PRD 第 11 节，自演化系统的核心机制
 *
 * ⚠️ 契约单源：AutomationLevel / RiskLevel 统一定义在 contracts/shared.ts，
 *    本文件通过 import type + re-export 消费，不再手写重复类型。
 */

import type {
  AutomationLevel,
  RiskLevel as ContractRiskLevel,
  ProposalStatus,
  TargetComponent,
} from "@/contracts"

export type { AutomationLevel }
// ⚠️ RiskLevel 使用 compat 子集（不含 'critical'，Harness 不处理 catastrophic 级事件）
export type RiskLevel = Exclude<ContractRiskLevel, 'critical'>
// ProposalStatus / TargetComponent 单源来自 contracts/，此处仅 re-export 供外部便捷导入
export type { ProposalStatus }
export type { TargetComponent }

/**
 * 契约层 HarnessProposal（DB 对齐，扁平字段）。
 * 从 contracts/ 导入，供需要与 DB/API 直接对齐的代码使用。
 * 大部分 UI 层代码应使用下方的 HarnessProposal（UI 兼容视图，含嵌套 proposedChange）。
 */
export type { HarnessProposal as ContractHarnessProposal } from "@/contracts"

/**
 * 由 riskLevel 派生 automationLevel（未显式标注时的回退规则，见 §4.7）
 * —— high→L3 / medium→L2 / low→L1
 */
export function automationLevelFromRisk(risk: RiskLevel): AutomationLevel {
  if (risk === 'high') return 'L3'
  if (risk === 'medium') return 'L2'
  return 'L1'
}

/**
 * 解析自动化授权等级：显式标注优先，否则由 riskLevel 派生。
 * —— 统一 automationLevel ?? automationLevelFromRisk(riskLevel) 的样板代码。
 *    供 Route Handler / guardrail / harness-eval 等复用。
 */
export function resolveAutomationLevel(
  automationLevel: string | null | undefined,
  riskLevel: RiskLevel,
): AutomationLevel {
  if (automationLevel === 'L1' || automationLevel === 'L2' || automationLevel === 'L3' || automationLevel === 'L4') {
    return automationLevel
  }
  return automationLevelFromRisk(riskLevel)
}

/** 审计日志风险等级（与 contracts RiskLevel 兼容，不含 'critical'） */
export type AuditRiskLevel = Exclude<ContractRiskLevel, 'critical'>

/**
 * 将 AutomationLevel 映射为审计日志 riskLevel。
 *
 * 映射规则（AGENTS.md §4.7）：
 *   L1 → low（全自动，低风险）
 *   L2 → low（建议执行留痕，低风险）
 *   L3 → medium（需人工确认，中风险）
 *   L4 → high（绝对禁止自动，高风险）
 *
 * 供 dag-runner / guardrail / 所有 Skill 调用方复用，避免在各处重复 switch。
 */
export function mapAutomationToAuditRisk(level: AutomationLevel): AuditRiskLevel {
  switch (level) {
    case 'L1':
    case 'L2':
      return 'low'
    case 'L3':
      return 'medium'
    case 'L4':
      return 'high'
    default:
      return 'low'
  }
}

/**
 * 将 AutomationLevel 映射为 AgentLog riskLevel 字符串。
 */
export function mapAutomationToLogRisk(level: AutomationLevel): string {
  switch (level) {
    case 'L1':
    case 'L2':
      return 'low'
    case 'L3':
      return 'medium'
    case 'L4':
      return 'high'
    default:
      return 'low'
  }
}

/**
 * 将 AutomationLevel 映射为 selectModel() 使用的路由风险等级。
 *
 * L1/L2 → low（成本优化模型）
 * L3    → medium（工作空间默认模型）
 * L4    → high（高能力模型）
 *
 * 返回值为 model-router RouteRiskLevel 的等效字符串，调用方自行类型断言。
 */
export function mapAutomationToRouteRisk(level: AutomationLevel): 'low' | 'medium' | 'high' {
  switch (level) {
    case 'L4':
      return 'high'
    case 'L3':
      return 'medium'
    default:
      return 'low'
  }
}

/** Agent 业务动作 + 其自动化授权等级 */
export interface AgentAction {
  id: string
  name: string
  description: string
  automationLevel: AutomationLevel
  category: string
  requiresApproval: boolean
  dangerousIfFailed: boolean
}

/** L1-L4 外贸场景预设动作清单（agents 详情页动作授权清单数据源） */
export const TRADE_ACTIONS: AgentAction[] = [
  // L1 全自动
  { id: 'l1-email-classify', name: '邮件分类', description: '对收件箱邮件自动分类打标签', automationLevel: 'L1', category: 'email', requiresApproval: false, dangerousIfFailed: false },
  { id: 'l1-inquiry-score', name: '询盘评分', description: '对新询盘自动评分和优先级排序', automationLevel: 'L1', category: 'trade', requiresApproval: false, dangerousIfFailed: false },
  { id: 'l1-status-sync', name: '状态同步', description: '同步订单状态到 CRM', automationLevel: 'L1', category: 'data', requiresApproval: false, dangerousIfFailed: false },
  { id: 'l1-notification', name: '通知推送', description: '向用户发送任务状态通知', automationLevel: 'L1', category: 'notification', requiresApproval: false, dangerousIfFailed: false },

  // L2 建议执行
  { id: 'l2-draft-reply', name: '起草回复', description: '自动起草客户邮件回复草稿（人工确认后发送）', automationLevel: 'L2', category: 'email', requiresApproval: false, dangerousIfFailed: false },
  { id: 'l2-followup-plan', name: '跟进计划', description: '生成客户跟进节奏建议', automationLevel: 'L2', category: 'trade', requiresApproval: false, dangerousIfFailed: false },
  { id: 'l2-risk-alert', name: '风险预警', description: '识别高风险客户并生成预警', automationLevel: 'L2', category: 'risk', requiresApproval: false, dangerousIfFailed: false },

  // L3 需人工确认
  { id: 'l3-send-quotation', name: '发送报价单', description: '向客户发送正式报价单（需确认金额）', automationLevel: 'L3', category: 'trade', requiresApproval: true, dangerousIfFailed: true },
  { id: 'l3-create-contract', name: '创建合同', description: '生成正式合同草稿（需法务审核）', automationLevel: 'L3', category: 'legal', requiresApproval: true, dangerousIfFailed: true },
  { id: 'l3-large-discount', name: '大额折扣', description: '对客户报价超过 15% 折扣（需主管确认）', automationLevel: 'L3', category: 'finance', requiresApproval: true, dangerousIfFailed: true },

  // L4 绝对禁止自动
  { id: 'l4-payment', name: '付款操作', description: '任何涉及付款的操作', automationLevel: 'L4', category: 'finance', requiresApproval: true, dangerousIfFailed: true },
  { id: 'l4-delete-client', name: '删除客户', description: '删除客户记录（不可逆）', automationLevel: 'L4', category: 'data', requiresApproval: true, dangerousIfFailed: true },
  { id: 'l4-cancel-order', name: '取消订单', description: '取消已确认订单（需双方同意）', automationLevel: 'L4', category: 'trade', requiresApproval: true, dangerousIfFailed: true },
]

export interface HarnessProposal {
  id: string
  proposalId: string           // HEP-{timestamp}
  triggeredBy: 'auto' | 'manual'
  triggerReason: string
  problemStatement: string
  evidence: string[]
  proposedChange: {
    targetComponent: TargetComponent
    description: string
    riskLevel: RiskLevel
    automationLevel: AutomationLevel
  }
  requiresHumanApproval: true
  estimatedImpact: string
  affectedAgents: string[]
  rollbackPlan: string
  status: ProposalStatus
  createdAt: string
  reviewedBy?: string
  reviewedAt?: string
  /** 多租户隔离（§4.11），默认 "default" */
  workspaceId?: string
}

/**
 * 动态 Harness 自评估指标（Level 2 评估层产物）
 * —— 由 /api/harness/evaluate 统计最近评估窗口内的智能体运行表现
 */
export interface HarnessMetrics {
  /** 评估窗口内日志总数 */
  total: number
  /** 失败任务数 */
  errors: number
  /** 成功任务数 */
  success: number
  /** 失败率（0~1） */
  errorRate: number
  /** 工具调用 / 任务成功率（0~1） */
  successRate: number
  /** 评估窗口（小时） */
  windowHours: number
}

/**
 * Harness 演化引擎实时状态（/api/harness/status）
 */
export interface HarnessStatus {
  /** 最近一次评估时间（取最新提案 createdAt，无则为 null） */
  lastEvaluatedAt: string | null
  /** 下次评估时间（lastEvaluatedAt + 评估周期） */
  nextEvaluatedAt: string | null
  /** 待审批提案数量 */
  pendingCount: number
  /** 历史提案总数 */
  totalProposals: number
  /** 评估周期（小时，默认 72） */
  intervalHours: number
}

/**
 * 一次 Harness 评估的结果（/api/harness/evaluate 返回体）
 */
export interface HarnessEvaluateResult {
  /** 是否达到触发条件并生成了升级提案 */
  triggered: boolean
  /** 本次评估的指标快照 */
  metrics: HarnessMetrics
  /** 实际承担分析的 Provider（无 key 时回退 deepseek） */
  provider: 'anthropic' | 'deepseek' | null
  /** 实际使用的模型 ID */
  model: string | null
  /** 触发时生成的提案（未触发则缺省） */
  proposal?: HarnessProposal
  /** 未触发时的说明 */
  reason?: string
  /** AI 生成的 Markdown 评估报告（触发时） */
  reportMd?: string
  /** 完整的 EvaluationReport 契约对象（P0 新增：对齐 contracts/evaluation-report.ts） */
  evaluationReport?: import('@/contracts').EvaluationReport
  /** AI 分析失败时的错误信息（P0 新增：区分"未触发"与"触发但分析失败"） */
  error?: string
}

/**
 * 进化日志条目（P1-⑤ 进化调度器：每次评估落一条，供 /api/harness/evolution-log）
 */
export interface EvolutionLogEntry {
  id: string
  triggeredBy: 'auto' | 'manual'
  evaluatedAt: string
  triggered: boolean
  errorRate: number
  successRate: number
  totalLogs: number
  provider: 'anthropic' | 'deepseek' | null
  model: string | null
  proposalId: string | null
  reason: string | null
  reportMd: string | null
  createdAt: string
}
