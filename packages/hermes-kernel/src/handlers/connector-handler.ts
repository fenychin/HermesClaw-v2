/**
 * Connector Handler — 连接器核心业务逻辑
 *
 * 从 apps/web/src/app/api/connectors/[id]/route.ts 下沉至此
 *
 * 三域归属：Hermes Control Kernel
 */

export interface ConnectorHandlerDeps {
  prisma: any;
}

export interface ConnectorListInput {
  workspaceId: string;
  page?: number;
  limit?: number;
}

export interface ConnectorGetInput {
  id: string;
  workspaceId: string;
}

export interface ConnectorCreateInput {
  workspaceId: string;
  name: string;
  iconEmoji?: string;
  description?: string;
  status?: string;
  category: string;
  permissions?: string[];
  usedByAgents?: string[];
}

export interface ConnectorUpdateInput {
  id: string;
  workspaceId: string;
  status?: string;
  name?: string;
  description?: string;
}

export async function listConnectors(
  input: ConnectorListInput,
  deps: ConnectorHandlerDeps,
): Promise<any> {
  const p = deps.prisma;
  const where: any = { workspaceId: input.workspaceId };
  const page = input.page ?? 1;
  const limit = input.limit ?? 20;
  const [items, total] = await Promise.all([
    p.connector.findMany({ where, orderBy: { updatedAt: "desc" }, skip: (page - 1) * limit, take: limit }),
    p.connector.count({ where }),
  ]);
  return {
    items: items.map((c: any) => serializeConnector(c)),
    total, page, limit,
  };
}

export async function getConnector(
  input: ConnectorGetInput,
  deps: ConnectorHandlerDeps,
): Promise<any> {
  const c = await deps.prisma.connector.findUnique({ where: { id: input.id } });
  if (!c || c.workspaceId !== input.workspaceId) return null;
  return serializeConnector(c);
}

export async function createConnector(
  input: ConnectorCreateInput,
  deps: ConnectorHandlerDeps,
): Promise<any> {
  const id = crypto.randomUUID();
  return deps.prisma.connector.create({
    data: {
      id, workspaceId: input.workspaceId,
      name: input.name, iconEmoji: input.iconEmoji ?? "🔌",
      description: input.description ?? "", status: input.status ?? "available",
      category: input.category,
      permissions: JSON.stringify(input.permissions ?? []),
      usedByAgents: JSON.stringify(input.usedByAgents ?? []),
      lastSync: null,
    },
  });
}

export async function updateConnector(
  input: ConnectorUpdateInput,
  deps: ConnectorHandlerDeps,
): Promise<any> {
  const existing = await deps.prisma.connector.findUnique({ where: { id: input.id } });
  if (!existing || existing.workspaceId !== input.workspaceId) throw new Error("Connector 不存在");
  const data: any = {};
  if (input.status !== undefined) data.status = input.status;
  if (input.name !== undefined) data.name = input.name;
  if (input.description !== undefined) data.description = input.description;
  return deps.prisma.connector.update({ where: { id: input.id }, data });
}

export interface ConnectorAuthorizeInput {
  id: string;
  workspaceId: string;
}

export async function authorizeConnector(
  input: ConnectorAuthorizeInput,
  deps: ConnectorHandlerDeps,
): Promise<{ ok: boolean; message: string }> {
  const c = await deps.prisma.connector.findUnique({ where: { id: input.id } });
  if (!c || c.workspaceId !== input.workspaceId) return { ok: false, message: "连接器不存在" };
  if (c.status !== "available") return { ok: false, message: "连接器状态不是 available" };
  await deps.prisma.connector.update({ where: { id: input.id }, data: { status: "connected" } });
  return { ok: true, message: "已授权" };
}

// ==============================
// 共享序列化
// ==============================

function parseJsonField<T>(v: string | null, fallback: T): T {
  if (!v) return fallback;
  try { return JSON.parse(v) as T; } catch { return fallback; }
}

function serializeConnector(c: any) {
  return {
    ...c,
    permissions: parseJsonField(c.permissions, []),
    usedByAgents: parseJsonField(c.usedByAgents, []),
    createdAt: c.createdAt?.toISOString(), updatedAt: c.updatedAt?.toISOString(),
    lastSync: c.lastSync?.toISOString() ?? null,
  };
}
