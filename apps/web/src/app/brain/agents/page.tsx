import { prisma } from "@/lib/prisma";
import { serializeAgent } from "@/lib/server/agent-serializer";
import { AgentListClient } from "@/components/brain/agents/AgentListClient";
import { mapAutomationToAuditRisk } from "@/types";
import type { Agent, HarnessStatusValue, AgentRiskLevel } from "@/types";

/** 格式化为 Agent 前端类型 */
function toAgent(raw: Record<string, unknown>): Agent {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = serializeAgent(raw) as any;
  const stats = (s.stats ?? { todayTasks: 0, successRate: 0, avgDuration: "0s" }) as {
    todayTasks: number;
    successRate: number;
    avgDuration: string;
  };
  return {
    id: s.id as string,
    name: s.name as string,
    role: s.role as string,
    description: (s.description as string) ?? "",
    status: (s.status as Agent["status"]) ?? "idle",
    source: (s.source as Agent["source"]) ?? "custom",
    category: (s.category as string[]) ?? [],
    bindSkills: (s.bindSkills as string[]) ?? [],
    bindConnectors: (s.bindConnectors as string[]) ?? [],
    memoryPermission: (s.memoryPermission as Agent["memoryPermission"]) ?? "read",
    harnessVersion: (s.harnessVersion as string) ?? "v1.0.0",
    automationLevel: (s.automationLevel as Agent["automationLevel"]) ?? "L2",
    canDo: (s.canDo as string[]) ?? [],
    cannotDo: (s.cannotDo as string[]) ?? [],
    stats: {
      todayTasks: stats.todayTasks ?? 0,
      successRate: stats.successRate ?? 0,
      avgDuration: stats.avgDuration ?? "0s",
    },
    lastActive: (s.lastActive as string) ?? "",
    createdAt: (s.createdAt as string) ?? "",
  };
}

/**
 * 按 affectedAgents（JSON 字符串数组）匹配 agentId。
 * affectedAgents 在 DB 中是 JSON string，形如 `["agent-aaa","agent-bbb"]`，
 * 需要先 JSON.parse 再 Array.includes。
 */
function proposalMatchesAgent(affectedAgents: unknown, agentId: string): boolean {
  if (!affectedAgents) return false;
  try {
    const raw = typeof affectedAgents === "string" ? affectedAgents : JSON.stringify(affectedAgents);
    const ids: unknown = JSON.parse(raw);
    return Array.isArray(ids) && ids.includes(agentId);
  } catch {
    return false;
  }
}

export default async function BrainAgentsPage() {
  let agents: Agent[] = [];
  let error: string | null = null;

  try {
    const rawAgents = await prisma.agent.findMany({
      where: { workspaceId: "default" },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    agents = rawAgents.map((r) => toAgent(r as unknown as Record<string, unknown>));

    // 批量拉取所有 agent 的最新提案（一次查询，避免 N+1）
    const agentIds = agents.map((a) => a.id);
    if (agentIds.length > 0) {
      const allProposals = await prisma.harnessProposal.findMany({
        where: {
          workspaceId: "default",
        },
        orderBy: { createdAt: "desc" },
        select: {
          proposalId: true,
          status: true,
          severity: true,
          affectedAgents: true,
        },
      });

      // 按 agentId 分组最新提案
      const agentProposalMap = new Map<string, { proposalId: string; status: string; severity: string }>();
      for (const p of allProposals) {
        for (const agentId of agentIds) {
          if (!agentProposalMap.has(agentId) && proposalMatchesAgent(p.affectedAgents, agentId)) {
            agentProposalMap.set(agentId, {
              proposalId: p.proposalId,
              status: p.status,
              severity: p.severity,
            });
          }
        }
      }

      // 注入治理字段
      for (const agent of agents) {
        const proposal = agentProposalMap.get(agent.id);
        agent.harnessStatus = (proposal?.status as HarnessStatusValue) ?? "none";
        agent.riskLevel = (proposal?.severity as AgentRiskLevel)
          ?? mapAutomationToAuditRisk(agent.automationLevel);
        agent.latestProposalId = proposal?.proposalId ?? null;
        agent.latestProposalStatus = proposal?.status ?? null;
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : "加载智能体列表失败";
  }

  return <AgentListClient initialAgents={agents} fetchError={error} />;
}
