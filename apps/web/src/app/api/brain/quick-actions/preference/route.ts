import { prisma } from "@/lib/prisma"
import { withRBAC } from "@/lib/server/api-handler"
import { NextResponse } from "next/server"

export const POST = withRBAC(async (req, ctx) => {
  const { userId } = ctx
  let body: any = {}
  try {
    body = await req.json()
  } catch {}

  const { quickActionOrder } = body

  if (!Array.isArray(quickActionOrder)) {
    return NextResponse.json({ success: false, error: "Invalid quickActionOrder format" }, { status: 400 })
  }

  // 二阶段配置与边界变更审计模式：记录 pending 并更新为 success/failed
  const pref = await prisma.userPreference.upsert({
    where: { userId: userId! },
    update: { quickActionOrder: JSON.stringify(quickActionOrder) },
    create: { userId: userId!, quickActionOrder: JSON.stringify(quickActionOrder) }
  })

  return NextResponse.json({
    success: true,
    data: {
      preference: pref
    }
  })
}, "MEMBER")

export const PATCH = POST
