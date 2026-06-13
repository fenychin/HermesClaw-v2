/**
 * 外贸行业技能模板种子脚本
 * —— 读取 .claude/skills/ft-{name}/SKILL.md（Claude Code Skills 规范），
 *    解析 YAML frontmatter + Markdown 正文，写入 Prisma Skill 表。
 *
 * 所有 Skill 均遵循 Claude Code Skills 开放标准：
 *   https://code.claude.com/docs/zh-CN/skills
 *   https://agentskills.io
 *
 * 覆盖岗位：询盘分拣员 / 开发信撰写员 / 报价代理 / 客户跟进员 / 单证员 / 市场研究员
 *
 * 用法：
 *   pnpm seed:skills                       # 独立运行（幂等 upsert）
 *   pnpm exec tsx prisma/seed-skills.ts    # 等效
 */
import 'dotenv/config'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { createSeedPrisma } from './seed-utils'
import { stringifyJsonField } from '../src/lib/api-utils'

const prisma = createSeedPrisma()

// ============================================================
// 类型定义 —— 与 Claude Code Skills frontmatter 对齐
// ============================================================

/** 从 SKILL.md 解析出的技能模板，字段对应 Claude Code Skills 规范 */
export interface ForeignTradeSkillTemplate {
  /** 技能名称（对应 SKILL.md frontmatter name） */
  name: string
  /** 所属行业（对应 SKILL.md frontmatter industry） */
  industry: 'foreign-trade'
  /** 对应岗位（对应 SKILL.md frontmatter role） */
  role: string
  /** 技能描述（对应 SKILL.md frontmatter description） */
  description: string
  /** Claude Code 授权工具列表（对应 SKILL.md frontmatter allowed-tools） */
  allowedTools: string[]
  /** 是否禁止模型自动调用（对应 SKILL.md frontmatter disable-model-invocation） */
  disableModelInvocation: boolean
  /** 能力清单 —— 对应 AGENTS.md §4.1 can_do */
  capabilities: string[]
  /** 约束清单 —— 对应 AGENTS.md §4.1 cannot_do + §4.5 安全护栏 */
  constraints: string[]
  /** 所需连接器 / 外部工具 */
  toolRequirements: string[]
  /** SKILL.md 所在目录名（即命令名，如 ft-inquiry-sorter） */
  commandName: string
}

/** Prisma Skill 表写入记录 */
export interface SkillDbRecord {
  name: string
  description: string
  version: string
  category: string
  source: string
  status: string
  inputSchema: string
  outputSchema: string
  usedByAgents: string
  scenarios: string
}

// ============================================================
// Skill → Prisma 映射（单一事实来源，供 seed.ts 复用）
// ============================================================

/**
 * 将 ForeignTradeSkillTemplate 转换为 Prisma Skill 写入记录
 * —— 这是 Claude Code Skills 文件与数据库之间的唯一映射桥梁，
 *    seed-skills.ts 和 seed.ts 均通过此函数写入，避免重复逻辑。
 */
export function toSkillDbRecord(tmpl: ForeignTradeSkillTemplate): SkillDbRecord {
  return {
    name: tmpl.name,
    description: tmpl.description,
    version: 'v1.0.0',
    category: `foreign-trade:${tmpl.role}`,
    source: 'industry-template',
    status: 'active',
    inputSchema: stringifyJsonField({
      role: tmpl.role,
      capabilities: tmpl.capabilities,
      commandName: tmpl.commandName,
      allowedTools: tmpl.allowedTools,
    }),
    outputSchema: stringifyJsonField({
      constraints: tmpl.constraints,
      disableModelInvocation: tmpl.disableModelInvocation,
    }),
    usedByAgents: stringifyJsonField([]),
    scenarios: stringifyJsonField(tmpl.toolRequirements),
  }
}

// ============================================================
// SKILL.md 解析器
// ============================================================

/** 技能扫描目录 */
const SKILLS_DIR = path.resolve(__dirname, '../.claude/skills')

/**
 * 解析 SKILL.md 的 YAML frontmatter 与 Markdown 正文
 * 遵循 Claude Code Skills 规范：https://code.claude.com/docs/zh-CN/skills
 */
function parseSkillMd(raw: string): {
  frontmatter: Record<string, string>
  body: string
} {
  // 匹配 --- ... --- 包裹的 YAML frontmatter
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!fmMatch) {
    return { frontmatter: {}, body: raw }
  }

  const frontmatter: Record<string, string> = {}
  for (const line of fmMatch[1].split(/\r?\n/)) {
    const kv = line.match(/^([\w-]+):\s*(.*)$/)
    if (kv) {
      frontmatter[kv[1]] = kv[2].trim()
    }
  }

  return { frontmatter, body: fmMatch[2].trim() }
}

/**
 * 从 Markdown 正文中提取指定标题下的无序列表项
 */
