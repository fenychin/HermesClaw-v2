export async function memoryRead(
  prisma: any,
  workspaceId: string,
  params: { scope?: string | null; projectId?: string | null; page?: number; limit?: number }
) {
  const page = params.page || 1
  const limit = params.limit || 30
  const skip = (page - 1) * limit

  const where: Record<string, any> = {
    workspaceId,
    status: "active",
  }

  if (params.scope) {
    if (params.scope === "org") {
      where.type = "long"
    } else if (params.scope === "project") {
      where.type = "mid"
      if (params.projectId) {
        where.projectId = params.projectId
      }
    } else if (params.scope === "session") {
      where.type = "short"
    }
  } else if (params.projectId) {
    where.projectId = params.projectId
  }

  const [memories, total] = await Promise.all([
    prisma.memory.findMany({
      where,
      include: {
        _count: {
          select: { revisions: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.memory.count({ where }),
  ])

  const serialized = memories.map((m: any) => {
    let parsedTags = []
    try {
      parsedTags = JSON.parse(m.tags || "[]")
    } catch {}

    return {
      id: m.id,
      workspaceId: m.workspaceId,
      projectId: m.projectId,
      type: m.type,
      content: m.content.length > 200 ? m.content.substring(0, 200) + "..." : m.content,
      rawContent: m.content,
      summary: m.summary,
      source: m.source,
      tags: parsedTags,
      version: m.version,
      revisionCount: m._count.revisions,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
    }
  })

  return { memories: serialized, total, page, limit }
}

export async function memoryWrite(
  createMemoryFn: (workspaceId: string, data: any, actor: string) => Promise<any>,
  workspaceId: string,
  data: any,
  actor: string
): Promise<any> {
  return createMemoryFn(workspaceId, data, actor)
}
