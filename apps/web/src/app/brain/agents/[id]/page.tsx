import { prisma } from "@/lib/prisma";
import { serializeAgent } from "@/lib/server/agent-serializer";
import { AgentDetailClient } from "@/components/brain/agents/AgentDetailClient";
import { notFound } from "next/navigation";
import { mapAutomationToAuditRisk } from "@/types";
import type { Agent, HarnessStatusValue, AgentRiskLevel } from "@/types";

interface PageProps {
  params: Promise<{ id: string }>;
}

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

export default async function BrainAgentDetailPage({ params }: PageProps) {
  const { id } = await params;

  let agent: Agent | null = null;

  try {
    const raw = await prisma.agent.findUnique({
      where: { id, workspaceId: "default" },
    });
    if (!raw) notFound();
    agent = toAgent(raw as unknown as Record<string, unknown>);

    // 并行查询治理数据（affectedAgents 是 JSON string，需 JS 端过滤）
    const [allProposals, activeCanary] = await Promise.all([
      prisma.harnessProposal.findMany({
        where: { workspaceId: "default" },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { proposalId: true, status: true, severity: true, affectedAgents: true },
      }),
      prisma.harnessCanary.findFirst({
        where: {
          agentId: id,
          workspaceId: "default",
          status: { in: ["running", "promoting", "rolling-back"] },
        },
        orderBy: { startedAt: "desc" },
        select: { canaryId: true },
      }),
    ]);

    // JS 端过滤：affectedAgents 是 JSON 字符串数组
    const latestProposal = allProposals.find((p) => {
      try {
        const ids: unknown = JSON.parse((p.affectedAgents as string) ?? "[]");
        return Array.isArray(ids) && ids.includes(id);
      } catch {
        return false;
      }
    });

    // 注入治理字段
    agent.harnessStatus = (latestProposal?.status as HarnessStatusValue) ?? "none";
    agent.riskLevel = (latestProposal?.severity as AgentRiskLevel)
      ?? mapAutomationToAuditRisk(agent.automationLevel);
    agent.latestProposalId = latestProposal?.proposalId ?? null;
    agent.latestProposalStatus = latestProposal?.status ?? null;
    agent.activeCanaryId = activeCanary?.canaryId ?? null;
  } catch {
    notFound();
  }

  if (!agent) notFound();

  return <AgentDetailClient initialAgent={agent} />;
}
