/**
 * Prisma Seed 脚本
 * —— 从 src/lib/mock-data.ts 读取全量演示数据并写入 SQLite
 *
 * 用法：pnpm exec prisma db seed
 */
import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import bcrypt from 'bcryptjs'
import {
  mockAgents,
  mockConnectors,
  mockSkills,
  mockProjects,
  mockMemories,
  mockHarnessProposals,
} from '../src/lib/mock-data'

const adapter = new PrismaBetterSqlite3({
  url: process.env['DATABASE_URL'] ?? 'file:./dev.db',
})

const prisma = new PrismaClient({
  adapter,
  log: ['error', 'warn'],
})

async function main() {
  console.log('🌱 开始填充种子数据...\n')

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

  // ---- 技能 ----
  console.log('→ 写入技能（12 条）...')
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
  console.log('→ 写入 Harness 进化提案（3 条）...')
  for (const h of mockHarnessProposals) {
    await prisma.harnessProposal.create({
      data: {
        id: h.id,
        proposalId: h.proposalId,
        triggeredBy: h.triggeredBy,
        problemStatement: h.problemStatement,
        evidence: JSON.stringify(h.evidence),
        targetComponent: h.proposedChange.targetComponent,
        proposedChange: h.proposedChange.description,
        riskLevel: h.proposedChange.riskLevel,
        automationLevel: h.proposedChange.automationLevel,
        status: h.status,
        estimatedImpact: h.estimatedImpact,
        reviewedBy: h.reviewedBy ?? null,
        reviewedAt: h.reviewedAt ?? null,
        createdAt: new Date(h.createdAt),
      },
    })
  }

  console.log('\n✅ 种子数据填充完成！')
  console.log('   - 用户：admin@hermesclaw.ai（密码：hermesclaw2026）')
  console.log(`   - 智能体：${mockAgents.length} 条`)
  console.log(`   - 技能：${mockSkills.length} 条`)
  console.log(`   - 连接器：${mockConnectors.length} 条`)
  console.log(`   - 项目：${mockProjects.length} 条`)
  console.log(`   - 记忆：${mockMemories.length} 条`)
  console.log(`   - Harness 提案：${mockHarnessProposals.length} 条`)
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
