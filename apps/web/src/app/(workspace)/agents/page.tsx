import { prisma } from "@/lib/prisma";
import AgentsPageClient from "./page-client";
import type { AgentData } from "./page-client";

// 服务端数据映射（与 page-client.tsx 中 toAgentData 逻辑一致）
function serverToAgentData(raw: any): AgentData {
  return {
    id: raw.id,
    name: raw.name,
    role: raw.role || "智能助手",
    status:
      raw.status === "running" || raw.status === "active"
        ? "active"
        : raw.status === "error"
          ? "error"
          : "idle",
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    taskCount: raw.taskCount || 0,
    isBuiltIn: raw.source === "builtin",
    automationLevel: raw.automationLevel ?? "L2",
  };
}

/**
 * 智能体页面 — R5 服务端直取数据
 * SSR 阶段预取智能体列表，消除客户端 API 往返与加载骨架屏
 */
export default async function AgentsPage() {
  let initialData: AgentData[] | undefined;

  try {
    const agents = await prisma.agent.findMany({
      where: { workspaceId: "default" },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    // 并行获取 taskCount（与 API route 逻辑对齐）
    const completedRuns = await prisma.workflowRun.groupBy({
      by: ["agentId"],
      where: {
        workspaceId: "default",
        status: "completed",
        agentId: { in: agents.map((a) => a.id) },
      },
      _count: { id: true },
    });
    const countMap = new Map(completedRuns.map((r: any) => [r.agentId, r._count.id]));

    initialData = agents.map((raw) => {
      let tags: string[] = [];
      try {
        const s = JSON.parse(raw.bindSkills || "[]");
        tags = Array.isArray(s) ? s : [];
      } catch {}
      return {
        ...serverToAgentData(raw),
        tags,
        taskCount: countMap.get(raw.id) || 0,
      };
    });
  } catch {
    // 降级为客户端加载
  }

  return <AgentsPageClient initialData={initialData} />;
}
