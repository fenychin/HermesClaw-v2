/**
 * GET /api/workspace/pack-agents?packId=foreign-trade
 *
 * 读取指定 Industry Pack 的 manifest，返回 Agent 列表 + 可配置 actionType
 * 供 AutomationPolicy 面板动态加载 Agent 选项
 *
 * MVP 实现：直接读取本地 industry-packs 目录
 */
import { NextRequest, NextResponse } from "next/server"
import fs from "fs"
import path from "path"

/** agent-001 → "询盘处理 Agent"（外贸 Pack 固定映射） */
function agentDisplayName(id: string): string {
  const names: Record<string, string> = {
    "agent-001": "询盘处理 Agent",
    "agent-002": "报价生成 Agent",
    "agent-003": "客户画像 Agent",
    "agent-004": "开发信 Agent",
    "agent-005": "样品管理 Agent",
    "agent-006": "订单跟进 Agent",
    "agent-007": "展会线索 Agent",
    "agent-008": "跟进提醒 Agent",
  }
  return names[id] ?? id
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const packId = searchParams.get("packId") ?? "foreign-trade"

  const manifestPath = path.join(process.cwd(), "industry-packs", packId, "manifest.json")

  if (!fs.existsSync(manifestPath)) {
    return NextResponse.json({ error: "PACK_NOT_FOUND" }, { status: 404 })
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"))
  const agents = (manifest.directory?.agents ?? []).map((id: string) => ({
    agentId: id,
    agentName: agentDisplayName(id),
    packId,
  }))

  // 外贸行业包可配置的 actionType 列表
  const actionTypes = [
    { type: "inquiry.grade", label: "询盘分级", defaultLevel: "L2" },
    { type: "inquiry.reply", label: "询盘回复", defaultLevel: "L1" },
    { type: "quotation.send", label: "报价发送", defaultLevel: "L2" },
    { type: "quotation.generate", label: "报价生成", defaultLevel: "L1" },
    { type: "followup.send", label: "跟进提醒发送", defaultLevel: "L2" },
    { type: "order.push", label: "订单推送", defaultLevel: "L1" },
  ]

  return NextResponse.json({
    agents,
    actionTypes,
    packId,
    packName: manifest.name ?? packId,
    packVersion: manifest.version,
  })
}
