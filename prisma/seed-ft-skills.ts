/**
 * seed-ft-skills.ts
 * 将外贸行业包所有 Skill 以 scoped ID 写入数据库（幂等 upsert）
 * 用法：pnpm --filter @hermesclaw/web exec tsx ../../prisma/seed-ft-skills.ts
 */
import 'dotenv/config'
import { PrismaClient } from '../apps/web/src/generated/prisma-v2/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env['DATABASE_URL'] ?? 'postgresql://postgres:postgres@localhost:5432/hermesclaw',
  max: 5
})
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter, log: ['error'] })

const WORKSPACE_ID = 'default'

const SKILLS = [
  {
    id: 'skill-ft-inquiry-analysis',
    name: '询盘意图分析',
    description: '自动分析询盘意图，提取客户关注点、关键产品及采购诉求',
    type: 'llm',
    category: 'analysis',
    prompt: `你是一名专业外贸业务分析师。请分析以下询盘内容，提取：
1. 客户意图（采购/询价/合作/其他）
2. 关注的产品或服务
3. 客户关注的核心诉求（价格/质量/交期/认证）
4. 风险信号（如是否有异常/竞争对手探价等）
5. 综合评估客户意向：high/medium/low

请以 JSON 格式输出：
{
  "intent": "采购",
  "product": "产品名称",
  "concerns": ["价格", "交期"],
  "risk": "no-risk",
  "urgency": "high",
  "summary": "综合分析摘要"
}`,
  },
  {
    id: 'skill-ft-write-development-letter',
    name: 'AI 起草开发信',
    description: '基于询盘内容与客户画像，自动生成高度个性化的外贸开发信',
    type: 'llm',
    category: 'generation',
    prompt: `你是一名专业外贸业务撰写专家。请根据以下客户信息和询盘背景，撰写一封专业的外贸开发信。

要求：
1. 语气专业、热情，符合商务礼仪
2. 突出我司核心优势（质量、交期、认证）
3. 结尾有明确的行动号召（邀请进一步沟通）
4. 英文为主，如需中文说明可附注

请输出完整的开发信正文。`,
  },
  {
    id: 'skill-ft-inquiry-grade',
    name: '询盘智能评级',
    description: '综合客户画像、询盘质量、市场行情，对询盘进行 A/B/C 三级评分',
    type: 'llm',
    category: 'analysis',
    prompt: `你是一名外贸资深业务顾问。请对以下询盘进行综合评级：

评级标准：
- A 级：高意向买家，需立即跟进
- B 级：有潜力，需要培育
- C 级：低质量或疑似虚假询盘

请输出：
{
  "grade": "A/B/C",
  "score": 85,
  "reason": "评级理由",
  "action": "建议行动"
}`,
  },
  {
    id: 'skill-ft-customer-profile',
    name: '客户画像提取',
    description: '从询盘、LinkedIn、海关数据中提取目标客户画像，构建客户档案',
    type: 'llm',
    category: 'analysis',
    prompt: `你是一名专业外贸客户研究专家。请根据提供的客户信息，构建完整的客户画像档案：

输出格式：
{
  "companyName": "公司名",
  "country": "国家",
  "industry": "行业",
  "scale": "规模（大/中/小）",
  "buyingBehavior": "采购习惯描述",
  "keyContacts": ["联系人"],
  "strengths": ["该客户的优势"],
  "risks": ["潜在风险"],
  "recommendedApproach": "建议合作切入策略"
}`,
  },
  {
    id: 'skill-ft-quote-gen',
    name: '报价方案生成',
    description: '综合成本、汇率、运费，自动生成多贸易术语报价方案',
    type: 'llm',
    category: 'generation',
    prompt: `你是一名专业外贸报价专家。请根据产品信息和成本数据，生成一份专业的报价方案：

输出格式：
{
  "product": "产品名称",
  "quantity": "数量",
  "unitPrice": "单价（USD）",
  "totalPrice": "总价（USD）",
  "incoterms": "FOB/CIF/EXW",
  "currency": "USD",
  "validUntil": "报价有效期",
  "deliveryTime": "交期",
  "paymentTerms": "付款方式",
  "notes": "备注"
}`,
  },
]

async function main() {
  console.log('🌱 写入外贸行业包 Skill（幂等 upsert）...\n')

  for (const skill of SKILLS) {
    // 以原始 ID 写入（runtime-engine 通过 prisma.skill.findUnique({ where: { id: capabilityId } }) 查找）
    await prisma.skill.upsert({
      where: { id: skill.id },
      update: {
        name: skill.name,
        description: skill.description,
      },
      create: {
        id: skill.id,
        workspaceId: WORKSPACE_ID,
        name: skill.name,
        description: skill.description,
        category: skill.category,
        status: 'active',
        automationLevel: 'L2',
        inputSchema: JSON.stringify({ type: 'object', properties: {} }),
        outputSchema: JSON.stringify({ type: 'object', properties: {} }),
        usedByAgents: JSON.stringify([]),
        scenarios: JSON.stringify(['foreign-trade']),
        skillMdContent: skill.prompt,
      },
    })
    console.log(`  ✅ ${skill.id} (${skill.name})`)
  }

  console.log('\n✅ 外贸 Skill 写入完成！')
  await prisma.$disconnect()
  await pool.end()
}

main().catch((err) => {
  console.error('❌ 写入失败:', err.message)
  console.error(err.stack)
  process.exit(1)
})
