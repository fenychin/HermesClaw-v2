/**
 * 为外贸行业包的 8 个技能补充 skillMdContent
 *
 * 使用（在项目根目录）：
 *   npx tsx --tsconfig apps/web/tsconfig.json prisma/seed-industry-skill-md.ts
 * 使用（在 apps/web）：
 *   npx tsx ../../prisma/seed-industry-skill-md.ts
 */
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

// 支持从项目根目录或 apps/web 目录运行
const PROJECT_ROOT = process.cwd().endsWith("apps/web") || process.cwd().endsWith("apps\\web")
  ? path.resolve(process.cwd(), "../..") 
  : process.cwd();

const prisma = new PrismaClient();

/** 技能 ID → 对应的 SKILL.md 文件路径 */
const SKILL_MD_MAP: Array<{
  /** 数据库中 Skill.name 字段值（displayName） */
  displayName: string;
  /** 对应的 SKILL.md 文件（相对于项目根目录） */
  mdFile: string;
}> = [
  {
    displayName: "客户画像分析",
    mdFile: "industry-packs/foreign-trade/skills/customer-profile.SKILL.md",
  },
  {
    displayName: "报价策略生成",
    mdFile: "industry-packs/foreign-trade/skills/quote-gen.SKILL.md",
  },
  {
    displayName: "开发信生成",
    mdFile: "industry-packs/foreign-trade/skills/dev-letter.SKILL.md",
  },
  {
    displayName: "询盘深度分析",
    mdFile: "industry-packs/foreign-trade/skills/inquiry-grade.SKILL.md",
  },
  {
    displayName: "自动生成报价单",
    mdFile: "industry-packs/foreign-trade/skills/generate-quotation.SKILL.md",
  },
  {
    displayName: "撰写开发信",
    mdFile: "industry-packs/foreign-trade/skills/write-development-letter.SKILL.md",
  },
  {
    displayName: "调用智能体",
    mdFile: "industry-packs/foreign-trade/skills/agent-dispatch.SKILL.md",
  },
  {
    displayName: "创建项目空间",
    mdFile: "industry-packs/foreign-trade/skills/project-space.SKILL.md",
  },
];

async function main() {
  const root = PROJECT_ROOT;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const entry of SKILL_MD_MAP) {
    const mdPath = path.join(root, entry.mdFile);

    // 读取 SKILL.md 文件
    if (!fs.existsSync(mdPath)) {
      console.warn(`⚠️  SKILL.md 文件不存在，跳过: ${mdPath}`);
      skipped++;
      continue;
    }
    const content = fs.readFileSync(mdPath, "utf-8");

    // 查找数据库中所有 name = displayName 的 Skill（可能有多个工作空间）
    const skills = await prisma.skill.findMany({
      where: {
        name: entry.displayName,
        status: { not: "inactive" },
      },
    });

    if (skills.length === 0) {
      console.warn(`⚠️  数据库中未找到技能「${entry.displayName}」，跳过`);
      skipped++;
      continue;
    }

    for (const skill of skills) {
      await prisma.skill.update({
        where: { id: skill.id },
        data: {
          skillMdContent: content,
          // 同时修复 isValid 字段（确保技能可被调用）
          isValid: true,
          status: "active",
        },
      });
      console.log(
        `✅  已更新「${entry.displayName}」(${skill.id}) skillMdContent (${content.length} chars)`
      );
      updated++;
    }
  }

  console.log(`\n📊 完成：更新 ${updated} 条，跳过 ${skipped} 条`);
  if (errors.length > 0) {
    console.error("❌ 错误：", errors);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
