import { ApiResponse } from '@/lib/server/api-response'; import { withRBAC } from '@/lib/server/api-handler'
import { listEmailSendLogs } from '@/lib/server/connectors/email-connector'; import type { WorkspaceContext } from '@/lib/workspace'

export const GET = withRBAC(async (request: Request, ctx: WorkspaceContext) => {
  try {
    const { searchParams } = new URL(request.url)
    const result = await listEmailSendLogs(ctx.workspaceId, { connectorId: searchParams.get('connectorId') || undefined, status: searchParams.get('status') || undefined, since: searchParams.get('since') ? new Date(searchParams.get('since')!) : undefined, page: searchParams.get('page') ? parseInt(searchParams.get('page')!) : undefined, pageSize: searchParams.get('pageSize') ? parseInt(searchParams.get('pageSize')!) : undefined })
    return ApiResponse.ok({ logs: result.logs.map((log: any) => ({ ...log, toAddresses: (() => { try { return JSON.parse(log.toAddresses) } catch { return [log.toAddresses] } })(), ccAddresses: (() => { try { return JSON.parse(log.ccAddresses) } catch { return [] } })() })), total: result.total })
  } catch (error) { return ApiResponse.error(error instanceof Error ? error.message : '未知错误', 500) }
}, 'VIEWER')
