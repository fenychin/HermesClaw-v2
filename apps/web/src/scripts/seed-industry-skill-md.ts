/**
 * 为外贸行业包的 8 个技能补充 skillMdContent
 *
 * 使用（在 apps/web 目录下）：
 *   npx tsx src/scripts/seed-industry-skill-md.ts
 */
import { PrismaClient } from "../generated/prisma-v2/client";
import { PrismaPg } from "@prisma/adapter-pg";
// @ts-ignore
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

// 项目根目录（从 apps/web/src/scripts 往上 4 级）
const PROJECT_ROOT = path.resolve(__dirname, "../../../..");

const pool = new Pool({
  connectionString: process.env["DATABASE_URL"] ?? "postgresql://postgres:postgres@localhost:5432/hermesclaw",
  max: 3,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

/** 技能 displayName → 对应的 SKILL.md 文件路径（相对项目根目录） */
const SKILL_MD_MAP: Array<{
  displayName: string;
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
  let updated = 0;
  let skipped = 0;

  console.log(`\n🔍 项目根目录: ${PROJECT_ROOT}\n`);

  for (const entry of SKILL_MD_MAP) {
    const mdPath = path.join(PROJECT_ROOT, entry.mdFile);

    if (!fs.existsSync(mdPath)) {
      console.warn(`⚠️  SKILL.md 文件不存在，跳过: ${mdPath}`);
      skipped++;
      continue;
    }
    const content = fs.readFileSync(mdPath, "utf-8");

    // 查找数据库中所有 name = displayName 的 Skill
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
          isValid: true,
          status: "active",
        },
      });
      console.log(`✅ 已更新「${entry.displayName}」(${skill.id}) — ${content.length} chars`);
      updated++;
    }
  }

  console.log(`\n📊 完成：更新 ${updated} 条，跳过 ${skipped} 条\n`);
}

main()
  .then(() => {
    pool.end();
  })
  .catch((e) => {
    console.error("❌ 错误:", e);
    pool.end();
    process.exit(1);
  });