function extractListItems(body: string, headingPattern: RegExp): string[] {
  const sectionMatch = body.match(headingPattern)
  if (!sectionMatch) return []

  // 从标题后截取到下一个 ## 标题或文档末尾
  const sectionStart = (sectionMatch.index ?? 0) + sectionMatch[0].length
  const rest = body.slice(sectionStart)
  const nextHeading = rest.match(/^## /m)
  const section = nextHeading ? rest.slice(0, nextHeading.index) : rest

  const items: string[] = []
  for (const line of section.split(/\r?\n/)) {
    const item = line.match(/^[-*]\s+(.+)$/)
    if (item) {
      items.push(item[1].trim())
    }
  }
  return items
}

/**
 * 解析 allowed-tools 字段（YAML 中为空格分隔的工具名或行内数组）
 */
function parseAllowedTools(raw: string | undefined): string[] {
  if (!raw) return []
  // 空格分隔或 YAML 行内数组 [a, b, c]
  if (raw.startsWith('[')) {
    return raw
      .replace(/[\[\]]/g, '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return raw.split(/\s+/).filter(Boolean)
}

// ============================================================
// 从 .claude/skills/ 加载所有外贸技能
// ============================================================

/**
 * 扫描 .claude/skills/ft-{name}/ 目录，解析每个 SKILL.md 文件，
 * 返回符合 Claude Code Skills 规范的 ForeignTradeSkillTemplate 列表。
 *
 * 异常安全：单个文件读取失败不会中断整体扫描，跳过异常 Skill 并输出警告。
 */
export function loadForeignTradeSkills(skillsDir?: string): ForeignTradeSkillTemplate[] {
  const dir = skillsDir ?? SKILLS_DIR

  try {
    if (!fs.existsSync(dir)) {
      console.warn(`⚠ 技能目录不存在：${dir}`)
      return []
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true })
    const templates: ForeignTradeSkillTemplate[] = []

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      // 仅处理外贸技能目录（ft- 前缀）
      if (!entry.name.startsWith('ft-')) continue

      const mdPath = path.join(dir, entry.name, 'SKILL.md')
      if (!fs.existsSync(mdPath)) {
        console.warn(`⚠ 跳过 ${entry.name}：缺少 SKILL.md`)
        continue
      }

      // 读取文件，失败时跳过单个 Skill 而非崩溃
      let raw: string
      try {
        raw = fs.readFileSync(mdPath, 'utf-8')
      } catch (err) {
        console.warn(`⚠ 跳过 ${entry.name}：读取 SKILL.md 失败 — ${(err as Error).message}`)
        continue
      }

      const { frontmatter, body } = parseSkillMd(raw)

      // 仅处理外贸行业的技能
      if (frontmatter['industry'] !== 'foreign-trade') continue

      const capabilities = extractListItems(body, /^##\s+能力清单\s*\(can_do\)/m)
      const constraints = extractListItems(body, /^##\s+约束条件\s*\(cannot_do\)/m)
      const toolRequirements = extractListItems(body, /^##\s+所需工具\s*[\/／]\s*连接器/m)

      templates.push({
        name: frontmatter['name'] ?? entry.name,
        industry: 'foreign-trade',
        role: frontmatter['role'] ?? '未知岗位',
        description: frontmatter['description'] ?? '',
        allowedTools: parseAllowedTools(frontmatter['allowed-tools']),
        disableModelInvocation: frontmatter['disable-model-invocation'] === 'true',
        capabilities,
        constraints,
        toolRequirements,
        commandName: entry.name,
      })
    }

    return templates
  } catch (err) {
    // 整体扫描失败（如权限不足），输出错误但返回空数组而非崩溃
    console.error(`❌ 扫描技能目录失败：${(err as Error).message}`)
    return []
  }
}

// ============================================================
// 导出：所有已加载的外贸技能模板（供 seed.ts 引用）
// ============================================================
export const foreignTradeSkillTemplates = loadForeignTradeSkills()

// ============================================================
// 写入数据库（幂等 upsert）
// ============================================================
async function main() {
  console.log('🌱 Claude Code Skills → Prisma Skill 导入\n')
  console.log(`📂 扫描目录：${SKILLS_DIR}`)
  console.log(`📄 找到 ${foreignTradeSkillTemplates.length} 个外贸技能模板\n`)

  if (foreignTradeSkillTemplates.length === 0) {
    console.error('❌ 未找到任何外贸技能 SKILL.md 文件，请检查 .claude/skills/ft-*/ 目录')
    process.exit(1)
  }

  let created = 0
  let updated = 0

  for (const tmpl of foreignTradeSkillTemplates) {
    const skillId = `skill-${tmpl.commandName}`
    const data = toSkillDbRecord(tmpl)

    const existing = await prisma.skill.findUnique({ where: { id: skillId } })
    if (existing) {
      await prisma.skill.update({ where: { id: skillId }, data })
      updated++
    } else {
      await prisma.skill.create({ data: { id: skillId, ...data } })
      created++
    }

    console.log(`  ${existing ? '🔄' : '✅'} ${tmpl.commandName} → ${skillId}`)
  }

  // 按岗位统计
  const roleCounts = new Map<string, number>()
  for (const tmpl of foreignTradeSkillTemplates) {
    roleCounts.set(tmpl.role, (roleCounts.get(tmpl.role) ?? 0) + 1)
  }

  console.log(`\n✅ 导入完成！`)
  console.log(`   - 新增：${created} 条`)
  console.log(`   - 更新：${updated} 条`)
  console.log(`   - 合计：${foreignTradeSkillTemplates.length} 个 Claude Code Skills`)
  console.log(`\n   按岗位分布：`)
  for (const [role, count] of roleCounts) {
    console.log(`     /ft-*  ${role}：${count} 个技能`)
  }
}

// ============================================================
// 独立执行入口
// ============================================================
const runningDirectly =
  process.argv[1] &&
  (process.argv[1].endsWith('seed-skills.ts') || process.argv[1].endsWith('seed-skills'))

if (runningDirectly) {
  main()
    .then(async () => {
      await prisma.$disconnect()
    })
    .catch(async (e) => {
      console.error('❌ Seed skills 失败：', e)
      await prisma.$disconnect()
      process.exit(1)
    })
}
