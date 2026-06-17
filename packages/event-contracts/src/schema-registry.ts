/**
 * HermesClaw Schema Registry v1.0
 * 锁定时间：2026-06-15
 * 本文件锁定 Top 10 核心 Action/Event Schema
 * 任何修改必须经过 AGENTS.md 变更流程审批
 * 
 * 变更历史：
 * v1.0 - 初始锁定，基于 v3.07.00-dev 审查结果
 */

// ─── 基础类型定义 ──────────────────────────────────────────────────────────

/** 自动化授权等级 (AGENTS.md §5.2) */
export type AutomationLevel = 'L1' | 'L2' | 'L3' | 'L4';

/** 审计/事件风险等级 (AGENTS.md §6.2) */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/** 协同模式 (AGENTS.md §4.6.1) */
export type OrchestrationMode = 'sequential' | 'parallel' | 'conditional' | 'human-in-loop';

// ─── Schema 1：TaskEnvelope ──────────────────────────────────────────────────

/**
 * TaskEnvelope 任务封装信封协议
 * [来源: AGENTS.md §3.3] 包含任务派发必备的最窄契约字段
 */
export interface TaskEnvelope {
  /** cuid/uuid 全局唯一任务 ID */
  taskId: string;
  /** 关联的工作流执行 ID */
  workflowRunId: string;
  /** 工作流 ID（期望同等字段，用于部分联调场景） */
  workflowId: string;
  /** 多租户空间隔离 ID */
  workspaceId: string;
  /** 智能体绑定的行业模板 ID */
  industryId: string;
  /** 发起任务的 Agent 唯一标识 */
  agentId: string;
  /** 任务指令动作类型 */
  actionType: string;
  /** 任务输入载荷 */
  input: Record<string, unknown>;
  /** 任务输入上下文（对应 input 的联调别名） */
  inputContext?: Record<string, unknown>;
  /** 自动化授权等级限制 */
  automationLevel: AutomationLevel;
  /** 风险安全拦截等级 */
  riskLevel: RiskLevel;
  /** 幂等性防护 Key，去重唯一标识 */
  idempotencyKey: string;
  /** 回调 Webhook 终点 */
  callbackTarget: string;
  /** 智能体策略规则集快照版本 */
  policySnapshotVersion: string;
  /** 协议契约版本，当前固定为 "1.0" */
  version: string;
  /** 原始意图描述文本 (推断/prd.md §3) */
  intent?: string;
  /** 关联的工作流模板 ID (推断/prd.md §3) */
  workflowTemplateId?: string;
  /** 关联的行业包 ID (推断/prd.md §3) */
  industryPackId?: string;
  /** 创单时间 (ISO 8601 string) */
  createdAt: string;
  /** 超时过期时间 (ISO 8601 string) */
  expiresAt?: string;
  /** 超时相对时长 (毫秒，对应 expiresAt) */
  ttlMs?: number;
  /** 链路追踪追踪 Trace ID */
  traceId?: string;
  /** 父任务 ID（级联追踪子智能体） */
  parentTaskId?: string;
  /** 附加元数据属性 */
  metadata?: Record<string, unknown>;
}

// ─── Schema 2：ExecutionEvent ────────────────────────────────────────────────

/**
 * ExecutionEvent 运行时执行事件状态上报协议
 * [来源: AGENTS.md §3.3] 执行运行时回传给控制内核的事实轨迹
 */
export interface ExecutionEvent {
  /** 全局唯一事件 ID */
  eventId: string;
  /** 触发此事件的 Task 信封 ID */
  taskId: string;
  /** 工作流执行 ID (对应 workflowRunId) */
  runId: string;
  /** 关联的工作流执行 ID */
  workflowRunId: string;
  /** 关联的步骤/节点 ID */
  stepId?: string;
  /** 多租户空间 ID */
  workspaceId: string;
  /** 事件类型（映射到标准事件族：run.* / session.* / tool.* 等） */
  eventType:
    | 'step.started'
    | 'step.completed'
    | 'step.failed'
    | 'workflow.started'
    | 'workflow.completed'
    | 'workflow.failed'
    | 'connector.called'
    | 'connector.responded'
    | 'human.required'
    | string;
  /** 事件当前状态标识 */
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'retrying';
  /** 事件载荷上下文数据 */
  payload: Record<string, unknown>;
  /** 触发动作的连接器 ID */
  connectorId?: string;
  /** 发起动作的终端设备 ID */
  deviceId?: string;
  /** 防篡改动作回执签名 */
  receiptHash?: string;
  /** 事件触发时刻 (ISO 8601 string) */
  timestamp: string;
  /** 运行时执行耗时（毫秒，仅在完成/失败时提供） */
  durationMs?: number;
  /** 步骤重试计数 */
  retryCount?: number;
  /** 错误返回码 */
  errorCode?: string;
  /** 异常详情描述 */
  errorMessage?: string;
  /** 事件协议版本，当前固定为 "1.0" */
  protocolVersion: string;
  /** 链路 Trace ID */
  traceId?: string;
}

