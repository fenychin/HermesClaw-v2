/**
 * Brain Handler — 大脑查询/规划核心业务逻辑
 *
 * 从 apps/web/src/app/api/brain/[id]/route.ts 下沉至此
 *
 * 三域归属：Hermes Control Kernel
 */

export interface BrainHandlerDeps {
  prisma: any;
}

export interface BrainStatsInput {
  workspaceId: string;
}

export async function getBrainStats(
  input: BrainStatsInput,
  deps: BrainHandlerDeps,
): Promise<any> {
  const { workspaceId } = input;
  const p = deps.prisma;
  const [
    memoryCount, connectorCount, skillCount, agentCount,
    workflowCount, inquiryCount, recentLogs,
  ] = await Promise.all([
    p.memory.count({ where: { workspaceId } }),
    p.connector.count({ where: { workspaceId } }),
    p.skill.count({ where: { workspaceId } }),
    p.agent.count({ where: { workspaceId } }),
    p.workflow.count({ where: { workspaceId } }),
    p.inquiry.count({ where: { workspaceId } }),
    p.agentLog.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  return {
    memoryCount, connectorCount, skillCount, agentCount,
    workflowCount, inquiryCount,
    recentLogs: recentLogs.map((l: any) => ({
      id: l.id, taskName: l.taskName, status: l.status,
      duration: l.duration, createdAt: l.createdAt?.toISOString(),
    })),
  };
}

export interface BrainOverviewInput {
  workspaceId: string;
}

export async function getBrainOverview(
  input: BrainOverviewInput,
  deps: BrainHandlerDeps,
): Promise<any> {
  const { workspaceId } = input;
  const p = deps.prisma;
  const [memories, connectors, skills, agents, workflows, recentMemoryCount, connectorStatuses] = await Promise.all([
    p.memory.findMany({ where: { workspaceId, status: "active" }, orderBy: { updatedAt: "desc" }, take: 20, include: { _count: { select: { revisions: true } } } }),
    p.connector.findMany({ where: { workspaceId }, orderBy: { updatedAt: "desc" } }),
    p.skill.findMany({ where: { workspaceId }, orderBy: { updatedAt: "desc" } }),
    p.agent.findMany({ where: { workspaceId }, orderBy: { updatedAt: "desc" } }),
    p.workflow.findMany({ where: { workspaceId }, orderBy: { updatedAt: "desc" }, take: 10 }),
    p.memory.count({ where: { workspaceId, status: "active", createdAt: { gte: new Date(Date.now() - 7 * 86400000) } } }),
    p.connector.groupBy({ by: ["status"], where: { workspaceId }, _count: true }),
  ]);

  const serialize = (m: any) => {
    let tags: any[] = [];
    try { tags = JSON.parse(m.tags || "[]"); } catch {}
    return {
      id: m.id, type: m.type, content: m.content?.length > 200 ? m.content.substring(0, 200) + "..." : m.content,
      summary: m.summary, source: m.source, tags, version: m.version,
      revisionCount: m._count?.revisions ?? 0,
      createdAt: m.createdAt?.toISOString(), updatedAt: m.updatedAt?.toISOString(),
    };
  };

  return {
    memories: memories.map(serialize),
    connectors: connectors.map((c: any) => {
      let perms: any[] = []; let agents: any[] = [];
      try { perms = JSON.parse(c.permissions || "[]"); } catch {}
      try { agents = JSON.parse(c.usedByAgents || "[]"); } catch {}
      return { id: c.id, name: c.name, status: c.status, category: c.category, description: c.description, permissions: perms, usedByAgents: agents, createdAt: c.createdAt?.toISOString(), updatedAt: c.updatedAt?.toISOString() };
    }),
    skills: skills.map((s: any) => {
      let agents: any[] = []; let scenarios: any[] = [];
      try { agents = JSON.parse(s.usedByAgents || "[]"); } catch {}
      try { scenarios = JSON.parse(s.scenarios || "[]"); } catch {}
      return { id: s.id, name: s.name, description: s.description, version: s.version, category: s.category, usedByAgents: agents, scenarios, createdAt: s.createdAt?.toISOString(), updatedAt: s.updatedAt?.toISOString() };
    }),
    agents,
    workflows: workflows.map((w: any) => {
      let nodes: any[] = []; let edges: any[] = [];
      try { nodes = typeof w.nodes === "string" ? JSON.parse(w.nodes) : w.nodes; } catch {}
      try { edges = typeof w.edges === "string" ? JSON.parse(w.edges) : w.edges; } catch {}
      return { id: w.id, name: w.name, description: w.description, status: w.status, nodes, edges, createdAt: w.createdAt?.toISOString(), updatedAt: w.updatedAt?.toISOString() };
    }),
    recentMemoryCount,
    connectorStatuses: connectorStatuses.map((s: any) => ({ status: s.status, count: s._count })),
  };
}
