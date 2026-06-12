import { ApiResponse } from '@/lib/server/api-response'
import { mockProposals } from '@/lib/server/mock-store'
import { withRBAC, type RouteContext } from '@/lib/server/api-handler'
import type { WorkspaceContext } from '@/lib/workspace'

// GET /api/harness/proposals
// 获取提案列表（RBAC: MEMBER 及以上可读；支持 ?status=pending 筛选）
// —— AGENTS.md §4.11：workspaceId 过滤 + 角色门禁
export const GET = withRBAC(
  async (req: Request, ctx: WorkspaceContext, _routeCtx: RouteContext) => {
    try {
      const { searchParams } = new URL(req.url)
      const status = searchParams.get('status')

      // workspaceId 过滤（§4.11 隔离）
      let result = mockProposals.filter(
        (p) => p.workspaceId === ctx.workspaceId || !p.workspaceId,
      )
      if (status) {
        result = result.filter((p) => p.status === status)
      }

      return ApiResponse.ok(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误'
      return ApiResponse.error(message, 500)
    }
  },
  'MEMBER',
)
