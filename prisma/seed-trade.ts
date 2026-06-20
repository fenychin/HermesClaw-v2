/**
 * Trade 领域种子脚本（询盘 / 市场情报 / 报价）
 * —— 独立于主 seed.ts，幂等（upsert），可安全重复运行。
 *    P0-① 将外贸模块 UI 从 mock 切换为真实 DB 数据后，用本脚本灌入演示数据。
 *
 * 用法：pnpm seed:trade   （或 pnpm exec tsx prisma/seed-trade.ts）
 */
import 'dotenv/config'
import { PrismaClient } from '../apps/web/src/generated/prisma-v2/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import {
  mockInquiries,
  mockIntelligence,
  mockQuotations,
  mockExchangeRates,
} from '../apps/web/src/lib/server/__mocks__/mock-data'

const adapter = new PrismaBetterSqlite3({
  url: process.env['DATABASE_URL'] ?? 'file:./dev.db',
})

const prisma = new PrismaClient({ adapter, log: ['error', 'warn'] })

async function main() {
  console.log('🌱 写入 Trade 种子数据（幂等 upsert）...\n')

  // ---- 询盘 ----
  console.log(`→ 询盘（${mockInquiries.length} 条）...`)
  for (const q of mockInquiries) {
    const data = {
      fromCountry: q.fromCountry,
      countryFlag: q.countryFlag,
      companyName: q.companyName,
      summary: q.summary,
      priority: q.priority,
      channel: q.channel,
      receivedAt: new Date(q.receivedAt),
      replied: q.replied,
    }
    await prisma.inquiry.upsert({
      where: { id: q.id },
      update: data,
      create: { id: q.id, ...data },
    })
  }

  // ---- 市场情报 ----
  console.log(`→ 市场情报（${mockIntelligence.length} 条）...`)
  for (const i of mockIntelligence) {
    const data = {
      type: i.type,
      title: i.title,
      summary: i.summary,
      source: i.source,
      credibility: i.credibility,
      impactLevel: i.impactLevel,
      suggestedAction: i.suggestedAction,
      publishedAt: new Date(i.publishedAt),
    }
    await prisma.marketIntelligence.upsert({
      where: { id: i.id },
      update: data,
      create: { id: i.id, ...data },
    })
  }

  // ---- 汇率 ----
  console.log(`→ 汇率（${mockExchangeRates.length} 条）...`)
  // ExchangeRate 用 unique([workspaceId, pair])，id 与 rate 前缀均为 rate-
  const EXCHANGE_RATE_IDS = (
    await prisma.exchangeRate.findMany({ select: { id: true } })
  ).map((r) => r.id)
  for (const r of mockExchangeRates) {
    if (EXCHANGE_RATE_IDS.includes(r.id)) {
      await prisma.exchangeRate.update({ where: { id: r.id }, data: { value: r.value, change24h: r.change24h } })
      console.log(`  🔄 ${r.pair}（已更新）`)
    } else {
      await prisma.exchangeRate.create({
        data: { id: r.id, workspaceId: 'default', pair: r.pair, value: r.value, change24h: r.change24h },
      })
      console.log(`  ✅ ${r.pair}（新建）`)
    }
  }

  // ---- 报价 ----
  console.log(`→ 报价（${mockQuotations.length} 条）...`)
  for (const u of mockQuotations) {
    const data = {
      projectId: u.projectId,
      version: u.version,
      totalAmount: u.totalAmount,
      currency: u.currency,
      status: u.status,
      createdAt: new Date(u.createdAt),
    }
    await prisma.quotation.upsert({
      where: { id: u.id },
      update: data,
      create: { id: u.id, ...data },
    })
  }

  console.log('\n✅ Trade 种子数据写入完成！')
  console.log(`   - 询盘：${mockInquiries.length} 条`)
  console.log(`   - 市场情报：${mockIntelligence.length} 条`)
  console.log(`   - 汇率：${mockExchangeRates.length} 条`)
  console.log(`   - 报价：${mockQuotations.length} 条`)
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error('❌ Seed trade 失败：', e)
    await prisma.$disconnect()
    process.exit(1)
  })
