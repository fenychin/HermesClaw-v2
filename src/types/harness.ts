/**
 * 动态 Harness 进化提案类型
 * —— 对应 AGENTS.md 第三章 / PRD 第 11 节，自演化系统的核心机制
 */

export type RiskLevel = 'low' | 'mid' | 'high'
export type ProposalStatus = 'pending' | 'approved' | 'rejected'

/**
 * 自动化授权分级（AGENTS.md §4.7）
 * —— L1 全自动 / L2 建议执行留痕 / L3 需人工确认 / L4 绝对禁止自动
 */
export type AutomationLevel = 'L1' | 'L2' | 'L3' | 'L4'

/**
 * 由 riskLevel 派生 automationLevel（未显式标注时的回退规则，见 §4.7）
 * —— high→L3 / mid→L2 / low→L1
 */
export function automationLevelFromRisk(risk: RiskLevel): AutomationLevel {
  if (risk === 'high') return 'L3'
  if (risk === 'mid') return 'L2'
  return 'L1'
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
  proposalId: string
  triggeredBy: 'auto' | 'manual'
  problemStatement: string
  evidence: string[]
  targetComponent: string
  proposedChange: string
  riskLevel: RiskLevel
  /** 自动化授权等级（§4.7）；审批拦截据此决定 L3 二次确认 / L4 硬拒绝 */
  automationLevel: AutomationLevel
  requiresApproval: true
  status: ProposalStatus
  estimatedImpact: string
  createdAt: string
  reviewedBy?: string
  reviewedAt?: string
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
