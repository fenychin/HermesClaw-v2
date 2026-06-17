import { ApiResponse } from '@/lib/server/api-response'; import { withRBAC } from '@/lib/server/api-handler'
import { listCapabilities, registerCapability, InvalidVersionError, CapabilityAlreadyRegisteredError, CapabilityNotFoundError } from '@/lib/server/capability-registry'
import type { WorkspaceContext } from '@/lib/workspace'; import { z } from 'zod'

const RegisterSchema = z.object({
  capabilityId: z.string(), capabilityType: z.enum(['skill', 'connector', 'workflow']), version: z.string(),
  displayName: z.string(), description: z.string().optional(), inputSchema: z.record(z.string(), z.any()),
  outputSchema: z.record(z.string(), z.any()), tags: z.array(z.string()).optional(), changelog: z.string().optional(),
})

export const GET = withRBAC(async (request: Request, ctx: WorkspaceContext) => {
  try {
    const { searchParams } = new URL(request.url)
    const result = await listCapabilities(ctx.workspaceId, {
      capabilityType: (searchParams.get('type') as any) || undefined, status: (searchParams.get('status') as any) || undefined,
      healthStatus: (searchParams.get('healthStatus') as any) || undefined,
      tags: searchParams.get('tags')?.split(',').map(t => t.trim()).filter(Boolean),
      page: searchParams.get('page') ? parseInt(searchParams.get('page')!) : undefined,
      pageSize: searchParams.get('pageSize') ? parseInt(searchParams.get('pageSize')!) : undefined,
    })
    return ApiResponse.ok(result)
  } catch (error) { return ApiResponse.error(error instanceof Error ? error.message : '未知错误', 500) }
}, 'VIEWER')

export const POST = withRBAC(async (request: Request, ctx: WorkspaceContext) => {
  try {
    const body = await request.json(); const parsed = RegisterSchema.safeParse(body)
    if (!parsed.success) return ApiResponse.error('请求参数校验失败: ' + parsed.error.message, 400)
    const d = parsed.data
    const registration = await registerCapability({ capabilityId: d.capabilityId, capabilityType: d.capabilityType, version: d.version, workspaceId: ctx.workspaceId, displayName: d.displayName, description: d.description || '', inputSchema: d.inputSchema, outputSchema: d.outputSchema, tags: d.tags || [], changelog: d.changelog || '', publishedBy: ctx.userId || 'system', publishedAt: new Date() })
    return ApiResponse.ok(registration)
  } catch (error) {
    if (error instanceof InvalidVersionError) return ApiResponse.error(error.message, 400)
    if (error instanceof CapabilityAlreadyRegisteredError) return ApiResponse.error(error.message, 409)
    if (error instanceof CapabilityNotFoundError) return ApiResponse.error(error.message, 404)
    return ApiResponse.error(error instanceof Error ? error.message : '未知错误', 500)
  }
}, 'MEMBER')
