import { ApiResponse } from '@/lib/server/api-response'
import { withRBAC } from '@/lib/server/api-handler'
import { listCapabilities, registerCapability, InvalidVersionError, CapabilityAlreadyRegisteredError, CapabilityNotFoundError } from '@/lib/server/capability-registry'
import type { WorkspaceContext } from '@/lib/workspace'
import type { CapabilityType, CapabilityStatus, HealthStatus } from '@/lib/server/contracts'
import { z } from 'zod'

// GET /api/capabilities
// 获取能力列表
export const GET = withRBAC(
  async (request: Request, ctx: WorkspaceContext) => {
    try {
      const { searchParams } = new URL(request.url)
      const capabilityType = (searchParams.get('type') as CapabilityType) || undefined
      const status = (searchParams.get('status') as CapabilityStatus) || undefined
      const healthStatus = (searchParams.get('healthStatus') as HealthStatus) || undefined
      const tagsStr = searchParams.get('tags')
      const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : undefined
      const page = searchParams.get('page') ? parseInt(searchParams.get('page')!, 10) : undefined
      const pageSize = searchParams.get('pageSize') ? parseInt(searchParams.get('pageSize')!, 10) : undefined

      const result = await listCapabilities(ctx.workspaceId, {
        capabilityType,
        status,
        healthStatus,
        tags,
        page,
        pageSize
      })

      return ApiResponse.ok(result)
    } catch (error) {
      const msg = error instanceof Error ? error.message : '未知错误'
      return ApiResponse.error(msg, 500)
    }
  },
  'VIEWER'
)

const RegisterSchema = z.object({
  capabilityId: z.string(),
  capabilityType: z.enum(['skill', 'connector', 'workflow']),
  version: z.string(),
  displayName: z.string(),
  description: z.string().optional(),
  inputSchema: z.record(z.string(), z.any()),
  outputSchema: z.record(z.string(), z.any()),
  tags: z.array(z.string()).optional(),
  changelog: z.string().optional()
})

// POST /api/capabilities
// 注册新能力版本
export const POST = withRBAC(
  async (request: Request, ctx: WorkspaceContext) => {
    try {
      const body = await request.json()
      const parsed = RegisterSchema.safeParse(body)
      if (!parsed.success) {
        return ApiResponse.error('请求参数校验失败: ' + parsed.error.message, 400)
      }

      const registration = await registerCapability({
        capabilityId: parsed.data.capabilityId,
        capabilityType: parsed.data.capabilityType,
        version: parsed.data.version,
        workspaceId: ctx.workspaceId,
        displayName: parsed.data.displayName,
        description: parsed.data.description || '',
        inputSchema: parsed.data.inputSchema,
        outputSchema: parsed.data.outputSchema,
        tags: parsed.data.tags || [],
        changelog: parsed.data.changelog || '',
        publishedBy: ctx.userId || 'system',
        publishedAt: new Date()
      })

      return ApiResponse.ok(registration)
    } catch (error) {
      if (error instanceof InvalidVersionError) {
        return ApiResponse.error(error.message, 400)
      }
      if (error instanceof CapabilityAlreadyRegisteredError) {
        return ApiResponse.error(error.message, 409)
      }
      if (error instanceof CapabilityNotFoundError) {
        return ApiResponse.error(error.message, 404)
      }
      const msg = error instanceof Error ? error.message : '未知错误'
      return ApiResponse.error(msg, 500)
    }
  },
  'MEMBER'
)
