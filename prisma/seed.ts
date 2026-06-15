/**
 * Prisma Seed 脚本
 * —— 从 src/lib/mock-data.ts 读取全量演示数据并写入 SQLite
 *
 * 用法：pnpm exec prisma db seed
 */
import 'dotenv/config'
import bcrypt from 'bcryptjs'
import {
  mockAgents,
  mockConnectors,
  mockSkills,
  mockProjects,
  mockMemories,
} from '../src/lib/server/__mocks__/mock-data'
import { mockProposals as sharedProposals } from '../src/app/(workspace)/settings/harness/_data/mock-proposals'
import { createSeedPrisma } from './seed-utils'
import { foreignTradeSkillTemplates, toSkillDbRecord } from './seed-skills'

const L4_DEMO_PROPOSAL = {
  id: "hep-l4-demo",
  proposalId: "HEP-L4-DEMO",
  triggeredBy: "auto" as const,
  triggerReason: "外部资金调度类动作触发安全护栏",
  problemStatement:
    "系统检测到一条涉及外部资金调度的自动化提案。依据 AGENTS.md §4.5/§4.7，此类动作为 L4 级别，系统永不自动执行，审批通道亦不得放行。",
  evidence: [
    "动作分类：finance.payment（L4 绝对禁止自动）",
    "护栏判定：automationLevel=L4，approve API 须硬拒绝 403",
  ],
  proposedChange: {
    targetComponent: "安全护栏" as const,
    description:
      "自动发起一笔供应商货款支付。该动作涉及外部资金调度，属 L4 绝对禁止自动等级。",
    riskLevel: "high" as const,
    automationLevel: "L4" as const,
  },
  requiresHumanApproval: true,
  estimatedImpact: "若误放行将造成不可逆的资金损失，故审批通道必须硬拒绝。",
  affectedAgents: ["报价单 Agent", "财务 Agent"],
  rollbackPlan: "L4 动作不经审批通道执行，无系统级回滚；须由人工在源业务系统撤销。",
  status: "pending" as const,
  createdAt: "2026-06-09T10:00:00Z",
  workspaceId: "default",
  reviewedBy: null as string | null,
  reviewedAt: null as string | null,
}

const seedProposals = [
  ...sharedProposals.map((p) => ({ ...p })),
  L4_DEMO_PROPOSAL,
]

const prisma = createSeedPrisma()

