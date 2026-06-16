/**
 * Hermes 控制面相关类型
 * —— 当前覆盖「今日主动建议」(AI 主动规划，开屏即给出工作建议)。
 */

/** 建议优先级 */
export type SuggestionPriority = "high" | "mid" | "low"

/** 建议关联的系统模块（决定「执行」跳转与图标） */
export type SuggestionRelatedTo = "agents" | "projects" | "harness"

/** 单条 Hermes 今日建议 */
export interface HermesSuggestion {
  priority: SuggestionPriority
  /** 建议标题（一句话） */
  title: string
  /** 具体行动（点击「执行」时填入输入框的指令） */
  action: string
  relatedTo: SuggestionRelatedTo
}

/** 生成建议时所依据的系统状态快照（供前端展示与溯源） */
export interface HermesSystemSnapshot {
  /** 待审批 Harness 提案数 */
  pendingProposals: number
  /** 24 小时内智能体错误率（百分比，0~100 整数） */
  errorRate: number
  /** 风险中项目数量 */
  atRiskCount: number
  /** 24 小时内运行日志总数 */
  logCount24h: number
  /** 待解决的知识库缺口（盲区）数量 */
  knowledgeGapsCount?: number
}

/** GET /api/hermes/suggestions 响应数据 */
export interface HermesSuggestionsResult {
  suggestions: HermesSuggestion[]
  snapshot: HermesSystemSnapshot
  /** 实际产出建议的 Provider（溯源用） */
  provider: "anthropic" | "deepseek"
  model: string
}
