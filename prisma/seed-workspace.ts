/**
 * Workspace 初始化种子：为现有数据库创建默认工作空间并分配所有用户
 * —— 向后兼容：所有无 workspaceId 的旧数据均归属默认 Workspace
 */
import { PrismaClient } from "../src/generated/prisma-new/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({
  url: process.env["DATABASE_URL"] ?? "file:./dev.db",
});
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 初始化默认 Workspace…");

  // 1. 创建默认 Workspace（幂等）
  const workspace = await prisma.workspace.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      name: "默认工作空间",
      plan: "free",
    },
  });
  console.log(`   Workspace: ${workspace.id} — ${workspace.name}`);

  // 2. 将所有现有用户加入默认 Workspace（OWNER 角色）
  const users = await prisma.user.findMany();
  for (const user of users) {
    await prisma.workspaceMember.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: workspace.id,
          userId: user.id,
        },
      },
      update: {},
      create: {
        workspaceId: workspace.id,
        userId: user.id,
        role: "OWNER",
      },
    });
  }
  console.log(`   已分配 ${users.length} 位用户为 OWNER`);

  console.log("✅ 默认 Workspace 初始化完成");
}

main()
  .catch((e) => {
    console.error("❌ 种子脚本失败:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