async function main() {
  console.log('🌱 开始填充种子数据...\n')

  // ---- 默认工作空间 ----
  console.log('→ 创建默认工作空间...')
  await prisma.workspace.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      name: '默认工作空间',
      plan: 'free',
    },
  })

  // ---- 默认管理员账户 ----
  console.log('→ 创建默认管理员账户...')
  const hashedPassword = await bcrypt.hash('hermesclaw2026', 12)
  await prisma.user.upsert({
    where: { email: 'admin@hermesclaw.ai' },
    update: { password: hashedPassword },
    create: {
      email: 'admin@hermesclaw.ai',
      name: '管理员',
      password: hashedPassword,
      role: 'admin',
    },
  })

  // ---- 技能（通用 + 外贸行业模板）----
  const totalSkills = mockSkills.length + foreignTradeSkillTemplates.length
  console.log(`→ 写入技能（${totalSkills} 条：通用 ${mockSkills.length} + 外贸 ${foreignTradeSkillTemplates.length}）...`)
  for (const s of mockSkills) {
    await prisma.skill.create({
      data: {
        id: s.id,
        name: s.name,
        description: s.description,
        version: s.version,
        category: s.category,
        source: s.source,
        status: s.status,
        inputSchema: s.inputSchema,
        outputSchema: s.outputSchema,
        usedByAgents: JSON.stringify(s.usedByAgents),
        scenarios: JSON.stringify(s.scenarios),
        updatedAt: new Date(s.updatedAt),
      },
    })
  }

  // 外贸行业技能模板 —— 源自 .claude/skills/ft-*/SKILL.md（Claude Code Skills 规范）
  for (const tmpl of foreignTradeSkillTemplates) {
    const skillId = `skill-${tmpl.commandName}`
    const data = toSkillDbRecord(tmpl)
    await prisma.skill.upsert({
      where: { id: skillId },
      update: data,
      create: { id: skillId, ...data },
    })
  }

  // ---- 连接器 ----
  console.log('→ 写入连接器（20 条）...')
  for (const c of mockConnectors) {
    await prisma.connector.create({
      data: {
        id: c.id,
        name: c.name,
        iconEmoji: c.iconEmoji,
        description: c.description,
        status: c.status,
        category: c.category,
        lastSync: c.lastSync ?? null,
        permissions: JSON.stringify(c.permissions),
        usedByAgents: JSON.stringify(c.usedByAgents),
      },
    })
  }

  // ---- 智能体 ----
  console.log('→ 写入智能体（10 条）...')
  for (const a of mockAgents) {
    await prisma.agent.create({
      data: {
        id: a.id,
        name: a.name,
        role: a.role,
        description: a.description,
        status: a.status,
        source: a.source,
        category: JSON.stringify(a.category),
        bindSkills: JSON.stringify(a.bindSkills),
        bindConnectors: JSON.stringify(a.bindConnectors),
        memoryPermission: a.memoryPermission,
        harnessVersion: a.harnessVersion,
        canDo: JSON.stringify(a.canDo),
        cannotDo: JSON.stringify(a.cannotDo),
        statsJson: JSON.stringify(a.stats),
        lastActive: a.lastActive,
        createdAt: new Date(a.createdAt),
        industryId: a.industryId ?? null,
        templateId: a.templateId ?? null,
      },
    })
  }

  // ---- 项目 ----
  console.log('→ 写入项目空间（8 条）...')
  for (const p of mockProjects) {
    await prisma.project.create({
      data: {
        id: p.id,
        name: p.name,
        type: p.type,
        status: p.status,
        owner: p.owner,
        relatedClient: p.relatedClient ?? null,
        country: p.country ?? null,
        productLine: p.productLine ?? null,
        activeAgents: JSON.stringify(p.activeAgents),
        riskPoints: JSON.stringify(p.riskPoints),
        nextActions: JSON.stringify(p.nextActions),
        tags: JSON.stringify(p.tags),
        createdAt: new Date(p.createdAt),
        updatedAt: new Date(p.updatedAt),
      },
    })
  }

  // ---- 记忆 ----
  console.log('→ 写入记忆（12 条：短期 4 + 中期 4 + 长期 4）...')
  for (const m of mockMemories) {
    await prisma.memory.create({
      data: {
        id: m.id,
        type: m.type,
        content: m.content,
        summary: m.summary,
        source: m.source,
        relatedProject: m.relatedProject ?? null,
        relatedAgent: m.relatedAgent ?? null,
        confidence: m.confidence,
        frozen: m.frozen,
        tags: JSON.stringify(m.tags),
        projectId: m.relatedProject ?? null,
        createdAt: new Date(m.createdAt),
      },
    })
  }

  // ---- Harness 提案 ----
  console.log(`→ 写入 Harness 进化提案（${seedProposals.length} 条）...`)
  for (const h of seedProposals) {
    await prisma.harnessProposal.create({
      data: {
        id: h.id,
        proposalId: h.proposalId,
        workspaceId: h.workspaceId ?? 'default',
        triggeredBy: h.triggeredBy,
        triggerReason: h.triggerReason ?? '',
        problemStatement: h.problemStatement,
        evidence: h.evidence,
        proposedChange: h.proposedChange,
        requiresHumanApproval: h.requiresHumanApproval ?? true,
        estimatedImpact: h.estimatedImpact,
        affectedAgents: h.affectedAgents ?? [],
        rollbackPlan: h.rollbackPlan ?? '',
        status: h.status,
        reviewedBy: h.reviewedBy ?? null,
        reviewedAt: h.reviewedAt ? new Date(h.reviewedAt) : null,
        createdAt: new Date(h.createdAt),
      },
    })
  }

  console.log('\n✅ 种子数据填充完成！')
  console.log('   - 用户：admin@hermesclaw.ai（密码：hermesclaw2026）')
  console.log(`   - 智能体：${mockAgents.length} 条`)
  console.log(`   - 技能：${mockSkills.length} 条通用 + ${foreignTradeSkillTemplates.length} 条外贸模板`)
  console.log(`   - 连接器：${mockConnectors.length} 条`)
  console.log(`   - 项目：${mockProjects.length} 条`)
  console.log(`   - 记忆：${mockMemories.length} 条`)
  console.log(`   - Harness 提案：${seedProposals.length} 条`)
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error('❌ Seed 失败：', e)
    await prisma.$disconnect()
    process.exit(1)
  })
