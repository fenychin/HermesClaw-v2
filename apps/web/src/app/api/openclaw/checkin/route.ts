import { NextRequest, NextResponse } from "next/server"; import { rateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"; import { z } from "zod"

const CheckinSchema = z.object({ timezone: z.string().min(1), localTime: z.string().min(1), deviceType: z.string().optional(), userAgent: z.string().optional(), viewportWidth: z.number().optional(), viewportHeight: z.number().optional(), preferStandalone: z.boolean().optional() })

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  if (!rateLimit(ip, 3, 60_000)) return NextResponse.json({ status: "error", message: "签到过于频繁" }, { status: 429 })
  try {
    const raw = await req.json(); const parsed = CheckinSchema.safeParse(raw)
    if (!parsed.success) return NextResponse.json({ status: "error", message: parsed.error.issues[0]?.message || "请求体格式错误" }, { status: 400 })
    const body = parsed.data; const sessionId = crypto.randomUUID()
    logger.info("[OpenClaw Checkin] 移动端签到", { ip, sessionId, timezone: body.timezone, deviceType: body.deviceType ?? "unknown" })
    return NextResponse.json({ status: "ok", sessionId })
  } catch { return NextResponse.json({ status: "error", message: "请求体格式错误" }, { status: 400 }) }
}
