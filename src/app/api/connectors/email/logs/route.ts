import { ApiResponse } from '@/lib/server/api-response'
import { withRBAC } from '@/lib/server/api-handler'
import { listEmailSendLogs } from '@/lib/server/connectors/email-connector'
import type { WorkspaceContext } from '@/lib/workspace'

// GET /api/connectors/email/logs
// 分页查询邮件发送日志
export const GET = withRBAC(
  async (request: Request, ctx: WorkspaceContext) => {
    try {
      const { searchParams } = new URL(request.url)
      const connectorId = searchParams.get('connectorId') || undefined
      const status = searchParams.get('status') || undefined
      const sinceStr = searchParams.get('since')
      const since = sinceStr ? new Date(sinceStr) : undefined
      const page = searchParams.get('page') ? parseInt(searchParams.get('page')!, 10) : undefined
      const pageSize = searchParams.get('pageSize') ? parseInt(searchParams.get('pageSize')!, 10) : undefined

      const result = await listEmailSendLogs(ctx.workspaceId, {
        connectorId,
        status,
        since,
        page,
        pageSize
      })

      // 对收发日志的反序列化处理
      const enrichedLogs = result.logs.map(log => {
        let parsedTo = []
        let parsedCc = []
        try {
          parsedTo = JSON.parse(log.toAddresses)
        } catch {
          parsedTo = [log.toAddresses]
        }
        try {
          parsedCc = JSON.parse(log.ccAddresses)
        } catch {
          parsedCc = []
        }
        return {
          ...log,
          toAddresses: parsedTo,
          ccAddresses: parsedCc
        }
      })

      return ApiResponse.ok({
        logs: enrichedLogs,
        total: result.total
      })
    } catch (error) {
      const msg = error instanceof Error ? error.message : '未知错误'
      return ApiResponse.error(msg, 500)
    }
  },
  'VIEWER'
)
