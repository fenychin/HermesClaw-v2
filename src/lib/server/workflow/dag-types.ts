/**
 * DAG 工作流类型定义
 * —— 与 dag-engine.ts / dag-runner.ts 共享的纯类型层，无运行时依赖
 *
 * 🔄 P1 扩展（2026-06-13）：
 *   - WorkflowDefinition 新增 agentPolicy / automationLevel / riskLevel / skillBindings，
 *     这些字段源自 Harness / AgentPolicy，不在页面中硬编码魔法数字。
 *   - 新增 WorkflowAgentPolicy / WorkflowSkillBinding / WorkflowRiskProfile 类型。
 */

import type { AutomationLevel, RiskLevel } from "@/contracts"

// ---- 节点与边的种类 ----

/** 节点种类：task（自定义任务）、condition（条件分支）、subworkflow（子流程嵌套）、skill（技能调用）、noop（占位） */
export type WorkflowNodeKind = 'task' | 'condition' | 'subworkflow' | 'skill' | 'noop'

/** 单节点执行状态 */
export type NodeStatus = 'pending' | 'running' | 'completed' | 'skipped' | 'failed'

/** 一次工作流运行的终态 */
export type RunStatus = 'pending' | 'running' | 'completed' | 'failed'

/** 运行触发方式 */
export type RunTrigger = 'manual' | 'auto' | 'subworkflow'

// ---- Harness 注入的运行时策略 ----

/**
 * 工作流绑定的 Agent 策略快照。
 * 源自 Harness Bundle 中的 AgentPolicy，在 Workflow 生成时注入，
 * 约束节点的自动化授权上限与允许的 Agent 角色。
 */
export interface WorkflowAgentPolicy {
  /** 允许执行本工作流的 Agent 角色列表 */
  allowedRoles: string[]
  /** 本工作流的自动化授权上限（L1-L4） */
  maxAutomationLevel: AutomationLevel
  /** 是否需要人工审批节点 */
  requiresApproval: boolean
  /** 策略快照版本（源自 Harness Bundle） */
  policyVersion: string
}

/**
 * 工作流绑定的技能约束。
 * 源自 Harness Bundle 中的 SkillBinding，限制工作流中可使用的技能集合。
 */
export interface WorkflowSkillBinding {
  /** 技能标识 */
  skillId: string
  /** 技能名称 */
  name: string
  /** 该技能允许的最大自动化等级 */
  maxAutomationLevel: AutomationLevel
  /** 是否启用 */
  enabled: boolean
}

/**
 * 工作流风险画像。
 * 由 workflow-generator 根据任务内容自动评估，或从 AgentPolicy 继承。
 */
export interface WorkflowRiskProfile {
  /** 整体风险等级 */
  riskLevel: RiskLevel
  /** 是否包含高危节点（L3/L4） */
  hasHighRiskNodes: boolean
  /** 高危节点 ID 列表 */
  highRiskNodeIds: string[]
  /** 建议的审批策略 */
  approvalStrategy: 'none' | 'high-risk-only' | 'all'
}

// ---- 图结构 ----

/** 工作流节点（JSON 序列化形态，存入 Workflow.nodes 列） */
export interface WorkflowNode {
  /** 节点唯一标识（同一 Workflow 内不重复） */
  id: string
  /** 节点种类 */
  kind: WorkflowNodeKind
  /** 展示名称 */
  name: string
  /** 条件（condition 节点）或子流程（subworkflow 节点）等的配置 */
  config?: Record<string, unknown>
  /** 显式指定 handler 名（覆盖 kind 默认派发） */
  handler?: string
}

/** 工作流边（JSON 序列化形态，存入 Workflow.edges 列） */
export interface WorkflowEdge {
  /** 源节点 id */
  from: string
  /** 目标节点 id */
  to: string
  /** 条件分支标签：仅当上游 condition 节点返回此标签时激活（无 when 的边总是激活） */
  when?: string
}

/** 工作流定义（从 DB 反序列化后的内存形态） */
export interface WorkflowDefinition {
  id: string
  name: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  /** Harness 注入的 Agent 策略快照（P1 新增：禁止页面魔法数字） */
  agentPolicy?: WorkflowAgentPolicy
  /** Harness 注入的技能绑定约束（P1 新增） */
  skillBindings?: WorkflowSkillBinding[]
  /** 工作流整体自动化授权等级（P1 新增：派生自 AgentPolicy.maxAutomationLevel） */
  automationLevel?: AutomationLevel
  /** 工作流风险画像（P1 新增：生成时自动评估） */
  riskProfile?: WorkflowRiskProfile
}

// ---- 运行时上下文 ----

/** 工作流运行时上下文：在一次 run 内跨节点传递数据的唯一载体 */
export interface WorkflowRunContext {
  runId: string
  workflowId: string
  trigger: RunTrigger
  /** 调用方传入的初始变量（请求体 input） */
  variables: Record<string, unknown>
  /** 各节点完成后的输出累积（key = nodeId） */
  nodeOutputs: Record<string, unknown>
  /** 触发本次运行的操作者 */
  actor: string
  /** 子流程嵌套深度（根 = 0） */
  depth: number
  /** 工作空间 ID（多租户隔离 + Skill 路由审计） */
  workspaceId: string
}

// ---- 节点执行 ----

/** 单个节点的执行结果 */
export interface NodeExecutionResult {
  status: NodeStatus
  /** 节点产出（将写入 ctx.nodeOutputs[node.id] 及 WorkflowNodeRun.output） */
  output?: unknown
  /** condition 节点必须返回此值以选择下游边（对应 WorkflowEdge.when） */
  branch?: string
  /** 失败原因 */
  error?: string
  /** Skill 节点执行时的审计风险等级（low / medium / high），由 Skill.automationLevel 映射 */
  riskLevel?: string
}

/** 节点执行器：接收节点定义与运行时上下文，返回执行结果 */
export type NodeHandler = (node: WorkflowNode, ctx: WorkflowRunContext) => Promise<NodeExecutionResult>

// ---- 引擎配置与钩子 ----

/** DAG 引擎运行选项 */
export interface DagEngineOptions {
  /** 自定义 handler 注册表（key = handler name 或 kind） */
  handlers?: Record<string, NodeHandler>
  /** 子流程最大嵌套深度（默认 5，防无限递归） */
  maxDepth?: number
}

/** DAG 引擎生命周期钩子（由 dag-runner 注入，不碰 Prisma，引擎仅作回调） */
export interface DagEngineHooks {
  /** 节点开始执行前 */
  onNodeStart?: (nodeId: string, ctx: WorkflowRunContext) => Promise<void>
  /** 节点执行完成后（不论成功/失败/跳过） */
  onNodeFinish?: (
    nodeId: string,
    ctx: WorkflowRunContext,
    result: NodeExecutionResult,
  ) => Promise<void>
  /** 工作流执行完成（整体状态已确定） */
  onWorkflowComplete?: (
    ctx: WorkflowRunContext,
    status: RunStatus,
  ) => Promise<void>
}

// ---- 拓扑排序内部类型（不对外导出） ----

/** 邻接表条目 */
export interface GraphLayer {
  nodeIds: string[]
  level: number
}
