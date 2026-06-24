/**
 * Prisma 客户端单例 — PostgreSQL (Neon) 异步驱动
 * Prisma 7 需要 adapter 而非 datasourceUrl
 */
import { PrismaClient } from "../generated/prisma-v2/client";
import { PrismaPg } from "@prisma/adapter-pg";
// @ts-ignore — pg types not installed
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const url = process.env["DATABASE_URL"] ?? "postgresql://postgres:postgres@localhost:5432/hermesclaw";
  // Neon 免费层限制 10 连接，Pool max=3 留足余量
  const pool = new Pool({ connectionString: url, max: 3 });
  const adapter = new PrismaPg(pool);

  return new PrismaClient({
    adapter,
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

if (process.env["NODE_ENV"] !== "test") {
  prisma.workspace.findUnique({ where: { id: "default" } })
    .then(async (ws) => {
      if (!ws) {
        console.log("[workspace] 创建默认 Workspace…");
        await prisma.workspace.create({
          data: { id: "default", name: "Default", plan: "pro", automationLevel: "L1", status: "active" }
        });
        console.log("[workspace] ✅ Workspace 已创建");
      }
    })
    .catch((err: unknown) => {
      console.warn("[workspace] DB:", err instanceof Error ? err.message : err);
    });
}
