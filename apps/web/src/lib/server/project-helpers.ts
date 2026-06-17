/**
 * 项目空间共享查询辅助函数
 *
 * —— 消除 projects/[id]/route.ts、projects/[id]/tasks/route.ts、
 *    projects/[id]/memory/route.ts 中重复出现的
 *    "prisma.project.findFirst({ where: { id, workspaceId } }) + 404 检查" 样板。
 *
 * —— AGENTS.md §4.11 数据隔离：强制 workspaceId 过滤。
 */
import { prisma } from "@/lib/prisma"
import { errorResponse } from "@/lib/api-utils"
import type { WorkspaceContext } from "@/lib/workspace"
import type { Project } from "@/generated/prisma-v2/client"

/**
 * 按 id + workspaceId 查找项目；不存在时返回 404 Response。
 *
 * @returns 项目记录（保证非 null），或 404 Response（调用方须直接 return）
 */
export async function findProjectOrThrow(
  projectId: string,
  ctx: WorkspaceContext,
): Promise<Project | Response> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId: ctx.workspaceId },
  })
  if (!project) {
    return errorResponse("项目不存在", 404)
  }
  return project
}
