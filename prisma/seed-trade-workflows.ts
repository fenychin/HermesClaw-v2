/**
 * 外贸剩余 6 个工作流 DAG 种子脚本
 * —— 为每个工作流创建 DAG 定义，关联已有 Skill
 *
 * 用法：pnpm exec tsx prisma/seed-trade-workflows.ts
 * 幂等：upsert，可重复运行
 *
 * 覆盖工作流：
 *   客户画像构建 (customer-profile) → ft-customer-profiling
 *   报价生成 (quote-gen)           → ft-cost-accounting + ft-quotation-pdf
 *   样品管理 (sample-mgmt)          → 纯 task 节点（追踪寄样与反馈状态）
 *   订单推进 (order-push)           → 纯 task 节点（关键节点监控）
 *   展会线索整理 (exhibition-leads)  → ft-inquiry-sorter
 *   客户跟进提醒 (followup-remind)    → ft-follow-up-crm
 */
import 'dotenv/config'
import * as path from 'node:path'
import { createSeedPrisma } from './seed-utils'
import { loadForeignTradeSkills, toSkillDbRecord } from './seed-skills'
import { stringifyJsonField } from '../src/lib/api-utils'

const prisma = createSeedPrisma()

// ============================================================
// 工作流定义
// ============================================================

interface WorkflowDef {
  id: string
  name: string
  description: string
  templateId: string
  nodes: Array<{
    id: string
    kind: string
    name: string
    config: Record<string, unknown>
  }>
  edges: Array<{ from: string; to: string; when?: string }>
  /** 依赖的 skill commandName 列表 */
  requiredSkills: string[]
}

const WORKFLOWS: WorkflowDef[] = [
  // ==========================================================
  // 客户画像构建 (customer-profile)
  // ==========================================================
  {
    id: 'wf-customer-profile',
    name: 'customer-profile',
    description: '客户画像构建：整合多渠道信息生成完整客户档案，辅助开发信与报价策略',
    templateId: 'ft-customer-profile',
    requiredSkills: ['ft-customer-profiling'],
    nodes: [
      {
        id: 'n1-profile',
        kind: 'skill',
        name: '客户画像构建',
        config: { skillId: 'skill-ft-customer-profiling' },
      },
    ],
    edges: [],
  },

  // ==========================================================
  // 报价生成 (quote-gen)
  // ==========================================================
  {
    id: 'wf-quote-gen',
    name: 'quote-gen',
    description: '报价生成：核算产品成本 + 生成专业报价单，输出多贸易术语明细',
    templateId: 'ft-quote-gen',
    requiredSkills: ['ft-cost-accounting', 'ft-quotation-pdf'],
    nodes: [
      {
        id: 'n1-cost',
        kind: 'skill',
        name: '成本核算',
        config: { skillId: 'skill-ft-cost-accounting' },
      },
      {
        id: 'n2-pdf',
        kind: 'skill',
        name: '生成报价单',
        config: { skillId: 'skill-ft-quotation-pdf' },
      },
    ],
    edges: [
      { from: 'n1-cost', to: 'n2-pdf' },
    ],
  },

  // ==========================================================
  // 样品管理 (sample-mgmt)
  // ==========================================================
  {
    id: 'wf-sample-mgmt',
    name: 'sample-mgmt',
    description: '样品管理：跟踪样品寄送状态，记录客户反馈，推进样品到订单转化',
    templateId: 'ft-sample-mgmt',
    requiredSkills: [],
    nodes: [
      {
        id: 'n1-dispatch',
        kind: 'task',
        name: '登记样品寄送',
        config: { handler: 'log-sample-dispatch' },
      },
      {
        id: 'n2-track',
        kind: 'task',
        name: '追踪物流状态',
        config: { handler: 'log-tracking-status' },
      },
      {
        id: 'n3-feedback',
        kind: 'task',
        name: '记录客户反馈',
        config: { handler: 'log-customer-feedback' },
      },
    ],
    edges: [
      { from: 'n1-dispatch', to: 'n2-track' },
      { from: 'n2-track', to: 'n3-feedback' },
    ],
  },

  // ==========================================================
  // 订单推进 (order-push)
  // ==========================================================
  {
    id: 'wf-order-push',
    name: 'order-push',
    description: '订单推进：监控订单进度，自动提醒关键节点（备料/排产/验货/出运）',
    templateId: 'ft-order-push',
    requiredSkills: [],
    nodes: [
      {
        id: 'n1-status',
        kind: 'task',
        name: '订单状态快照',
        config: { handler: 'log-order-status' },
      },
      {
        id: 'n2-check',
        kind: 'task',
        name: '关键节点检查',
        config: { handler: 'log-node-check' },
      },
      {
        id: 'n3-remind',
        kind: 'task',
        name: '生成提醒任务',
        config: { handler: 'log-reminder-task' },
      },
    ],
    edges: [
      { from: 'n1-status', to: 'n2-check' },
      { from: 'n2-check', to: 'n3-remind' },
    ],
  },

  // ==========================================================
  // 展会线索整理 (exhibition-leads)
  // ==========================================================
  {
    id: 'wf-exhibition-leads',
    name: 'exhibition-leads',
    description: '展会线索整理：整理展会名片与线索，自动分类分级并生成跟进计划',
    templateId: 'ft-exhibition-leads',
    requiredSkills: ['ft-inquiry-sorter'],
    nodes: [
      {
        id: 'n1-sort',
        kind: 'skill',
        name: '线索分类分级',
        config: { skillId: 'skill-ft-inquiry-sorter' },
      },
      {
        id: 'n2-plan',
        kind: 'task',
        name: '生成跟进计划',
        config: { handler: 'log-followup-plan' },
      },
    ],
    edges: [
      { from: 'n1-sort', to: 'n2-plan' },
    ],
  },

  // ==========================================================
  // 客户跟进提醒 (followup-remind)
  // ==========================================================
  {
    id: 'wf-followup-remind',
    name: 'followup-remind',
    description: '客户跟进提醒：根据客户阶段与上次沟通时间，自动生成跟进提醒与建议话术',
    templateId: 'ft-followup-remind',
    requiredSkills: ['ft-follow-up-crm'],
    nodes: [
      {
        id: 'n1-analyze',
        kind: 'skill',
        name: '客户跟进分析',
        config: { skillId: 'skill-ft-follow-up-crm' },
      },
    ],
    edges: [],
  },
]

