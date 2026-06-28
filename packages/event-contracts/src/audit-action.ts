/**
 * AuditLog Action 枚举 —— HermesClaw 审计动作唯一真相源
 *
 * AGENTS.md §6.2 要求所有写 AuditLog 的 action 字段必须可治理检索。
 * 本文件收拢全部 action 字面量，禁止在业务代码中自由拼接 action 字符串。
 *
 * 使用方式：
 *   import { AuditAction } from "@hermesclaw/event-contracts"
 *   await writeAuditLog({ ..., action: AuditAction.TASK_DISPATCH })
 */
export const AuditAction = {
  // ─── 任务生命周期 ──────────────────────────────────
  TASK_CREATE: "task.create",
  TASK_DISPATCH: "task.dispatch",
  TASK_DISPATCH_BLOCKED: "task.dispatch.blocked",
  TASK_DISPATCHED: "task.dispatched",
  TASK_CANCEL: "task.cancel",
  TASK_UPDATE: "task.update",

  // ─── 工作流生命周期 ────────────────────────────────
  WORKFLOW_GENERATE: "workflow.generate",
  WORKFLOW_RUN: "workflow.run",
  WORKFLOW_STARTED: "workflow.started",
  WORKFLOW_RUN_STARTED: "workflow.run.started",
  WORKFLOW_RUN_COMPLETED: "workflow.run.completed",
  WORKFLOW_RUN_ERROR: "workflow.run.error",
  WORKFLOW_RUN_FAIL: "workflow.run.fail",
  STEP_RETRY: "step.retry",
  RUN_COMPLETED: "run.completed",

  // ─── 模型路由 ──────────────────────────────────────
  MODEL_ROUTE: "model.route",

  // ─── 连接器执行 ────────────────────────────────────
  CONNECTOR_EXECUTE: "connector.execute",
  CONNECTOR_CREATE: "connector.create",
  CONNECTOR_DELETE: "delete.connector",
  CONNECTOR_TEST: "connector.test",
  CONNECTOR_AUTHORIZE: "connector.authorize",
  CONNECTOR_INITIALIZED: "connector.initialized",
  CONNECTOR_LEASE_ACQUIRED: "connector.lease.acquired",
  CONNECTOR_LEASE_REVOKED: "connector.lease.revoked",
  CONNECTOR_EMAIL_SYNC: "connector.email.sync",
  CONNECTOR_EMAIL_SYNC_FAILED: "connector.email.sync.failed",
  EMAIL_SENT: "email.sent",
  EMAIL_FAILED: "email.failed",
  EMAIL_TEMPLATE_WARNING: "email.template.warning",

  // ─── 提案生命周期 ──────────────────────────────────
  PROPOSAL_CREATE: "proposal.create",
  PROPOSAL_APPROVE: "proposal.approve",
  PROPOSAL_ROLLBACK: "proposal.rollback",
  PROPOSAL_VIEW: "proposal.view",
  PROPOSAL_GENERATION_FALLBACK: "proposal.generation.fallback",
  EVOLUTION_LOG_FAIL: "evolution.log.fail",
  EVOLUTION_PROPOSAL_ADOPTED: "evolution.proposal.adopted",
  EVOLUTION_PROPOSAL_REJECTED: "evolution.proposal.rejected",

  // ─── 审批生命周期 ──────────────────────────────────
  APPROVAL_REQUESTED: "approval.requested",
  APPROVAL_GRANTED: "approval.granted",
  APPROVAL_REJECTED: "approval.rejected",
  APPROVAL_EXPIRED: "approval.expired",
  APPROVAL_SIGNED: "approval.signed",
  APPROVAL_VERIFIED: "approval.verified",

  // ─── 自动化级别变更 ────────────────────────────────
  AUTOMATION_LEVEL_CHANGE: "automation.level.change",

  // ─── 行业包生命周期 ────────────────────────────────
  INDUSTRY_PACK_INSTALL: "industry.pack.install",
  INDUSTRY_PACK_ACTIVATE: "industry.pack.activate",
  PACK_INSTALL_STARTED: "pack.install.started",
  PACK_INSTALL_WARNING: "pack.install.warning",

  // ─── 灰度 / Canary ──────────────────────────────────
  CANARY_STARTED: "canary.started",
  CANARY_PROMOTED: "canary.promoted",
  CANARY_ABORTED: "canary.aborted",
  CANARY_AMBIGUOUS: "canary.ambiguous",
  HARNESS_CANARY_STARTED: "harness.canary.started",
  HARNESS_CANARY_ACTIVATED: "harness.canary.activated",

  // ─── 回滚 ──────────────────────────────────────────
  HARNESS_ROLLBACK_EXECUTED: "harness.rollback.executed",
  HARNESS_ROLLBACK_COMPLETED: "harness.rollback.completed",
  ROLLBACK_PROPOSAL: "rollback.proposal",

  // ─── 快照 ──────────────────────────────────────────
  HARNESS_SNAPSHOT_CREATED: "harness.snapshot.created",
  HARNESS_SNAPSHOT_RESTORED: "harness.snapshot.restored",

  // ─── 能力注册 ──────────────────────────────────────
  CAPABILITY_REGISTERED: "capability.registered",
  CAPABILITY_HEALTH_DEGRADED: "capability.health.degraded",
  CAPABILITY_WARNING: "capability.warning",
  CAPABILITY_YANKED: "capability.yanked",

  // ─── 智能体 ────────────────────────────────────────
  AGENT_CREATE: "agent.create",
  AGENT_EXECUTE: "agent.execute",
  AGENT_PROPOSE: "agent.propose",
  AGENT_DELETE: "delete.agent",
  AGENT_BOUNDARY_VIOLATION: "agent.boundary_violation",
  AGENT_BOUNDARY_UPDATE: "update.agent.boundary",

  // ─── 技能 ──────────────────────────────────────────
  SKILL_CREATE: "skill.create",
  SKILL_DELETE: "skill.delete",
  SKILL_UPDATE: "skill.update",
  SKILL_INSTALL: "skill.install",
  SKILL_TEST: "skill.test",
  SKILL_BIND_PROPOSAL: "skill.bind.proposal",

  // ─── 工具注册 ──────────────────────────────────────
  REGISTER_TOOL: "register.tool",
  GRANT_TOOL: "grant.tool",

  // ─── 记忆 ──────────────────────────────────────────
  CREATE_MEMORY: "create.memory",
  DELETE_MEMORY: "delete.memory",
  UPDATE_MEMORY: "update.memory",
  MERGE_MEMORY: "merge.memory",
  MEMORY_CREATED: "memory.created",
  MEMORY_DELETED: "memory.deleted",
  MEMORY_UPDATED: "memory.updated",
  MEMORY_ARCHIVED: "memory.archived",
  COMPRESS_MEMORY: "compress.memory",

  // ─── 会话 ──────────────────────────────────────────
  CHAT_STARTED: "chat.started",
  CONVERSATION_CREATE: "conversation.create",
  CONVERSATION_MESSAGE: "conversation.message",
  CONVERSATION_UPDATE: "conversation.update",

  // ─── 项目 ──────────────────────────────────────────
  PROJECT_CREATED: "project.created",
  PROJECT_UPDATE: "project.update",
  PROJECT_DELETE: "project.delete",

  // ─── 文件 ──────────────────────────────────────────
  FILE_UPLOAD: "file.upload",

  // ─── 评估 ──────────────────────────────────────────
  EVAL_STARTED: "EvalStarted",
  EVAL_COMPLETED: "EvalCompleted",
  EVAL_ANOMALY_DETECTED: "EvalAnomalyDetected",
  EVAL_PROPOSAL_TRIGGERED: "EvalProposalTriggered",
  EVAL_PROPOSAL_FAILED: "EvalProposalFailed",

  // ─── knowledge gap ─────────────────────────────────
  KNOWLEDGE_GAP_CREATED: "knowledge_gap.created",

  // ─── 报告 ──────────────────────────────────────────
  REPORT_GENERATE: "report.generate",

  // ─── 成员管理 ──────────────────────────────────────
  MEMBER_INVITE: "member.invite",
  MEMBER_REMOVE: "member.remove",
  MEMBER_ROLE_CHANGE: "member.role.change",

  // ─── 密钥管理 ──────────────────────────────────────
  API_KEY_CREATED: "api_key.created",
  API_KEY_DELETED: "api_key.deleted",
  SECRET_CREATED: "secret.created",
  SECRET_DELETED: "secret.deleted",

  // ─── 安全 / 权限 ───────────────────────────────────
  RBAC_DENIED: "RBAC_DENIED",
  GUARDRAIL_VIOLATION: "guardrail.violation",
  PASSWORD_CHANGED: "password.changed",

  // ─── 仪表板 ────────────────────────────────────────
  DASHBOARD_FEED_READ: "dashboard.feed.read",
  DASHBOARD_REPORTS_READ: "dashboard.reports.read",
  DASHBOARD_SILENCE_ALERTS_READ: "dashboard.silence-alerts.read",

  // ─── 激励 ──────────────────────────────────────────
  REWARD_TASK_COMPLETED: "reward.task.completed",

  // ─── 沙盒 ──────────────────────────────────────────
  SANDBOX_SUBMIT: "sandbox.submit",

  // ─── 维护 ──────────────────────────────────────────
  MAINTENANCE_CLEANUP_STARTED: "maintenance.cleanup.started",

  // ─── 业务操作 ──────────────────────────────────────
  QUOTATION_CREATE: "quotation.create",
  INQUIRY_CREATE: "inquiry.create",

  // ─── 充值 ──────────────────────────────────────────
  CREDITS_PURCHASED: "credits.purchased",

  // ─── 编排 ──────────────────────────────────────────
  ORCHESTRATION_SUBAGENT_FAILED: "orchestration.subagent.failed",

  // ─── 模型路由 (别名) ───────────────────────────────
  UPDATE_MODEL_ROUTING: "update.model-routing",
} as const

export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction]

/** §8.1 清单 — 发布审查时必须覆盖的核心审计动作集合 */
export const AUDIT_REQUIRED_ACTIONS = [
  AuditAction.WORKFLOW_GENERATE,
  AuditAction.TASK_DISPATCH,
  AuditAction.TASK_CANCEL,
  AuditAction.MODEL_ROUTE,
  AuditAction.CONNECTOR_EXECUTE,
  AuditAction.PROPOSAL_CREATE,
  AuditAction.PROPOSAL_APPROVE,
  AuditAction.PROPOSAL_ROLLBACK,
  AuditAction.INDUSTRY_PACK_INSTALL,
  AuditAction.INDUSTRY_PACK_ACTIVATE,
  AuditAction.AUTOMATION_LEVEL_CHANGE,
] as const
