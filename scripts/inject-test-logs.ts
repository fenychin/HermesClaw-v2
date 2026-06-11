/**
 * 注入测试 AgentLog（核查 Harness 评估失败率触发路径）
 * —— 写入 20 条日志，其中 4 条 status='error'（20% 错误率，超 15% 阈值）。
 *
 * 说明：
 *  - prisma 初始化沿用项目内 seed 脚本约定（相对路径 + 自建 adapter），
 *    因为 tsx 直接运行脚本时 `@/` 路径别名不解析。
 *  - AgentLog.id 在 schema 中无数据库默认值，须显式 crypto.randomUUID()，
 *    否则 createMany 会因缺少 id 报错。
 *
 * 用法：pnpm exec tsx scripts/inject-test-logs.ts
 */
import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma-v2/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

const adapter = new PrismaBetterSqlite3({
  url: process.env['DATABASE_URL'] ?? 'file:./dev.db',
})
const prisma = new PrismaClient({ adapter, log: ['error', 'warn'] })

async function main() {
  // 取第一个 agent
  const agent = await prisma.agent.findFirst()
  if (!agent) {
    console.log('没有 Agent，请先运行 seed')
    return
  }

  const logs = []
  const tasks = [
    '处理询盘邮件',
    '生成开发信',
    '分析客户画像',
    '创建报价单',
    '跟进订单状态',
    '整理展会线索',
    '市场情报分析',
    '邮件分类处理',
  ]

  for (let i = 0; i < 20; i++) {
    logs.push({
      id: crypto.randomUUID(),
      agentId: agent.id,
      taskName: tasks[i % tasks.length],
      status: i < 4 ? 'error' : 'success',
      duration: `${Math.floor(Math.random() * 5000) + 500}ms`,
      detail: i < 4 ? '工具调用超时，连接器未响应' : '任务完成',
      createdAt: new Date(Date.now() - Math.random() * 70 * 60 * 60 * 1000), // 70小时内随机
    })
  }

  await prisma.agentLog.createMany({ data: logs })
  console.log(`注入了 20 条日志（4 条 error，16 条 success）`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
