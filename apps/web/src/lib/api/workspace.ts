import type { IntentPayload, SessionContext } from "@hermesclaw/shared-types";

export interface SkillBindingPatch {
  skillId: string;
  enabled: boolean;
}

export interface AgentTemplateSummary {
  id: string;
  name: string;
  role: string;
  description: string;
  tags: string[];
}

/** POST /api/sessions — 创建新会话，切换 Agent 时必须调用此接口创建新 session
 *  ⚠️ 禁止复用旧 sessionId 来切换 agentId（CLAUDE.md §2.4 会话前缀缓存保护）
 */
export async function createSession(
  agentId: string,
  workspaceId: string
): Promise<SessionContext> {
  const res = await fetch("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentId, workspaceId }),
  });
  if (!res.ok) throw new Error("Failed to create session");
  return res.json();
}

/** POST /api/sessions/{sessionId}/intents — 发起业务目标
 *  Hermes 后端负责填充 automationLevel / riskLevel / policySnapshotVersion
 *  前端只传 input + agentId + workspaceId
 */
export async function submitIntent(payload: IntentPayload): Promise<{ taskId: string }> {
  const res = await fetch(`/api/sessions/${payload.sessionId}/intents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: payload.input,
      agentId: payload.agentId,
      workspaceId: payload.workspaceId,
    }),
  });
  if (!res.ok) throw new Error("Failed to submit intent");
  return res.json();
}

/** GET /api/agents — 获取 AgentTemplate 摘要列表（配置态）*/
export async function listAgents(workspaceId: string): Promise<AgentTemplateSummary[]> {
  const res = await fetch(`/api/agents?workspaceId=${workspaceId}`);
  if (!res.ok) throw new Error("Failed to fetch agents");
  return res.json();
}

/** PATCH /api/agents/{agentId}/skill-bindings — 更新技能绑定（配置态）
 *  注意：这是 Harness 对象变更，后端会走 Proposal 流程
 */
export async function updateSkillBindings(
  agentId: string,
  skillBindings: SkillBindingPatch[]
): Promise<{ proposalId: string }> {
  const res = await fetch(`/api/agents/${agentId}/skill-bindings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ skillBindings }),
  });
  if (!res.ok) throw new Error("Failed to update skill bindings");
  return res.json();
}
