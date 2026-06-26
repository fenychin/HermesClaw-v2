import { prisma } from "./apps/web/src/lib/prisma"

async function main() {
  // 1. 创建枚举类型（如果不存在）
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SkillSource') THEN
        CREATE TYPE "SkillSource" AS ENUM ('BUILTIN', 'CUSTOM', 'EXTERNAL');
      END IF;
    END
    $$;
  `)

  // 2. 添加新列（如果不存在）
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Skill"
    ADD COLUMN IF NOT EXISTS "skillMdContent" TEXT,
    ADD COLUMN IF NOT EXISTS "zipPath" TEXT,
    ADD COLUMN IF NOT EXISTS "isValid" BOOLEAN NOT NULL DEFAULT true;
  `)

  // 3. 将 source 列改为枚举，并映射旧值
  // 先改为 text 再改为 enum，避免直接 alter 失败
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      -- 如果 source 还是 varchar/text，先映射转 enum
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'Skill' AND column_name = 'source'
        AND data_type IN ('character varying', 'text')
      ) THEN
        UPDATE "Skill" SET "source" = CASE "source"
          WHEN 'builtin' THEN 'BUILTIN'
          WHEN 'custom' THEN 'CUSTOM'
          WHEN 'industry-template' THEN 'EXTERNAL'
          WHEN 'pack' THEN 'EXTERNAL'
          ELSE 'CUSTOM'
        END;

        ALTER TABLE "Skill" ALTER COLUMN "source" TYPE "SkillSource"
          USING "source"::"SkillSource";
      END IF;
    END
    $$;
  `)

  // 4. 添加 workspaceId + name 唯一约束（如果不存在）
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'Skill_workspaceId_name_key'
      ) THEN
        ALTER TABLE "Skill" ADD CONSTRAINT "Skill_workspaceId_name_key" UNIQUE ("workspaceId", "name");
      END IF;
    END
    $$;
  `)

  // 5. 添加 source 索引（如果不存在）
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE indexname = 'Skill_source_idx'
      ) THEN
        CREATE INDEX "Skill_source_idx" ON "Skill"("source");
      END IF;
    END
    $$;
  `)

  console.log("✅ Skill migration applied")
}

main()
  .then(async () => {
    await prisma.$disconnect()
    process.exit(0)
  })
  .catch(async (e) => {
    console.error("Migration failed:", e)
    await prisma.$disconnect()
    process.exit(1)
  })
