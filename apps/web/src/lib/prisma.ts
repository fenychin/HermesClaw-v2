/**
 * Prisma 客户端单例
 * —— 使用 PostgreSQL 异步驱动，不阻塞事件循环（CLAUDE.md §11.8 反模式 9）
 * —— Prisma 7.x 要求必须传入 adapter 或 accelerateUrl（engine type "client"）
 * —— 开发热重载时避免重复创建客户端实例
 */
import { PrismaClient } from "@/generated/prisma-v2/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const connectionString =
    process.env["DATABASE_URL"] ?? "postgresql://localhost:5432/hermesclaw_dev";
  const pool = new Pool({ connectionString, max: 10 });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({
    adapter,
    // 开发环境启 query 日志方便调试；生产环境仅记录 error 减少开销
    log:
      process.env["NODE_ENV"] === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env["NODE_ENV"] !== "production") {
  globalForPrisma.prisma = prisma;
}

// 启动时一次性校验默认 Workspace 存在性（从 buildWorkspaceContext 移出，避免每次请求重复查询）
// 测试环境跳过（避免干扰测试用 DB 初始化顺序）
if (process.env["NODE_ENV"] !== "test") {
  prisma.workspace
    .findUnique({ where: { id: "default" } })
    .then((ws) => {
      if (!ws) {
        console.error(
          "[workspace] 启动检查：默认 Workspace 不存在，数据库可能未初始化（运行 prisma db seed）",
        );
      }
    })
    .catch((err: unknown) => {
      console.warn(
        "[workspace] 启动检查：默认 Workspace 查询失败",
        err instanceof Error ? err.message : err,
      );
    });
}
