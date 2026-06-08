import { prisma } from "@/lib/prisma";

/**
 * 健康检查：验证服务、数据库与 AI Provider 状态
 * —— 200 表示全量健康，503 表示部分组件异常
 */
export async function GET() {
  const checks = {
    service: "hermesclaw-v2",
    version: process.env.npm_package_version || "1.0.0",
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: "unknown" as string,
    ai: "unknown" as string,
  };

  // 检查数据库连通性
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch {
    checks.database = "error";
  }

  // 检查 AI（不实际调用，只检查 key 是否存在）
  checks.ai = process.env.ANTHROPIC_API_KEY ? "configured" : "missing";

  const allOk = checks.database === "ok" && checks.ai === "configured";

  return Response.json(
    { ok: allOk, ...checks },
    { status: allOk ? 200 : 503 },
  );
}
