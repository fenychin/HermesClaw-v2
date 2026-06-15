/**
 * 询盘分级工作流种子脚本
 * —— 创建 inquiry-grading DAG 工作流及两个依赖技能（ft-inquiry-grading, ft-outreach-email）
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

const prisma = createSeedPrisma()

// ============================================================
// 硬编码：工作流所需技能的命令名
// ============================================================

const REQUIRED_SKILLS = ['ft-inquiry-grading', 'ft-outreach-email'] as const

// ============================================================
// 主流程
// ============================================================

async function main() {
  console.log('🌱 询盘分级工作流种子脚本\n')

  // 1. 加载所有外贸技能模板（自动扫描 .claude/skills/ft-*/SKILL.md）
  const skillsDir = path.resolve(__dirname, '../.claude/skills')
  const allTemplates = loadForeignTradeSkills(skillsDir)

  console.log(`📂 扫描到 ${allTemplates.length} 个外贸技能模板`)

  // 2. 筛选工作流所需的两个技能
  const needed = allTemplates.filter((t) =>
    (REQUIRED_SKILLS as readonly string[]).includes(t.commandName),
  )

  for (const name of REQUIRED_SKILLS) {
    if (!needed.some((t) => t.commandName === name)) {
      console.error(
        `❌ 缺少技能 ${name}：请确认 .claude/skills/${name}/SKILL.md 存在且 frontmatter industry 为 foreign-trade`,
      )
      process.exit(1)
    }
  }

  // 3. Upsert 技能到数据库
  const skillIdMap = new Map<string, string>() // commandName → skillId

  console.log('\n📝 写入技能...')
  for (const tmpl of needed) {
    const skillId = `skill-${tmpl.commandName}`
    const data = toSkillDbRecord(tmpl)

    const existing = await prisma.skill.findUnique({ where: { id: skillId } })
    if (existing) {
      await prisma.skill.update({ where: { id: skillId }, data })
      console.log(`  🔄 ${tmpl.commandName} → ${skillId}（已更新）`)
    } else {
      await prisma.skill.create({ data: { id: skillId, ...data } })
      console.log(`  ✅ ${tmpl.commandName} → ${skillId}（新建）`)
    }

    skillIdMap.set(tmpl.commandName, skillId)
  }

  // 4. 构建工作流 DAG 定义
  const gradingSkillId = skillIdMap.get('ft-inquiry-grading')!
  const emailSkillId = skillIdMap.get('ft-outreach-email')!

  const nodes = [
    {
      id: 'n1-grading',
      kind: 'skill',
      name: '询盘智能分级',
      config: { skillId: gradingSkillId },
    },
    {
      id: 'n2-write',
      kind: 'data-write',
      name: '写入分级结果',
      config: {
        target: 'Inquiry',
        field: 'priority',
        sourceNode: 'n1-grading',
        sourcePath: 'result.grade',
      },
    },
    {
      id: 'n3-condition',
      kind: 'condition',
      name: '高意向判定',
      config: {
        variable: 'grade',
        expected: 'A',
        trueBranch: 'A',
        falseBranch: 'not-A',
      },
    },
    {
      id: 'n4-email',
      kind: 'skill',
      name: '自动生成开发信',
      config: { skillId: emailSkillId },
    },
  ]

  const edges = [
    { from: 'n1-grading', to: 'n2-write' },
    { from: 'n2-write', to: 'n3-condition' },
    { from: 'n3-condition', to: 'n4-email', when: 'A' },
  ]

  // 5. Upsert 工作流
  const workflowId = 'wf-inquiry-grading'
  const workflowData = {
    name: 'inquiry-grading',
    description: '询盘智能分级：自动评估询盘质量（A/B/C），A 级自动生成开发信草稿',
    status: 'active',
    nodes: stringifyJsonField(nodes),
    edges: stringifyJsonField(edges),
  }

  console.log('\n📝 写入工作流...')
  const existingWf = await prisma.workflow.findUnique({ where: { id: workflowId } })
  if (existingWf) {
    await prisma.workflow.update({ where: { id: workflowId }, data: workflowData })
    console.log(`  🔄 inquiry-grading → ${workflowId}（已更新）`)
  } else {
    await prisma.workflow.create({
      data: {
        id: workflowId,
        workspaceId: 'default',
        ...workflowData,
      },
    })
    console.log(`  ✅ inquiry-grading → ${workflowId}（新建）`)
  }

  // 6. 验证
  console.log('\n🔍 验证...')
  const [verifySkill1, verifySkill2, verifyWf] = await Promise.all([
    prisma.skill.findUnique({ where: { id: gradingSkillId } }),
    prisma.skill.findUnique({ where: { id: emailSkillId } }),
    prisma.workflow.findUnique({ where: { id: workflowId } }),
  ])

  let ok = true
  if (!verifySkill1) {
    console.error(`  ❌ 技能 ${gradingSkillId} 写入失败`)
    ok = false
  } else {
    console.log(`  ✅ 技能 ${verifySkill1.name}（${gradingSkillId}）`)
  }
  if (!verifySkill2) {
    console.error(`  ❌ 技能 ${emailSkillId} 写入失败`)
    ok = false
  } else {
    console.log(`  ✅ 技能 ${verifySkill2.name}（${emailSkillId}）`)
  }
  if (!verifyWf) {
    console.error(`  ❌ 工作流 ${workflowId} 写入失败`)
    ok = false
  } else {
    const wfNodes = JSON.parse(verifyWf.nodes as string)
    const wfEdges = JSON.parse(verifyWf.edges as string)
    console.log(`  ✅ 工作流 ${verifyWf.name}（${workflowId}）：${wfNodes.length} 节点，${wfEdges.length} 边`)
  }

  if (ok) {
    console.log('\n✅ 询盘分级工作流种子数据写入完成！')
    console.log('   DAG 拓扑：')
    console.log('     n1-grading (skill) → n2-write (data-write) → n3-condition (condition) → n4-email (skill, when=A)')
  } else {
    console.error('\n❌ 部分数据写入失败，请检查错误信息')
    process.exit(1)
  }
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
