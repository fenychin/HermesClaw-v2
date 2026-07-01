/**
 * seed-ft-workflows.ts
 * 将外贸行业包所有工作流以 scoped ID 格式写入数据库（幂等 upsert）
 * 用法：pnpm exec tsx prisma/seed-ft-workflows.ts
 */
import 'dotenv/config'
import { PrismaClient } from '../apps/web/src/generated/prisma-v2/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env['DATABASE_URL'] ?? 'postgresql://postgres:postgres@localhost:5432/hermesclaw', max: 5 })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter, log: ['error'] })

const WORKSPACE_ID = 'default'

const WORKFLOWS = [
  {
    id: 'inquiry-followup',
    name: '询盘跟进工作流',
    description: '自动化分析入站询盘、分配智能体并起草开发信的黄金流程',
    nodes: JSON.stringify([
      { id: 'analyze-inquiry', kind: 'skill', name: '询盘意图分析', config: { skillId: 'skill-ft-inquiry-analysis', automationLevel: 'L3' } },
      { id: 'check-risk', kind: 'condition', name: '贸易风险评估', config: { variable: 'risk', expected: 'no-risk', trueBranch: 'no-risk', falseBranch: 'has-risk' } },
      { id: 'auto-reply', kind: 'skill', name: 'AI 自动起草回复', config: { skillId: 'skill-ft-write-development-letter', automationLevel: 'L3' } },
      { id: 'manual-review', kind: 'noop', name: '人工合规审查' },
    ]),
    edges: JSON.stringify([
      { from: 'analyze-inquiry', to: 'check-risk' },
      { from: 'check-risk', to: 'auto-reply', when: 'no-risk' },
      { from: 'check-risk', to: 'manual-review', when: 'has-risk' },
    ]),
  },
  {
    id: 'inquiry-grade',
    name: '询盘智能评级',
    description: '综合客户画像、询盘内容、市场行情对入站询盘进行 A/B/C 评级',
    nodes: JSON.stringify([
      { id: 'grade-inquiry', kind: 'skill', name: '询盘评级分析', config: { skillId: 'skill-ft-inquiry-grade', automationLevel: 'L2' } },
      { id: 'output-grade', kind: 'noop', name: '输出评级结果' },
    ]),
    edges: JSON.stringify([
      { from: 'grade-inquiry', to: 'output-grade' },
    ]),
  },
  {
    id: 'dev-letter',
    name: '开发信自动生成',
    description: '基于客户画像自动生成高度个性化的多语种开发信',
    nodes: JSON.stringify([
      { id: 'profile-customer', kind: 'skill', name: '客户画像提取', config: { skillId: 'skill-ft-customer-profile', automationLevel: 'L2' } },
      { id: 'write-letter', kind: 'skill', name: 'AI 起草开发信', config: { skillId: 'skill-ft-write-development-letter', automationLevel: 'L2' } },
      { id: 'review-output', kind: 'noop', name: '输出开发信草稿' },
    ]),
    edges: JSON.stringify([
      { from: 'profile-customer', to: 'write-letter' },
      { from: 'write-letter', to: 'review-output' },
    ]),
  },
  {
    id: 'customer-profile',
    name: '客户画像提取',
    description: '从多渠道提取目标客户画像，构建客户档案',
    nodes: JSON.stringify([
      { id: 'extract-profile', kind: 'skill', name: '画像提取分析', config: { skillId: 'skill-ft-customer-profile', automationLevel: 'L2' } },
      { id: 'store-profile', kind: 'noop', name: '保存客户档案' },
    ]),
    edges: JSON.stringify([
      { from: 'extract-profile', to: 'store-profile' },
    ]),
  },
  {
    id: 'quote-gen',
    name: '报价单生成',
    description: '综合成本、汇率、运费，自动生成多贸易术语报价方案',
    nodes: JSON.stringify([
      { id: 'calc-cost', kind: 'skill', name: '成本核算', config: { skillId: 'skill-ft-quote-gen', automationLevel: 'L2' } },
      { id: 'gen-quote', kind: 'noop', name: '生成报价单' },
    ]),
    edges: JSON.stringify([
      { from: 'calc-cost', to: 'gen-quote' },
    ]),
  },
  {
    id: 'sample-mgmt',
    name: '样品管理流程',
    description: '自动化样品申请、审批、发货、跟踪全流程',
    nodes: JSON.stringify([
      { id: 'request-sample', kind: 'noop', name: '样品申请' },
      { id: 'approve-sample', kind: 'noop', name: '样品审批' },
      { id: 'ship-sample', kind: 'noop', name: '发货追踪' },
    ]),
    edges: JSON.stringify([
      { from: 'request-sample', to: 'approve-sample' },
      { from: 'approve-sample', to: 'ship-sample' },
    ]),
  },
  {
    id: 'order-push',
    name: '订单推进工作流',
    description: '订单生命周期追踪与推进，自动提醒跟进节点',
    nodes: JSON.stringify([
      { id: 'track-order', kind: 'noop', name: '订单状态追踪' },
      { id: 'remind-followup', kind: 'noop', name: '跟进提醒' },
    ]),
    edges: JSON.stringify([
      { from: 'track-order', to: 'remind-followup' },
    ]),
  },
  {
    id: 'exhibition-leads',
    name: '展会线索管理',
    description: '展会名录线索采集、分类与跟进任务生成',
    nodes: JSON.stringify([
      { id: 'collect-leads', kind: 'noop', name: '线索采集' },
      { id: 'classify-leads', kind: 'skill', name: '线索分类评级', config: { skillId: 'skill-ft-inquiry-grade', automationLevel: 'L2' } },
      { id: 'assign-followup', kind: 'noop', name: '分配跟进任务' },
    ]),
    edges: JSON.stringify([
      { from: 'collect-leads', to: 'classify-leads' },
      { from: 'classify-leads', to: 'assign-followup' },
    ]),
  },
  {
    id: 'followup-remind',
    name: '客户跟进提醒',
    description: '根据客户阶段和上次沟通时间，自动生成跟进提醒与建议话术',
    nodes: JSON.stringify([
      { id: 'check-stage', kind: 'skill', name: '客户阶段判断', config: { skillId: 'skill-ft-customer-profile', automationLevel: 'L2' } },
      { id: 'gen-reminder', kind: 'noop', name: '生成跟进提醒' },
    ]),
    edges: JSON.stringify([
      { from: 'check-stage', to: 'gen-reminder' },
    ]),
  },
]

async function main() {
  console.log('🌱 写入外贸行业包工作流（幂等 upsert）...\n')

  for (const wf of WORKFLOWS) {
    const scopedId = `${WORKSPACE_ID}:${wf.id}`
    await prisma.workflow.upsert({
      where: { id: scopedId },
      update: {
        name: wf.name,
        description: wf.description,
        nodes: wf.nodes,
        edges: wf.edges,
        status: 'active',
      },
      create: {
        id: scopedId,
        workspaceId: WORKSPACE_ID,
        name: wf.name,
        description: wf.description,
        status: 'active',
        nodes: wf.nodes,
        edges: wf.edges,
        industryId: 'foreign-trade',
        templateId: `ft-${wf.id}`,
      },
    })
    console.log(`  ✅ ${scopedId} (${wf.name})`)
  }

  console.log('\n✅ 外贸工作流写入完成！')
  await prisma.$disconnect()
  await pool.end()
}

main().catch((err) => {
  console.error('❌ 写入失败:', err.message)
  process.exit(1)
})
