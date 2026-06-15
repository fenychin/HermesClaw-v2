/**
 * 询盘分级工作流种子脚本
 * —— 创建 inquiry-grade DAG 工作流及其依赖技能（ft-inquiry-grading, ft-outreach-email）
 *
 * P0-4 重构后：DAG 定义来自 industry-packs/foreign-trade/workflows/inquiry-grade/dag.json
 * （pack 是 single source of truth），本脚本仅负责把它写入 DB Workflow 表。
 *
 * 用法：
 *   pnpm exec tsx prisma/seed-inquiry-workflow.ts
 *
 * 幂等：已存在的 Skill / Workflow 会更新（upsert）
 */
import 'dotenv/config'
import * as path from 'node:path'
import { createSeedPrisma } from './seed-utils'
import {
  loadForeignTradeSkills,
  toSkillDbRecord,
} from './seed-skills'
import { stringifyJsonField } from '../src/lib/api-utils'
import { loadIndustryWorkflowDag } from '../src/lib/industry-pack-sdk'

const prisma = createSeedPrisma()

// ============================================================
// 主流程
// ============================================================

async function main() {
  console.log('🌱 询盘分级工作流种子脚本（pack-driven）\n')

  // 1. 从 pack 加载 DAG 定义（single source of truth）
  const dag = loadIndustryWorkflowDag('foreign-trade', 'inquiry-grade')
  if (!dag) {
    console.error('❌ pack 未提供 inquiry-grade/dag.json：industry-packs/foreign-trade/workflows/inquiry-grade/dag.json 缺失')
    process.exit(1)
  }

  // 2. 加载所有外贸技能模板
  const skillsDir = path.resolve(__dirname, '../.claude/skills')
  const allTemplates = loadForeignTradeSkills(skillsDir)
  console.log(`📂 扫描到 ${allTemplates.length} 个外贸技能模板`)

  // 3. 校验 pack 声明的依赖技能存在
  for (const cmdName of dag.requiredSkills) {
    if (!allTemplates.some((t) => t.commandName === cmdName)) {
      console.error(
        `❌ 缺少技能 ${cmdName}：请确认 .claude/skills/${cmdName}/SKILL.md 存在且 frontmatter industry 为 foreign-trade`,
      )
      process.exit(1)
    }
  }

  // 4. Upsert 依赖技能
  console.log('\n📝 写入技能...')
  for (const cmdName of dag.requiredSkills) {
    const tmpl = allTemplates.find((t) => t.commandName === cmdName)!
    const skillId = `skill-${cmdName}`
    const data = toSkillDbRecord(tmpl)

    const existing = await prisma.skill.findUnique({ where: { id: skillId } })
    if (existing) {
      await prisma.skill.update({ where: { id: skillId }, data })
      console.log(`  🔄 ${cmdName} → ${skillId}（已更新）`)
    } else {
      await prisma.skill.create({ data: { id: skillId, ...data } })
      console.log(`  ✅ ${cmdName} → ${skillId}（新建）`)
    }
  }

  // 5. Upsert 工作流（DAG 直接来自 pack）
  const workflowId = 'wf-inquiry-grading'
  const workflowData = {
    name: dag.name,
    description: dag.description,
    status: 'active',
    nodes: stringifyJsonField(dag.nodes),
    edges: stringifyJsonField(dag.edges),
    industryId: 'foreign-trade',
    templateId: dag.templateId ?? 'ft-inquiry-grading',
  }

  console.log('\n📝 写入工作流...')
  const existingWf = await prisma.workflow.findUnique({ where: { id: workflowId } })
  if (existingWf) {
    await prisma.workflow.update({ where: { id: workflowId }, data: workflowData })
    console.log(`  🔄 ${dag.name} → ${workflowId}（已更新）`)
  } else {
    await prisma.workflow.create({
      data: {
        id: workflowId,
        workspaceId: 'default',
        ...workflowData,
      },
    })
    console.log(`  ✅ ${dag.name} → ${workflowId}（新建）`)
  }

  // 6. 验证
  console.log('\n🔍 验证...')
  const verifyWf = await prisma.workflow.findUnique({ where: { id: workflowId } })
  if (!verifyWf) {
    console.error(`  ❌ 工作流 ${workflowId} 写入失败`)
    process.exit(1)
  }
  const wfNodes = JSON.parse(verifyWf.nodes as string)
  const wfEdges = JSON.parse(verifyWf.edges as string)
  console.log(`  ✅ 工作流 ${verifyWf.name}（${workflowId}）：${wfNodes.length} 节点，${wfEdges.length} 边`)
  console.log('\n✅ 询盘分级工作流种子数据写入完成！')
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error('❌ 种子脚本异常：', e)
    await prisma.$disconnect()
    process.exit(1)
  })