// ─── Schema 3：ActionReceipt ─────────────────────────────────────────────────

/**
 * ActionReceipt 连接器动作物理执行回执
 * [来源: AGENTS.md §3.4] 写操作连接器必须输出的防篡改物理回执证据
 */
export interface ActionReceipt {
  /** 物理收据唯一 ID */
  receiptId: string;
  /** 任务 ID */
  taskId: string;
  /** 步骤节点执行 ID */
  stepId: string;
  /** 关联的工作流执行 ID */
  workflowRunId: string;
  /** 多租户空间 ID */
  workspaceId: string;
  /** 执行此动作的连接器 ID */
  connectorId: string;
  /** 动作操作类型，如 'email.send' | 'crm.create' */
  actionType: string;
  /** 是否执行成功 */
  success: boolean;
  /** 脱敏后的输入参数摘要 */
  inputSummary: Record<string, unknown>;
  /** 脱敏后的输出结果摘要 */
  outputSummary: Record<string, unknown>;
  /** 连接器实际返回结果（仅供后端留痕，对联调屏蔽敏感项） */
  output?: Record<string, unknown>;
  /** 连接器错误编码 */
  errorCode?: string;
  /** 连接器失败描述 */
  errorMessage?: string;
  /** 执行物理操作的开始时刻 (ISO 8601 string) */
  executedAt: string;
  /** 动作耗时（毫秒） */
  durationMs: number;
  /** 当前动作已执行过的重试计数 */
  retryCount: number;
  /** 物理回执防篡改 SHA-256 签名 */
  receiptHash: string;
  /** 幂等去重 Key，保障对游物理写安全性 */
  idempotencyKey: string;
  /** 是否为不可逆写操作 */
  isIrreversible: boolean;
  /** 对外不可逆写操作的补偿撤销策略声明 (AGENTS.md §3.4) */
  compensationStrategy: {
    type: 'none' | 'manual' | 'auto-reverse' | 'best-effort' | 'not-applicable';
    description?: string;
    reverseActionType?: string;
    reverseInput?: Record<string, unknown>;
  };
  /** 附加元数据属性 */
  metadata?: Record<string, unknown>;
}

// ─── Schema 4：ApprovalCheckpoint ───────────────────────────────────────────

/**
 * ApprovalCheckpoint 人工审批/进化/灰度门禁决策检查点
 * [来源: AGENTS.md §3.5] 拦截高危或自进化提案的安全门禁凭证
 */
export interface ApprovalCheckpoint {
  /** 检查点唯一 ID */
  checkpointId: string;
  /** 多租户空间 ID */
  workspaceId: string;
  /** 关联的任务信封 ID */
  taskId?: string;
  /** 关联的工作流执行 ID */
  runId?: string;
  /** 关联的工作流执行 ID (workflowRunId) */
  workflowRunId?: string;
  /** 关联的自进化提案 HEP ID */
  proposalId?: string;
  /** 审批门禁触发类型 */
  type: 'high-risk-action' | 'evolution-proposal' | 'canary-launch' | 'manual';
  /** 门禁触发的具体安全规则 */
  triggerReason: string;
  /** 拦截时的最高规则风险评级 */
  riskLevel: 'high' | 'critical';
  /** 触发拦截的授权级别上限 */
  automationLevel: AutomationLevel;
  /** 呈献给审批人的人类可读摘要描述 (对应 actionDescription) */
  actionDescription: string;
  /** 呈献给审批人的人类可读摘要描述 (actionSummary) */
  actionSummary: string;
  /** 发起门禁阻断的智能体 Agent ID */
  requestedBy: string;
  /** 门禁检查点状态 */
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  /** 门禁检查点决策（对应 status） */
  decision: 'pending' | 'approved' | 'rejected' | 'expired' | 'auto-approved';
  /** 做出审批决定的系统用户 ID */
  decidedBy?: string;
  /** 做出审批决定的时刻 (ISO 8601 string) */
  decidedAt?: string;
  /** 驳回原因或通过意见描述 */
  decisionReason?: string;
  /** 门禁等待的过期时刻 (ISO 8601 string) */
  expiresAt: string;
  /** 门禁触发创建的时刻 (ISO 8601 string) */
  createdAt: string;
  /** 审批时阻断的现场输入上下文快照 */
  inputSnapshot?: Record<string, unknown>;
  /** 阻断时生效的策略规则集版本 */
  policySnapshotVersion?: string;
  /** 附加属性 */
  metadata?: Record<string, unknown>;
}

