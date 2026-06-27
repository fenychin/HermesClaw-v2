/**
 * Prisma 客户端单例
 * —— 使用 BetterSqlite3 驱动适配器（本地开发 / 单机部署使用 SQLite）
 * —— 开发热重载时避免重复创建客户端实例
 * —— 切换 PostgreSQL 时：移除 adapter，PrismaClient 会自动读取
 *    DATABASE_URL 中的 ?connection_limit=10&pool_timeout=20 连接池参数
 */
import { PrismaClient } from "@/generated/prisma-v2/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const adapter = new PrismaBetterSqlite3({
    url: process.env["DATABASE_URL"] ?? "file:./dev.db",
  });
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
