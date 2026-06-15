import { ApiResponse } from '@/lib/server/api-response'
import { withRBAC, type RouteContext } from '@/lib/server/api-handler'
import { resolveCapability, CapabilityNotFoundError, CapabilityYankedError } from '@/lib/server/capability-registry'
import type { WorkspaceContext } from '@/lib/workspace'
import { prisma } from '@/lib/prisma'
import type { CapabilityType } from '@/lib/server/contracts'

// GET /api/capabilities/[id]
// 解析并获取该能力的最新活跃 (active) 版本详情
export const GET = withRBAC(
  async (request: Request, ctx: WorkspaceContext, routeCtx: RouteContext<{ id: string }>) => {
    try {
      const { id } = await routeCtx.params

      // 通过数据库反查该能力对应的 capabilityType
      const record = await prisma.capabilityVersion.findFirst({
        where: { capabilityId: id, workspaceId: ctx.workspaceId }
      })
      if (!record) {
        return ApiResponse.error(`Capability not found: ${id}`, 404)
      }

      const resolved = await resolveCapability({
        capabilityId: id,
        capabilityType: record.capabilityType as CapabilityType,
        workspaceId: ctx.workspaceId
      })

      return ApiResponse.ok(resolved.registration)
    } catch (error) {
      if (error instanceof CapabilityNotFoundError) {
        return ApiResponse.error(error.message, 404)
      }
      if (error instanceof CapabilityYankedError) {
        return ApiResponse.error(error.message, 410) // 已经紧急下线 (Gone / 410) 或直接返回 400
      }
      const msg = error instanceof Error ? error.message : '未知错误'
      return ApiResponse.error(msg, 500)
    }
  },
  'VIEWER'
)