// ─── Schema 5：HarnessProposal ─────────────────────────────────────────────

/**
 * HarnessProposal 控制核自适应评估产生的自进化/变更优化提案
 * [来源: AGENTS.md §5.4] 描述如何针对指标漂移动态更新配置的结构化方案
 */
export interface HarnessProposal {
  /** 自进化提案 HEP- 唯一标识 */
  proposalId: string;
  /** 多租户空间 ID */
  workspaceId: string;
  /** 提案变更类别分类 */
  proposalType:
    | 'workflow-optimization'
    | 'policy-adjustment'
    | 'connector-replacement'
    | 'eval-rule-update'
    | 'workflow-timeout-optimization'
    | 'sub-agent-dispatch-optimization'
    | string;
  /** 提案标题名称 */
  title: string;
  /** 提案核心问题与建议简述 */
  description: string;
  /** 提案核心问题与建议简述 (对应 problemStatement) */
  problemStatement?: string;
  /** 触发评估引擎做出此自适应调整的字段指标名称，如 "connectorSuccessRate" */
  triggerMetric: string;
  /** 漂移后的核心指标实际值 */
  triggerValue: number;
  /** 对应健康线的极限阈值 */
  triggerThreshold: number;
  /** 支撑评估异常的证据链工作流工作实例 IDs */
  evidenceRunIds: string[];
  /** 支撑评估异常的证据链工作流工作实例 IDs (对应 Json 格式别名) */
  evidence?: string[];
  /** 调整后的目标配置内容 (建议变更 Payload) */
  suggestedChange: Record<string, unknown>;
  /** 调整后的目标配置内容 (对应 Json 格式别名) */
  proposedChange?: {
    targetComponent: string;
    description: string;
    riskLevel: string;
    automationLevel: string;
  };
  /** 预估的改善幅度描述 */
  estimatedImpact: string;
  /** 灰度失败时的回滚方案描述 (AGENTS.md §4.5) */
  rollbackPlan?: string;
  /** 提案流转状态 */
  status:
    | 'draft'
    | 'pending-approval'
    | 'approved'
    | 'rejected'
    | 'applied'
    | 'rolled-back'
    | 'canary'
    | 'active'
    | 'deprecated';
  /** 绑定的门禁 checkpointId（若高危） */
  checkpointId?: string;
  /** 灰度评估时注入的上一版本配置 Snapshot 快照 ID */
  snapshotId?: string;
  /** 创建时刻 (ISO 8601 string) */
  createdAt: string;
  /** 更新时刻 (ISO 8601 string) */
  updatedAt: string;
}

// ─── Schema 6：WorkflowRunStarted (Audit Event) ─────────────────────────────

/**
 * WorkflowRunStartedEvent 工作流启动开始审计日志
 * [来源: AGENTS.md §6.2] 工作流引擎启动新生命周期时的必备可溯源审计边界
 */
export interface WorkflowRunStartedEvent {
  /** 审计动作名称，固定为 "workflow.run.started" */
  action: 'workflow.run.started';
  /** 启动的工作流实例运行 ID */
  runId: string;
  /** 绑定对应的工作流模板/定义 ID */
  workflowId: string;
  /** 多租户空间 ID */
  workspaceId: string;
  /** 负责编排/分派此工作流的主 Agent ID */
  agentId: string;
  /** 触发此工作流寿命周期的起始媒介 */
  triggeredBy: 'user' | 'cron' | 'webhook' | 'orchestrator' | string;
  /** 工作流引擎运行的协同拓扑模式 */
  mode: OrchestrationMode;
  /** 关联的行业插件包唯一 ID */
  industryPackId?: string;
  /** 工作流中包含的步骤节点总数 */
  stepCount: number;
  /** 审计事件时刻 (ISO 8601 string) */
  timestamp: string;
}

// ─── Schema 7：WorkflowRunCompleted (Audit Event) ───────────────────────────

/**
 * WorkflowRunCompletedEvent 工作流顺利执行完成审计日志
 * [来源: AGENTS.md §6.2] 工作流引擎全链路归档时的指标统计与审计边界
 */
