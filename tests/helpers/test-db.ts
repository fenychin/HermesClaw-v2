/**
 * 测试数据库辅助工具
 * —— 使用真实 Prisma schema + 内存 SQLite 做测试隔离
 */
import { PrismaClient } from "@/generated/prisma-v2";
import { execSync } from "child_process";
import path from "path";
import fs from "fs";

let testPrisma: PrismaClient | null = null;

/** 获取测试专用 Prisma 实例（SQLite 内存） */
export function getTestDb(): PrismaClient {
  if (testPrisma) return testPrisma;

  // 使用环境变量指向测试数据库
  const dbPath = path.join(process.cwd(), "tests", ".test.db");
  process.env.DATABASE_URL = `file:${dbPath}`;

  testPrisma = new PrismaClient({
    log: ["warn", "error"],
  });

  return testPrisma;
}

/** 运行 Prisma migrate 初始化测试数据库 */
export async function setupTestDb(): Promise<PrismaClient> {
  const db = getTestDb();

  // Push schema（比 migrate 更快，适合测试）
  const schemaPath = path.join(process.cwd(), "prisma", "schema.prisma");
  execSync(`npx prisma db push --schema="${schemaPath}" --skip-generate --accept-data-loss 2>&1`, {
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL || `file:${path.join(process.cwd(), "tests", ".test.db")}`,
    },
  });

  return db;
}

/** 清理测试数据库 */
export async function cleanupTestDb(): Promise<void> {
  if (testPrisma) {
    await testPrisma.$disconnect();
    testPrisma = null;
  }

  const dbPath = path.join(process.cwd(), "tests", ".test.db");
  const journalPath = dbPath + "-journal";
  try {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    if (fs.existsSync(journalPath)) fs.unlinkSync(journalPath);
  } catch {
    // ignore
  }
}

/** 创建测试用种子用户 */
export async function seedTestUser(
  db: PrismaClient,
  overrides: {
    email?: string;
    password?: string;
    name?: string;
    role?: string;
  } = {}
) {
  const bcrypt = await import("bcryptjs");
  const email = overrides.email || "test@hermesclaw.ai";
  const password = overrides.password || "testpass123";
  const hashedPassword = await bcrypt.hash(password, 10);

  return db.user.create({
    data: {
      email,
      password: hashedPassword,
      name: overrides.name || "Test User",
      role: overrides.role || "member",
    },
  });
}

/** 创建测试用 Workspace */
export async function seedTestWorkspace(
  db: PrismaClient,
  overrides: { name?: string; plan?: string } = {}
) {
  return db.workspace.create({
    data: {
      name: overrides.name || "Test Workspace",
      plan: overrides.plan || "free",
    },
  });
}

/** 添加用户到 Workspace */
export async function addUserToWorkspace(
  db: PrismaClient,
  userId: string,
  workspaceId: string,
  role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER" = "MEMBER"
) {
  return db.workspaceMember.create({
    data: {
      userId,
      workspaceId,
      role,
    },
  });
}
