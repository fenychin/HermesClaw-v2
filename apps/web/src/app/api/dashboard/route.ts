import { withRBAC } from "@/lib/server/api-handler"
import type { WorkspaceContext } from "@/lib/workspace"
import { getDashboardOverview } from "@hermesclaw/hermes-kernel"
import { prisma } from "@/lib/prisma"

export const revalidate = 60

export const GET = withRBAC(async (request: Request, ctx: WorkspaceContext) => {
  const { searchParams } = new URL(request.url)
  const period = searchParams.get("period") || "7d"
  const bypassCache = searchParams.get("bypassCache") === "true" || process.env.NODE_ENV === "test" || !!process.env.VITEST
  const data = await getDashboardOverview(
    { workspaceId: ctx.workspaceId, period, bypassCache } as any,
    { prisma } as any,
  )
  return Response.json(data, {
    headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate" },
  })
}, "VIEWER")
