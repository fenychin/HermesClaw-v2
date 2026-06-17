/**
 * Workflow Handler — 工作流核心业务逻辑
 *
 * 从 apps/web/src/app/api/workflows/[id]/route.ts 下沉至此
 *
 * 三域归属：Hermes Control Kernel
 */

export interface WorkflowHandlerDeps {
  prisma: any;
}

// ==============================
// Workflow CRUD
// ==============================

export interface WorkflowListInput {
  workspaceId: string;
  page?: number;
  limit?: number;
  status?: string;
}

export async function listWorkflows(
  input: WorkflowListInput,
  deps: WorkflowHandlerDeps,
): Promise<any> {
  const p = deps.prisma;
  const where: any = { workspaceId: input.workspaceId };
  if (input.status) where.status = input.status;
  const [items, total] = await Promise.all([
    p.workflow.findMany({ where, orderBy: { updatedAt: "desc" }, skip: ((input.page ?? 1) - 1) * (input.limit ?? 20), take: input.limit ?? 20 }),
    p.workflow.count({ where }),
  ]);
  return {
    items: items.map((w: any) => {
      let nodes: any = []; let edges: any = [];
      try { nodes = typeof w.nodes === "string" ? JSON.parse(w.nodes) : w.nodes ?? []; } catch {}
      try { edges = typeof w.edges === "string" ? JSON.parse(w.edges) : w.edges ?? []; } catch {}
      return { id: w.id, name: w.name, description: w.description, status: w.status, nodes, edges, createdAt: w.createdAt?.toISOString(), updatedAt: w.updatedAt?.toISOString() };
    }),
    total, page: input.page ?? 1, limit: input.limit ?? 20,
  };
}

export interface WorkflowGetInput {
  id: string;
  workspaceId: string;
}

export async function getWorkflow(
  input: WorkflowGetInput,
  deps: WorkflowHandlerDeps,
): Promise<any> {
  const w = await deps.prisma.workflow.findUnique({ where: { id: input.id } });
  if (!w || w.workspaceId !== input.workspaceId) return null;
  let nodes: any = []; let edges: any = [];
  try { nodes = typeof w.nodes === "string" ? JSON.parse(w.nodes) : w.nodes ?? []; } catch {}
  try { edges = typeof w.edges === "string" ? JSON.parse(w.edges) : w.edges ?? []; } catch {}
  return { ...w, nodes, edges, createdAt: w.createdAt?.toISOString(), updatedAt: w.updatedAt?.toISOString() };
}

// ==============================
// Workflow Run
// ==============================

export interface WorkflowRunInput {
  workflowId: string;
  workspaceId: string;
  input?: Record<string, unknown>;
  userId?: string;
}

export interface WorkflowRunListInput {
  workspaceId: string;
  workflowId?: string;
  page?: number;
  limit?: number;
  status?: string;
}

export async function listWorkflowRuns(
  input: WorkflowRunListInput,
  deps: WorkflowHandlerDeps,
): Promise<any> {
  const p = deps.prisma;
  const where: any = { workspaceId: input.workspaceId };
  if (input.workflowId) where.workflowId = input.workflowId;
  if (input.status) where.status = input.status;
  const [items, total] = await Promise.all([
    p.workflowRun.findMany({ where, orderBy: { createdAt: "desc" }, skip: ((input.page ?? 1) - 1) * (input.limit ?? 20), take: input.limit ?? 20 }),
    p.workflowRun.count({ where }),
  ]);
  return {
    items: items.map((r: any) => ({ ...r, createdAt: r.createdAt?.toISOString(), startedAt: r.startedAt?.toISOString(), completedAt: r.completedAt?.toISOString() })),
    total, page: input.page ?? 1, limit: input.limit ?? 20,
  };
}

export interface WorkflowRunGetInput {
  runId: string;
  workspaceId: string;
}

export async function getWorkflowRun(
  input: WorkflowRunGetInput,
  deps: WorkflowHandlerDeps,
): Promise<any> {
  const p = deps.prisma;
  const run = await p.workflowRun.findUnique({ where: { id: input.runId } });
  if (!run || run.workspaceId !== input.workspaceId) return null;
  return { ...run, createdAt: run.createdAt?.toISOString(), startedAt: run.startedAt?.toISOString(), completedAt: run.completedAt?.toISOString() };
}

export async function cancelWorkflowRun(
  input: WorkflowRunGetInput,
  deps: WorkflowHandlerDeps,
): Promise<{ ok: boolean; message: string }> {
  const p = deps.prisma;
  const run = await p.workflowRun.findUnique({ where: { id: input.runId } });
  if (!run || run.workspaceId !== input.workspaceId) return { ok: false, message: "运行记录不存在" };
  if (run.status !== "running") return { ok: false, message: "只能取消运行中的工作流" };
  await p.workflowRun.update({ where: { id: input.runId }, data: { status: "cancelled", completedAt: new Date() } });
  return { ok: true, message: "已取消" };
}
