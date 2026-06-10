/**
 * HermesClaw-v2 类型统一导出入口
 * —— 所有领域类型集中 re-export，外部统一从 '@/types' 导入
 */

// ---- Agent 智能体 ----
export type {
  Agent,
  AgentStatus,
  AgentSource,
} from './agent'

// ---- Project 项目空间 ----
export type {
  Project,
  ProjectType,
  ProjectStatus,
  ProjectSpace,
  ProjectSkill,
  ProjectConnection,
  ProjectInstruction,
  ProjectFile,
  ProjectContext,
} from './project'

// ---- Memory 记忆 ----
export type {
  Memory,
  MemoryType,
} from './memory'

// ---- Connector 连接器 ----
export type {
  Connector,
  ConnectorStatus,
  ConnectorCategory,
} from './connector'

// ---- Skill 技能 ----
export type {
  Skill,
  SkillStatus,
  SkillSource,
} from './skill'

// ---- Harness 进化提案 ----
export type {
  HarnessProposal,
  RiskLevel,
  ProposalStatus,
  AutomationLevel,
  AgentAction,
  HarnessMetrics,
  HarnessStatus,
  HarnessEvaluateResult,
  EvolutionLogEntry,
  TargetComponent,
} from './harness'
export {
  TRADE_ACTIONS,
  automationLevelFromRisk,
  resolveAutomationLevel,
  mapAutomationToAuditRisk,
  mapAutomationToLogRisk,
  mapAutomationToRouteRisk,
} from './harness'

// ---- Trade 外贸 ----
export type {
  Inquiry,
  InquiryPriority,
  MarketIntelligence,
  IntelligenceType,
  ImpactLevel,
  Quotation,
} from './trade'

// ---- File 文件 ----
export type {
  FileItem,
  FileCategory,
  FileParseStatus,
  VectorIndexStatus,
  FileVersion,
} from './file'

// ---- Chat 对话 ----
export type {
  ModelProvider,
  ChatMessage,
  ChatRequest,
  ModelOption,
} from "./chat";
export { AVAILABLE_MODELS } from "./chat";

// ---- Hermes 控制面（今日主动建议）----
export type {
  HermesSuggestion,
  SuggestionPriority,
  SuggestionRelatedTo,
  HermesSystemSnapshot,
  HermesSuggestionsResult,
} from "./hermes";

// ---- 通用工具类型 ----
/** 统一 API 响应包装（呼应 AGENTS.md：执行须可溯源、结构化） */
export interface ApiResult<T> {
  ok: boolean
  data?: T
  error?: string
}

/** 记忆层级（语义别名，向后兼容） */
export type MemoryTier = 'short' | 'mid' | 'long'
