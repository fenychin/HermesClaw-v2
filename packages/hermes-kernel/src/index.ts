/**
 * @hermesclaw/hermes-kernel
 * Hermes Control Kernel — 三域原则第一域
 *
 * 禁止导入规则（在 ESLint 中强制执行）：
 * - 禁止从此包导入任何 React 组件
 * - 禁止直接导入 openclaw-adapter 内部实现
 * - 与 OpenClaw 的通信必须通过 @hermesclaw/event-contracts 的类型
 */

export type { KernelIntent, WorkflowPlan, MemoryScope } from './types'
export { createTaskEnvelope, orchestrate } from './orchestration'
export { memoryRead, memoryWrite } from './memory'
// 注：runHarnessEvaluation / getHarnessStatus 改由 ./handlers/harness-handler 暴露（见下方），
// 此处仅保留 policy 检查导出，避免与 handler 层重复导出。
export { checkPolicy, checkPolicySync } from './policy'
export type {
  PolicyCheckInput,
  PolicyCheckResult,
  PolicyCheckDeps,
  AutomationLevel,
  RiskLevel,
} from './policy'

// Chat Handler
export { executeChatStream, ChatHandlerError, createSseResponse } from './handlers/chat-handler'
export type { ChatHandlerDeps, ChatInput, SseEnqueue, StreamDeltaCallback } from './handlers/chat-handler'

// Task Handler
export { handleQuickTask, TaskHandlerError } from './handlers/task-handler'
export type { TaskHandlerDeps, QuickTaskInput, QuickTaskResult } from './handlers/task-handler'

// Dashboard Handler
export { getDashboardStats, getDashboardOverview } from './handlers/dashboard-handler'
export type { DashboardHandlerDeps, DashboardStatsInput, DashboardStats, DashboardOverviewInput } from './handlers/dashboard-handler'

// Brain Handler
export { getBrainStats, getBrainOverview } from './handlers/brain-handler'
export type { BrainHandlerDeps, BrainStatsInput, BrainOverviewInput } from './handlers/brain-handler'

// Harness Handler
export { getHarnessStatus, listHarnessProposals, getHarnessProposal, approveHarnessProposal, rejectHarnessProposal, rollbackHarnessProposal, runHarnessEvaluation, getEvolutionLog, generateHarnessProposals, promoteCanaryToActive } from './handlers/harness-handler'
export type { HarnessHandlerDeps, HarnessStatusInput, HarnessProposalListInput, HarnessProposalGetInput, HarnessApproveInput, HarnessDecisionResult, HarnessEvaluateInput, HarnessEvolutionLogInput, EvaluationResult, EvaluationSignal, EvaluationSeverity, ProposalType, RunHarnessEvaluationDeps, GenerateHarnessProposalsInput, GenerateHarnessProposalsDeps, GenerateHarnessProposalsResult, HarnessProposalStatus, HarnessProposalRiskLevel, CanaryConfig, PromoteCanaryInput, PromoteCanaryResult } from './handlers/harness-handler'

// Report Handler
export { generateReport } from './handlers/report-handler'
export type { ReportHandlerDeps, ReportGenerateInput, ReportGenerateResult, ReportType } from './handlers/report-handler'

// Inquiry Handler
export { listInquiries, createInquiry, generateInquiryEmail } from './handlers/inquiry-handler'
export type { InquiryHandlerDeps, InquiryListInput, InquiryCreateInput, InquiryGenerateEmailInput } from './handlers/inquiry-handler'

// Workflow Handler
export { listWorkflows, getWorkflow, listWorkflowRuns, getWorkflowRun, cancelWorkflowRun } from './handlers/workflow-handler'
export type { WorkflowHandlerDeps, WorkflowListInput, WorkflowGetInput, WorkflowRunListInput, WorkflowRunGetInput } from './handlers/workflow-handler'

// Workspace Handler
export { listWorkspaceMembers, getWorkspaceSettings, updateWorkspaceSettings } from './handlers/workspace-handler'
export type { WorkspaceHandlerDeps, WorkspaceMembersInput, WorkspaceSettingsInput, WorkspaceSettingsUpdateInput } from './handlers/workspace-handler'

// Agent Handler
export { listAgents, getAgent, createAgent, updateAgent, executeAgent } from './handlers/agent-handler'
export type { AgentHandlerDeps, AgentListInput, AgentCreateInput, AgentUpdateInput, AgentExecuteInput } from './handlers/agent-handler'

// Connector Handler
export { listConnectors, getConnector, createConnector, updateConnector, authorizeConnector } from './handlers/connector-handler'
export type { ConnectorHandlerDeps, ConnectorListInput, ConnectorGetInput, ConnectorCreateInput, ConnectorUpdateInput, ConnectorAuthorizeInput } from './handlers/connector-handler'

// Orchestrator Handler
export { createOrchestratorEnvelope, dispatchOrchestration } from './handlers/orchestrator-handler'
export type {
  OrchestratorHandlerDeps,
  OrchestratorDispatchInput,
  OrchestratorDispatchResult,
  OrchestratorEnvelopeInput,
  OrchestrationRunInput,
  GateCheckInput,
} from './handlers/orchestrator-handler'
