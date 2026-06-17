/**
 * Agent Handler — 智能体核心业务逻辑
 *
 * 从 apps/web/src/app/api/agents/[id]/route.ts 下沉至此
 *
 * 三域归属：Hermes Control Kernel
 */

export interface AgentHandlerDeps {
  prisma: any;
  /** LLM 调用（用于 agent execute） */
  callLlm?: (params: {
    provider: string;
    model: string;
    systemPrompt: string;
    userPrompt: string;
  }) => Promise<string>;
  /** 模型策略路由 */
  selectModel?: (ctx: {
    taskType: string;
    riskLevel: string;
    estimatedTokens: number;
    workspaceId: string;
  }) => Promise<{ provider: string; model: string; reason: string }>;
}

export interface AgentListInput {
  workspaceId: string;
  page?: number;
  limit?: number;
  status?: string;
}

export interface AgentCreateInput {
  workspaceId: string;
  name: string;
  role: string;
  description?: string;
  status?: string;
  source?: string;
  category?: string[];
  bindSkills?: string[];
  bindConnectors?: string[];
  memoryPermission?: string;
  harnessVersion?: string;
  automationLevel?: string;
  canDo?: string[];
  cannotDo?: string[];
}

export interface AgentUpdateInput {
  id: string;
  workspaceId: string;
  name?: string;
  role?: string;
  description?: string;
  status?: string;
  bindSkills?: string[];
  bindConnectors?: string[];
  memoryPermission?: string;
  canDo?: string[];
  cannotDo?: string[];
}

export interface AgentExecuteInput {
  id: string;
  workspaceId: string;
  action: string;
}

export async function listAgents(
  input: AgentListInput,
  deps: AgentHandlerDeps,
): Promise<any> {
  const p = deps.prisma;
  const where: any = { workspaceId: input.workspaceId };
  if (input.status) where.status = input.status;
  const page = input.page ?? 1;
  const limit = input.limit ?? 20;
  const [items, total] = await Promise.all([
    p.agent.findMany({ where, orderBy: { updatedAt: "desc" }, skip: (page - 1) * limit, take: limit }),
    p.agent.count({ where }),
  ]);
  return {
    items: items.map((a: any) => {
      let categories: any[] = []; let skills: any[] = []; let connectors: any[] = [];
      try { categories = JSON.parse(a.category || "[]"); } catch {}
      try { skills = JSON.parse(a.bindSkills || "[]"); } catch {}
      try { connectors = JSON.parse(a.bindConnectors || "[]"); } catch {}
      try {
        return {
          ...a, category: categories, bindSkills: skills, bindConnectors: connectors,
          canDo: parseJsonField(a.canDo, []), cannotDo: parseJsonField(a.cannotDo, []),
          statsJson: parseJsonField(a.statsJson, {}),
          createdAt: a.createdAt?.toISOString(), updatedAt: a.updatedAt?.toISOString(),
        };
      } catch { return a; }
    }),
    total, page, limit,
  };
}

export async function getAgent(
  input: { id: string; workspaceId: string },
  deps: AgentHandlerDeps,
): Promise<any> {
  const a = await deps.prisma.agent.findUnique({ where: { id: input.id } });
  if (!a || a.workspaceId !== input.workspaceId) return null;
  let categories: any[] = [], skills: any[] = [], connectors: any[] = [];
  try { categories = JSON.parse(a.category || "[]"); } catch {}
  try { skills = JSON.parse(a.bindSkills || "[]"); } catch {}
  try { connectors = JSON.parse(a.bindConnectors || "[]"); } catch {}
  return {
    ...a, category: categories, bindSkills: skills, bindConnectors: connectors,
    canDo: parseJsonField(a.canDo, []), cannotDo: parseJsonField(a.cannotDo, []),
    statsJson: parseJsonField(a.statsJson, {}),
    createdAt: a.createdAt?.toISOString(), updatedAt: a.updatedAt?.toISOString(),
  };
}

export async function createAgent(
  input: AgentCreateInput,
  deps: AgentHandlerDeps,
): Promise<any> {
  const id = crypto.randomUUID();
  const data: any = {
    id, workspaceId: input.workspaceId, name: input.name, role: input.role,
    description: input.description ?? "", status: input.status ?? "idle",
    source: input.source ?? "custom",
    category: JSON.stringify(input.category ?? []),
    bindSkills: JSON.stringify(input.bindSkills ?? []),
    bindConnectors: JSON.stringify(input.bindConnectors ?? []),
    memoryPermission: input.memoryPermission ?? "read",
    harnessVersion: input.harnessVersion ?? "v1.0.0",
    automationLevel: input.automationLevel ?? "L2",
    canDo: JSON.stringify(input.canDo ?? []),
    cannotDo: JSON.stringify(input.cannotDo ?? []),
    statsJson: JSON.stringify({}),
  };
  return deps.prisma.agent.create({ data });
}

export async function updateAgent(
  input: AgentUpdateInput,
  deps: AgentHandlerDeps,
): Promise<any> {
  const existing = await deps.prisma.agent.findUnique({ where: { id: input.id } });
  if (!existing || existing.workspaceId !== input.workspaceId) throw new Error("Agent 不存在");
  const data: any = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.role !== undefined) data.role = input.role;
  if (input.description !== undefined) data.description = input.description;
  if (input.status !== undefined) data.status = input.status;
  if (input.bindSkills !== undefined) data.bindSkills = JSON.stringify(input.bindSkills);
  if (input.bindConnectors !== undefined) data.bindConnectors = JSON.stringify(input.bindConnectors);
  if (input.memoryPermission !== undefined) data.memoryPermission = input.memoryPermission;
  if (input.canDo !== undefined) data.canDo = JSON.stringify(input.canDo);
  if (input.cannotDo !== undefined) data.cannotDo = JSON.stringify(input.cannotDo);
  return deps.prisma.agent.update({ where: { id: input.id }, data });
}

export async function executeAgent(
  input: AgentExecuteInput,
  deps: AgentHandlerDeps,
): Promise<{ result: string }> {
  const agent = await deps.prisma.agent.findUnique({ where: { id: input.id } });
  if (!agent || agent.workspaceId !== input.workspaceId) {
    throw new Error("Agent 不存在");
  }
  if (!deps.callLlm || !deps.selectModel) {
    throw new Error("Agent 执行需要 LLM 能力，请注入 callLlm / selectModel");
  }
  const systemPrompt = `你是 ${agent.name}，角色是 ${agent.role}。${agent.description || ""}。请用中文回复。`;
  const decision = await deps.selectModel({
    taskType: "chat", riskLevel: "low",
    estimatedTokens: Math.ceil((systemPrompt.length + input.action.length) / 4),
    workspaceId: input.workspaceId,
  });
  const result = await deps.callLlm({
    provider: decision.provider, model: decision.model,
    systemPrompt, userPrompt: input.action,
  });
  return { result };
}

function parseJsonField(v: string | null, fallback: any): any {
  if (!v) return fallback;
  try { return JSON.parse(v); } catch { return fallback; }
}
