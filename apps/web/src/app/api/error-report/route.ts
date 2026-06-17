import { NextRequest } from 'next/server'; import { logger } from '@/lib/logger'; import { z } from "zod"

const ErrorReportSchema = z.object({ message: z.string().optional(), stack: z.string().optional(), url: z.string().optional(), userAgent: z.string().optional(), componentStack: z.string().optional() })

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json(); const parsed = ErrorReportSchema.safeParse(raw)
    if (parsed.success) logger.error('前端错误上报', { source: 'client', message: parsed.data.message, stack: parsed.data.stack?.slice(0, 1000), url: parsed.data.url, userAgent: parsed.data.userAgent, componentStack: parsed.data.componentStack })
    else logger.error('前端错误上报（尽力记录）', { source: 'client', message: raw?.message, stack: typeof raw?.stack === "string" ? raw.stack.slice(0, 1000) : undefined, url: raw?.url, validationErrors: parsed.error.issues })
    return Response.json({ ok: true })
  } catch { return Response.json({ ok: false, reason: 'invalid payload' }) }
}
