/**
 * AgentLog 测试数据种子（演示 Harness 评估的失败率路径）
 * —— 主 seed 脚本未写入运行日志，导致评估只能走「零日志」分支。
 *    本脚本为已存在的智能体生成最近 72h 内的运行日志（含约 30% 失败），
 *    使 /api/harness/evaluate 能跑通真实的失败率触发逻辑。
 *
 * 幂等：每次运行会先清空 AgentLog 再重新写入。
 * 用法：pnpm seed:logs   （或 pnpm exec tsx prisma/seed-logs.ts）
 */
import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma-new/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

const adapter = new PrismaBetterSqlite3({
  url: process.env['DATABASE_URL'] ?? 'file:./dev.db',
})

const prisma = new PrismaClient({ adapter, log: ['error', 'warn'] })

/** 日志模板：status=error 的为失败任务 */
const LOG_TEMPLATES: {
  taskName: string
  status: 'success' | 'error'
  duration: string
  detail: string
}[] = [
  { taskName: '询盘分拣', status: 'success', duration: '1.2s', detail: '识别 BrightPath 高优先级询盘' },
  { taskName: '开发信生成', status: 'success', duration: '3.8s', detail: '生成 v3 开发信并通过校验' },
  { taskName: '报价计算', status: 'error', duration: '5.1s', detail: '汇率连接器超时，回退失败' },
  { taskName: '邮件同步', status: 'success', duration: '0.9s', detail: '同步 23 封新邮件' },
  { taskName: 'WhatsApp 回复', status: 'error', duration: '8.4s', detail: '消息模板渲染异常，上下文缺失' },
  { taskName: '产品目录解析', status: 'success', duration: '12.3s', detail: 'OCR 解析 PDF 目录 v3' },
  { taskName: '汇率情报推送', status: 'success', duration: '0.6s', detail: '推送美元汇率突破 7.25 预警' },
  { taskName: '报价计算', status: 'error', duration: '6.7s', detail: '汇率连接器第二次超时' },
  { taskName: '客户画像更新', status: 'success', duration: '2.1s', detail: '写入 Sakura 样品反馈至中期记忆' },
  { taskName: '合同条款抽取', status: 'success', duration: '4.5s', detail: '抽取付款条款与交期' },
  { taskName: 'WhatsApp 回复', status: 'error', duration: '9.1s', detail: '渠道适配规则未命中，降级人工' },
  { taskName: '市场报告撰写', status: 'success', duration: '15.2s', detail: '生成东南亚 LED 市场月报' },
  { taskName: '样品物流跟踪', status: 'success', duration: '1.8s', detail: '更新 DHL 运单状态' },
  { taskName: '询盘分拣', status: 'success', duration: '1.0s', detail: '识别低优先级询盘 5 封' },
]

async function main() {
  console.log('🌱 写入 AgentLog 测试数据...\n')

  const agents = await prisma.agent.findMany({ select: { id: true, name: true } })
  if (agents.length === 0) {
    console.error('❌ 数据库中没有智能体，请先运行 pnpm exec prisma db seed')
    process.exit(1)
  }

  // 幂等：清空旧日志
  await prisma.agentLog.deleteMany()

  const now = Date.now()
  let created = 0
  for (let i = 0; i < LOG_TEMPLATES.length; i++) {
    const tpl = LOG_TEMPLATES[i]
    const agent = agents[i % agents.length]
    // 分散在最近 72 小时内（每条间隔约 4 小时）
    const createdAt = new Date(now - i * 4 * 60 * 60 * 1000)

    await prisma.agentLog.create({
      data: {
        id: crypto.randomUUID(),
        agentId: agent.id,
        taskName: tpl.taskName,
        status: tpl.status,
        duration: tpl.duration,
        detail: tpl.detail,
        createdAt,
      },
    })
    created++
  }

  const errors = LOG_TEMPLATES.filter((t) => t.status === 'error').length
  console.log(`✅ 已写入 ${created} 条运行日志`)
  console.log(`   - 失败：${errors} 条（失败率 ${((errors / created) * 100).toFixed(1)}%）`)
  console.log('   现在调用 POST /api/harness/evaluate 即可触发失败率分析')
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error('❌ Seed logs 失败：', e)
    await prisma.$disconnect()
    process.exit(1)
  })
