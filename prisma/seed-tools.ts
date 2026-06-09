/**
 * 工具注册表种子（P2-⑦）—— 幂等 upsert（按 name 唯一）。
 *
 * 注册一批演示工具：高危工具（删除/外发/付款）标 high 须双审批，
 * 数据读取类标 low。用法：pnpm seed:tools
 */
import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

const adapter = new PrismaBetterSqlite3({
  url: process.env['DATABASE_URL'] ?? 'file:./dev.db',
})
const prisma = new PrismaClient({ adapter, log: ['error', 'warn'] })

const TOOLS: {
  name: string
  description: string
  category: string
  scopes: string[]
  riskLevel: 'low' | 'mid' | 'high'
}[] = [
  { name: 'email.read', description: '读取邮箱邮件', category: 'connector', scopes: ['read'], riskLevel: 'low' },
  { name: 'email.send', description: '发送邮件（对外可见）', category: 'connector', scopes: ['send'], riskLevel: 'high' },
  { name: 'crm.read', description: '读取 CRM 客户与交易', category: 'connector', scopes: ['contacts', 'deals'], riskLevel: 'low' },
  { name: 'crm.write', description: '写入 CRM 数据', category: 'connector', scopes: ['write'], riskLevel: 'mid' },
  { name: 'customs.query', description: '查询海关进出口数据', category: 'data', scopes: ['query'], riskLevel: 'low' },
  { name: 'fx.rates', description: '获取实时汇率', category: 'data', scopes: ['rates'], riskLevel: 'low' },
  { name: 'payment.charge', description: '发起付款 / 收款（资金调度）', category: 'api', scopes: ['payments'], riskLevel: 'high' },
  { name: 'memory.write', description: '写入组织记忆', category: 'system', scopes: ['write'], riskLevel: 'mid' },
  { name: 'email-imap-smtp', description: 'Email 连接器（IMAP 收信 + SMTP 发信），用于外贸询盘邮件处理', category: 'connector', scopes: ['read', 'send'], riskLevel: 'mid' },
]

async function main() {
  console.log('🌱 注册工具（幂等）...\n')
  for (const t of TOOLS) {
    const data = {
      description: t.description,
      category: t.category,
      scopes: JSON.stringify(t.scopes),
      riskLevel: t.riskLevel,
      enabled: true,
    }
    await prisma.toolRegistry.upsert({
      where: { name: t.name },
      update: data,
      create: { name: t.name, ...data },
    })
  }
  const high = TOOLS.filter((t) => t.riskLevel === 'high').length
  console.log(`✅ 已注册 ${TOOLS.length} 个工具（其中高危 ${high} 个，须双审批）`)
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error('❌ Seed tools 失败：', e)
    await prisma.$disconnect()
    process.exit(1)
  })
