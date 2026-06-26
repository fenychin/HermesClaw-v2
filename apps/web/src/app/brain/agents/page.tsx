import { prisma } from "@/lib/prisma";
import { serializeAgent } from "@/lib/server/agent-serializer";
import { AgentListClient } from "@/components/brain/agents/AgentListClient";
import type { Agent } from "@/types";

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
  } catch (e) {
    error = e instanceof Error ? e.message : "加载智能体列表失败";
  }

  return <AgentListClient initialAgents={agents} fetchError={error} />;
}
