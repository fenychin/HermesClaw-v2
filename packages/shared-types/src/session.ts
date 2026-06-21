/** 前端会话上下文桥接对象。
 *  只传递 agentId，不传 AgentPolicy 完整体。
 *  AGENTS.md §3.3: agentId 是 TaskEnvelope 的必备字段，
 *  由前端在发起 Intent 时携带，Hermes 后端据此填充完整策略。
 */
export interface SessionContext {
  sessionId: string;
  workspaceId: string;
  agentId: string;          // 仅 ID，不含 policy 对象
  industryId: string;       // 由 workspaceId 关联的 industry pack
  createdAt: string;        // ISO 8601
}

/** 用户发起 Intent 时的前端请求体。
 *  automationLevel / riskLevel / policySnapshotVersion 字段
 *  由 Hermes 后端填充，前端不得传递这三个字段。
 */
export interface IntentPayload {
  input: string;
  sessionId: string;
  agentId: string;
  workspaceId: string;
}
