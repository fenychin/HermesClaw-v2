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
} from '../apps/web/src/lib/server/__mocks__/mock-data'
const sharedProposals: any[] = []
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

  console.log('→ 清理旧版冲突数据...')
  await prisma.actionReceipt.deleteMany().catch(() => {})
  await prisma.connectorLease.deleteMany().catch(() => {})
  await prisma.connector.deleteMany().catch(() => {})
  await prisma.agent.deleteMany().catch(() => {})
  await prisma.skill.deleteMany().catch(() => {})
  await prisma.project.deleteMany().catch(() => {})
  await prisma.memory.deleteMany().catch(() => {})
  await prisma.harnessProposal.deleteMany().catch(() => {})
  await prisma.industryPackInstallation.deleteMany().catch(() => {})

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

  // ---- 基础工作流（Chat Direct — 新对话入口 TaskEnvelope 外键依赖）----
  console.log('→ 创建基础工作流...')
  await prisma.workflow.upsert({
    where: { id: 'chat-direct' },
    update: { name: 'Chat Direct', status: 'active', nodes: '[]', edges: '[]' },
    create: {
      id: 'chat-direct',
      workspaceId: 'default',
      name: 'Chat Direct',
      status: 'active',
      nodes: '[]',
      edges: '[]',
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

  // ---- 默认工作空间成员（admin → OWNER）----
  const adminUser = await prisma.user.findUnique({ where: { email: 'admin@hermesclaw.ai' } })
  if (adminUser) {
    await prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: 'default', userId: adminUser.id } },
      update: { role: 'OWNER' },
      create: { workspaceId: 'default', userId: adminUser.id, role: 'OWNER' },
    })
    console.log('→ 已将管理员添加至默认工作空间 (OWNER)')
  }

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
        source: c.source || 'custom',
        packId: c.packId || null,
        requiredAutomationLevel: c.requiredAutomationLevel || 'L1',
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

  // ---- 写入默认的外贸行业包已安装记录 ----
  console.log('→ 写入外贸行业包初始已安装记录...')
  await prisma.industryPackInstallation.create({
    data: {
      id: 'inst-foreign-trade-default',
      installationId: 'ins-default-ft-2026',
      workspaceId: 'default',
      packId: 'foreign-trade',
      packName: '外贸行业包',
      packVersion: '1.1.0',
      status: 'installed',
      installedCapabilities: JSON.stringify([
        "skill-ft-inquiry-grading",
        "skill-ft-outreach-email",
        "skill-ft-cost-accounting",
        "skill-ft-document-parsing",
        "skill-ft-quote-generator",
        "skill-ft-customer-profiling",
        "skill-ft-follow-up-crm",
        "skill-ft-competitor-analysis",
        "skill-ft-inquiry-priority"
      ]),
      manifest: {
        packId: 'foreign-trade',
        packName: '外贸行业包',
        packVersion: '1.1.0',
        description: '外贸行业数字化协同操作系统行业包，提供外贸专属智能体模板及询盘跟进工作流。',
        author: 'HermesClaw Team',
        targetIndustry: 'foreign-trade',
        agents: [
          { id: 'agent-001', name: 'Leon', role: '开发信写手' },
          { id: 'agent-002', name: 'Clara', role: '询盘分拣员' },
          { id: 'agent-003', name: 'Marcus', role: '客户跟进员' },
          { id: 'agent-004', name: 'Quincy', role: '报价代理' }
        ],
        capabilities: [
          { id: 'skill-ft-inquiry-grading', type: 'skill', displayName: '询盘智能分级' },
          { id: 'skill-ft-outreach-email', type: 'skill', displayName: '自动开发信生成' },
          { id: 'skill-ft-cost-accounting', type: 'skill', displayName: '产品参数提取与成本核算' },
          { id: 'skill-ft-document-parsing', type: 'skill', displayName: '单证解析与合规检查' },
          { id: 'skill-ft-quote-generator', type: 'skill', displayName: '外贸报价生成与优化' },
          { id: 'skill-ft-customer-profiling', type: 'skill', displayName: '客户画像提取与开发信多语言生成' },
          { id: 'skill-ft-follow-up-crm', type: 'skill', displayName: '客户跟进管理与 CRM 同步' },
          { id: 'skill-ft-competitor-analysis', type: 'skill', displayName: '竞品分析与市场画像' },
          { id: 'skill-ft-inquiry-priority', type: 'skill', displayName: '询盘优先级智能评估' }
        ]
      }
    }
  })

  console.log('\n✅ 种子数据填充完成！')
  console.log('   - 用户：admin@hermesclaw.ai（密码：hermesclaw2026）')
  console.log(`   - 智能体：${mockAgents.length} 条`)
  console.log(`   - 技能：${mockSkills.length} 条通用 + ${foreignTradeSkillTemplates.length} 条外贸模板`)
  console.log(`   - 连接器：${mockConnectors.length} 条`)
  console.log(`   - 项目：${mockProjects.length} 条`)
  console.log(`   - 记忆：${mockMemories.length} 条`)
  console.log(`   - Harness 提案：${seedProposals.length} 条`)
  console.log('   - 行业包安装记录：1 条 (foreign-trade)')
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
