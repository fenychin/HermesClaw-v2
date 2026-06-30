// Domain: Governance / apps/web API layer
// Input Contract: POST { email: string }
// Output Contract: 201 { ok: true } | 422 { error: string } | 400 { error: string }
// Audit: console.info({ event, maskedEmail, timestamp, auditTraceId })
// Approval: 人工审核队列，无自动执行副作用
// Rollback: 无外部 side-effect，失败可重试

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const BodySchema = z.object({
  email: z.string().email({ message: '请输入有效的企业邮箱' }),
})

function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  return `${local.slice(0, 2)}***@${domain}`
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 })
  }

  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    const message = parsed.error.issues?.[0]?.message ?? '参数错误'
    return NextResponse.json({ error: message }, { status: 422 })
  }

  console.info(
    JSON.stringify({
      event: 'marketing.early_access.submitted',
      maskedEmail: maskEmail(parsed.data.email),
      timestamp: new Date().toISOString(),
      auditTraceId: `mktg-${Date.now()}`,
    }),
  )

  // TODO(production): await prisma.waitlistEntry.create({ data: { email: parsed.data.email } })

  return NextResponse.json({ ok: true }, { status: 201 })
}

export async function GET() {
  return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 })
}
