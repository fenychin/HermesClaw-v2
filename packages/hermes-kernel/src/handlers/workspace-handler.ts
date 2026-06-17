/**
 * Workspace Handler — 工作空间核心业务逻辑
 *
 * 从 apps/web/src/app/api/workspace/[id]/route.ts 下沉至此
 *
 * 三域归属：Hermes Control Kernel
 */

export interface WorkspaceHandlerDeps {
  prisma: any;
}

export interface WorkspaceMembersInput {
  workspaceId: string;
  page?: number;
  limit?: number;
}

export async function listWorkspaceMembers(
  input: WorkspaceMembersInput,
  deps: WorkspaceHandlerDeps,
): Promise<any> {
  const p = deps.prisma;
  const page = input.page ?? 1;
  const limit = input.limit ?? 50;
  const [members, total] = await Promise.all([
    p.workspaceMember.findMany({
      where: { workspaceId: input.workspaceId },
      include: { user: { select: { id: true, name: true, email: true, image: true } } },
      skip: (page - 1) * limit, take: limit,
      orderBy: { createdAt: "asc" },
    }),
    p.workspaceMember.count({ where: { workspaceId: input.workspaceId } }),
  ]);
  return {
    items: members.map((m: any) => ({
      id: m.id, role: m.role,
      user: m.user ? { id: m.user.id, name: m.user.name, email: m.user.email, image: m.user.image } : null,
      createdAt: m.createdAt?.toISOString(),
    })),
    total, page, limit,
  };
}

export interface WorkspaceSettingsInput {
  workspaceId: string;
}

export async function getWorkspaceSettings(
  input: WorkspaceSettingsInput,
  deps: WorkspaceHandlerDeps,
): Promise<any> {
  const p = deps.prisma;
  const settings = await p.workspaceSettings.findUnique({ where: { workspaceId: input.workspaceId } });
  return settings ? { ...settings, createdAt: settings.createdAt?.toISOString(), updatedAt: settings.updatedAt?.toISOString() } : null;
}

export interface WorkspaceSettingsUpdateInput {
  workspaceId: string;
  updates: Record<string, unknown>;
}

export async function updateWorkspaceSettings(
  input: WorkspaceSettingsUpdateInput,
  deps: WorkspaceHandlerDeps,
): Promise<any> {
  const p = deps.prisma;
  const settings = await p.workspaceSettings.upsert({
    where: { workspaceId: input.workspaceId },
    update: input.updates,
    create: { workspaceId: input.workspaceId, ...input.updates },
  });
  return { ...settings, createdAt: settings.createdAt?.toISOString(), updatedAt: settings.updatedAt?.toISOString() };
}