// ============================================================
// 主流程
// ============================================================

async function main() {
  console.log('🌱 外贸工作流种子脚本（剩余 6 个）\n')

  // 1. 加载已有技能（用于校验依赖）
  const skillsDir = path.resolve(__dirname, '../.claude/skills')
  const allTemplates = loadForeignTradeSkills(skillsDir)

  // 2. 确保所需技能已存在于 DB（不存在则自动 upsert）
  const neededSkills = new Set<string>()
  for (const wf of WORKFLOWS) {
    for (const s of wf.requiredSkills) neededSkills.add(s)
  }

  for (const cmdName of neededSkills) {
    const tmpl = allTemplates.find((t) => t.commandName === cmdName)
    if (!tmpl) {
      console.error(`❌ 缺少技能 ${cmdName}：.claude/skills/${cmdName}/SKILL.md 不存在或 industry 非 foreign-trade`)
      process.exit(1)
    }
    const skillId = `skill-${cmdName}`
    const data = toSkillDbRecord(tmpl)
    const existing = await prisma.skill.findUnique({ where: { id: skillId } })
    if (existing) {
      await prisma.skill.update({ where: { id: skillId }, data })
    } else {
      await prisma.skill.create({ data: { id: skillId, ...data } })
    }
    console.log(`  ✅ Skill ${cmdName} → ${skillId}`)
  }

  // 3. Upsert 工作流
  console.log('\n📝 写入工作流 DAG 定义...')

  for (const wf of WORKFLOWS) {
    const data = {
      name: wf.name,
      description: wf.description,
      status: 'active',
      nodes: stringifyJsonField(wf.nodes),
      edges: stringifyJsonField(wf.edges),
      industryId: 'foreign-trade',
      templateId: wf.templateId,
    }

    const existing = await prisma.workflow.findUnique({ where: { id: wf.id } })
    if (existing) {
      await prisma.workflow.update({ where: { id: wf.id }, data })
      console.log(`  🔄 ${wf.name} → ${wf.id}（已更新）`)
    } else {
      await prisma.workflow.create({
        data: {
          id: wf.id,
          workspaceId: 'default',
          ...data,
        },
      })
      console.log(`  ✅ ${wf.name} → ${wf.id}（新建）`)
    }
  }

  // 4. 验证
  console.log('\n🔍 验证...')
  let ok = true
  for (const wf of WORKFLOWS) {
    const verify = await prisma.workflow.findUnique({ where: { id: wf.id } })
    if (!verify) {
      console.error(`  ❌ ${wf.name} (${wf.id}) 写入失败`)
      ok = false
    } else {
      const nodes = JSON.parse(verify.nodes as string)
      const edges = JSON.parse(verify.edges as string)
      console.log(`  ✅ ${verify.name}：${nodes.length} 节点，${edges.length} 边`)
    }
  }

  if (ok) {
    console.log(`\n✅ ${WORKFLOWS.length} 个工作流已就绪！`)
  } else {
    console.error('\n❌ 部分工作流写入失败')
    process.exit(1)
  }
}

main()
  .then(async () => { await prisma.$disconnect() })
  .catch(async (e) => {
    console.error('❌ 种子脚本异常：', e)
    await prisma.$disconnect()
    process.exit(1)
  })
