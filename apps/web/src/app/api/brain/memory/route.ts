import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { successResponse, errorResponse } from "@/lib/api-utils";
import { buildWorkspaceContext } from "@/lib/workspace";

export async function GET(request: Request) {
  try {
    const ctx = await buildWorkspaceContext(request);
    const wsId = new URL(request.url).searchParams.get("workspaceId") || ctx.workspaceId;

    const memories = await prisma.memory.findMany({
      where: {
        workspaceId: wsId,
        type: "long",
        status: "active",
      },
      orderBy: { updatedAt: "desc" },
    });

    const formatted = memories.map((m) => {
      let tags: string[] = [];
      try {
        tags = JSON.parse(m.tags || "[]");
      } catch {
        tags = [];
      }
      return {
        id: m.id,
        type: m.type,
        content: m.content,
        summary: m.summary,
        source: m.source,
        relatedProject: m.relatedProject,
        relatedAgent: m.relatedAgent,
        confidence: m.confidence,
        frozen: m.frozen,
        tags,
        version: m.version,
        createdAt: m.createdAt.toISOString(),
        updatedAt: m.updatedAt.toISOString(),
      };
    });

    return successResponse({ memories: formatted });
  } catch (error) {
    logger.error("GET /api/brain/memory: 失败", {
      error: error instanceof Error ? error.message : "未知错误",
    });
    return errorResponse("服务器内部错误");
  }
}
