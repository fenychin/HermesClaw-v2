/**
 * 外贸剩余工作流 DAG 种子脚本（pack-driven）
 * —— 把 industry-packs/foreign-trade/workflows/<wfId>/dag.json 写入 DB Workflow 表。
 *
 * 用法：pnpm exec tsx prisma/seed-trade-workflows.ts
 * 幂等：upsert，可重复运行
 *
 * P0-4 重构：
 *   单一数据源是 pack 内的 dag.json，本脚本不再持有 nodes/edges 字面量。
 *   inquiry-grade 由 prisma/seed-inquiry-workflow.ts 单独负责，本脚本仅处理"剩余 6 个"。
 *
 * 处理 workflow ID（与 pack 一致）：
 *   customer-profile, quote-gen, sample-mgmt, order-push, exhibition-leads, followup-remind
 */
import 'dotenv/config'
import * as path from 'node:path'
import { createSeedPrisma } from './seed-utils'
import { loadForeignTradeSkills, toSkillDbRecord } from './seed-skills'
import { stringifyJsonField } from '../src/lib/api-utils'
import { loadIndustryWorkflowDag } from '../src/lib/industry-pack-sdk'

const prisma = createSeedPrisma()

// ============================================================
// 配置：与 pack 中的 wfId 一一对应
// ============================================================

interface SeedSpec {
  /** DB Workflow.id（与历史保持兼容，加 wf- 前缀） */
  dbWorkflowId: string
  /** pack 中的 workflow id（即 industry-packs/foreign-trade/workflows/<id>/） */
  packWorkflowId: string
}

const REMAINING_WORKFLOWS: SeedSpec[] = [
  { dbWorkflowId: 'wf-customer-profile', packWorkflowId: 'customer-profile' },
  { dbWorkflowId: 'wf-quote-gen',         packWorkflowId: 'quote-gen' },
  { dbWorkflowId: 'wf-sample-mgmt',       packWorkflowId: 'sample-mgmt' },
  { dbWorkflowId: 'wf-order-push',        packWorkflowId: 'order-push' },
  { dbWorkflowId: 'wf-exhibition-leads',  packWorkflowId: 'exhibition-leads' },
  { dbWorkflowId: 'wf-followup-remind',   packWorkflowId: 'followup-remind' },
]

// ============================================================
// 主流程
// ============================================================

async function main() {
  console.log('🌱 外贸工作流种子脚本（pack-driven，剩余 6 个）\n')

  // 1. 一次性加载所有 DAG（pack 是 SoT）
  const dags = REMAINING_WORKFLOWS.map((s) => {
    const dag = loadIndustryWorkflowDag('foreign-trade', s.packWorkflowId)
    if (!dag) {
      console.error(`❌ pack 未提供 ${s.packWorkflowId}/dag.json`)
      process.exit(1)
    }
    return { ...s, dag }
  })

  // 2. 收集所需技能并校验
  const skillsDir = path.resolve(__dirname, '../.claude/skills')
  const allTemplates = loadForeignTradeSkills(skillsDir)
  const neededSkills = new Set<string>()
  for (const w of dags) {
    for (const s of w.dag.requiredSkills) neededSkills.add(s)
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

  for (const w of dags) {
    const data = {
      name: w.dag.name,
      description: w.dag.description,
      status: 'active',
      nodes: stringifyJsonField(w.dag.nodes),
      edges: stringifyJsonField(w.dag.edges),
      industryId: 'foreign-trade',
      templateId: w.dag.templateId ?? `ft-${w.packWorkflowId}`,
    }

    const existing = await prisma.workflow.findUnique({ where: { id: w.dbWorkflowId } })
    if (existing) {
      await prisma.workflow.update({ where: { id: w.dbWorkflowId }, data })
      console.log(`  🔄 ${w.dag.name} → ${w.dbWorkflowId}（已更新）`)
    } else {
      await prisma.workflow.create({
        data: {
          id: w.dbWorkflowId,
          workspaceId: 'default',
          ...data,
        },
      })
      console.log(`  ✅ ${w.dag.name} → ${w.dbWorkflowId}（新建）`)
    }
  }

  // 4. 验证
  console.log('\n🔍 验证...')
  let ok = true
  for (const w of dags) {
    const verify = await prisma.workflow.findUnique({ where: { id: w.dbWorkflowId } })
    if (!verify) {
      console.error(`  ❌ ${w.dag.name} (${w.dbWorkflowId}) 写入失败`)
      ok = false
    } else {
      const nodes = JSON.parse(verify.nodes as string)
      const edges = JSON.parse(verify.edges as string)
      console.log(`  ✅ ${verify.name}：${nodes.length} 节点，${edges.length} 边`)
    }
  }

  if (ok) {
    console.log(`\n✅ ${dags.length} 个工作流已就绪！`)
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