export interface WorkflowRunCompletedEvent {
  /** 审计动作名称，固定为 "workflow.run.completed" */
  action: 'workflow.run.completed';
  /** 实例运行 ID */
  runId: string;
  /** 多租户空间 ID */
  workspaceId: string;
  /** 工作流执行整体跨度耗时（毫秒） */
  durationMs: number;
  /** 执行经历过的节点步骤数 */
  stepCount: number;
  /** 标志为 completed 的步骤数 */
  completedStepCount: number;
  /** 标志为 skipped 的跳过步骤数 */
  skippedStepCount: number;
  /** 脱敏后的全量输出数据快照摘要 */
  outputSummary: Record<string, unknown>;
  /** 审计事件时刻 (ISO 8601 string) */
  timestamp: string;
}

// ─── Schema 8：RollbackTriggered (Audit Event) ──────────────────────────────

/**
 * RollbackTriggeredEvent 灰度进化配置自动/手动回滚审计日志
 * [来源: AGENTS.md §6.2] 当观察窗口内性能恶化触发状态机原子复原时的审计边界
 */
export interface RollbackTriggeredEvent {
  /** 审计动作名称，锁定为 "proposal.rollback" */
  action: 'proposal.rollback';
  /** 发生回滚对应的自愈任务唯一 ID */
  rollbackId: string;
  /** 多租户空间 ID */
  workspaceId: string;
  /** 备份和恢复配置对应的元数据快照 ID */
  snapshotId: string;
  /** 触发起死回生回滚的直接判定条件 */
  trigger: 'canary-abort' | 'manual' | 'auto-eval' | string;
  /** 触发执行操作的系统账号或 system */
  triggeredBy: string;
  /** 受本次配置变更回滚影响的拓扑资产清单 */
  affectedResources?: Array<{
    resourceType: 'agent' | 'workflow-template' | 'policy' | 'connector';
    resourceId: string;
  }>;
  /** 审计事件时刻 (ISO 8601 string) */
  timestamp: string;
}

// ─── Schema 9：CanaryAborted (Audit Event) ──────────────────────────────────

/**
 * CanaryAbortedEvent 灰度部署异常紧急熔断中止审计日志
 * [来源: AGENTS.md §6.2] 灰度指标触碰安全阈值自动触发 Early Abort 中止时的审计边界
 */
export interface CanaryAbortedEvent {
  /** 审计动作名称，固定为 "canary.aborted" */
  action: 'canary.aborted';
  /** 灰度巡检的 Canary ID */
  canaryId: string;
  /** 多租户空间 ID */
  workspaceId: string;
  /** 注入的快照 ID */
  snapshotId: string;
  /** 中止熔断时的即时灰度流量占比百分比 (1-100) */
  trafficPercentAtAbort?: number;
  /** 中止回退的直接原因分类 */
  reason: 'metric-degradation' | 'manual' | 'timeout' | string;
  /** 造成健康线崩溃的关键健康指标快照数据 */
  degradedMetrics?: Array<{
    metric: string;
    value: number;
    threshold: number;
  }>;
  /** 本次 Canary 灰度中止是否连带发起了原子变更回退任务 */
  rollbackTriggered: boolean;
  /** 审计事件时刻 (ISO 8601 string) */
  timestamp: string;
}

// ─── Schema 10：AgentMessage (Multi-Agent 通信协议) ──────────────────────────

/**
 * AgentMessage 多智能体分布式协同通信协议信封
 * [来源: AGENTS.md §4.6.1] 协同总编排与子智能体网络、人工介入的消息交换信封
 */
export interface AgentMessage {
  /** 消息唯一 ID */
  messageId: string;
  /** 协同编排 Session ID */
  sessionId: string;
  /** 发送本消息的智能体 ID */
  fromAgentId: string;
  /** 目标接收智能体 ID（广播可为 "*"） */
  toAgentId: string;
  /** 发送者的拓扑角色 */
  fromRole: 'orchestrator' | 'sub-agent' | 'human' | 'system';
  /** 协同消息的动作类型 */
  messageType:
    | 'task-dispatch'
    | 'task-result'
    | 'task-error'
    | 'clarification-request'
    | 'clarification-response'
    | 'status-update'
    | 'broadcast'
    | string;
  /** 消息通信所包含的内容载荷，与 messageType 映射强绑定 */
  payload: Record<string, unknown>;
  /** 响应回复时指向的上游 messageId 链路指针 */
  correlationId?: string;
  /** 关联分配的协同任务实例 ID */
  taskId?: string;
  /** 关联的工作流步骤节点 ID */
  stepId?: string;
  /** 消息产生的时刻 (ISO 8601 string) */
  timestamp: string;
  /** 协同协议版本，当前固定为 "1.0" */
  protocolVersion: string;
}
