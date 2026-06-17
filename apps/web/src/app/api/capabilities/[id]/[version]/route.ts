import { ApiResponse } from '@/lib/server/api-response'; import { withRBAC, type RouteContext } from '@/lib/server/api-handler'
import { resolveCapability, CapabilityNotFoundError, CapabilityYankedError } from '@/lib/server/capability-registry'
import type { WorkspaceContext } from '@/lib/workspace'; import { prisma } from '@/lib/prisma'
import type { CapabilityType } from '@hermesclaw/event-contracts'

export const GET = withRBAC(async (_request: Request, ctx: WorkspaceContext, routeCtx: RouteContext<{ id: string; version: string }>) => {
  try {
    const { id, version } = await routeCtx.params
    const record = await prisma.capabilityVersion.findFirst({ where: { capabilityId: id, workspaceId: ctx.workspaceId } })
    if (!record) return ApiResponse.error(`Capability not found: ${id}`, 404)
    const resolved = await resolveCapability({ capabilityId: id, capabilityType: record.capabilityType as CapabilityType, version, workspaceId: ctx.workspaceId })
    return ApiResponse.ok(resolved.registration)
  } catch (error) {
    if (error instanceof CapabilityNotFoundError) return ApiResponse.error(error.message, 404)
    if (error instanceof CapabilityYankedError) return ApiResponse.error(error.message, 410)
    return ApiResponse.error(error instanceof Error ? error.message : '未知错误', 500)
  }
}, 'VIEWER')
