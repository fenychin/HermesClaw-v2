import { NextResponse } from "next/server"
import { withRBAC, type RouteContext } from "@/lib/server/api-handler"
import { writeAuditLog, actorFromSession } from "@/lib/server/audit"
import { getConnectorConfig } from "@/lib/server/connector-registry"
import type { WorkspaceContext } from "@/lib/workspace"

export const GET = withRBAC(async (
  req: Request,
  ctx: WorkspaceContext,
  routeCtx: RouteContext<{ connectorId: string }>
) => {
  const { connectorId } = await routeCtx.params
  const actor = await actorFromSession()
  const startTime = Date.now()

  // 1. 从注册表读取连接器配置（传递 workspaceId）
  const config = await getConnectorConfig(connectorId, ctx.workspaceId)
  if (!config) {
    return NextResponse.json({ error: "Connector not found" }, { status: 404 })
  }

  // 2. 解析 healthCheckUrl（替换环境变量占位符）
  const resolvedUrl = config.healthCheckUrl
    ? config.healthCheckUrl.replace(
        /\$\{(\w+)\}/g,
        (_, key) => process.env[key] ?? ""
      )
    : null

  let status: "healthy" | "degraded" | "unreachable" | "unconfigured" = "unconfigured"
  let latency: number | null = null
  let statusCode: number | null = null
  let errorMessage: string | null = null
  let missingEnvVars: string[] = []

  // 3. 检查必需环境变量是否已配置
  missingEnvVars = (config.requiredEnvVars ?? []).filter(
    (envKey: string) => !process.env[envKey]
  )

  if (missingEnvVars.length > 0) {
    status = "unconfigured"
    errorMessage = `缺少环境变量：${missingEnvVars.join(", ")}`
  } else if (resolvedUrl) {
    // 4. 执行真实 HTTP ping（5s 超时）
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)

      const response = await fetch(resolvedUrl, {
        method: "GET",
        signal: controller.signal,
        headers: {
          "User-Agent": "HermesClaw-HealthCheck/1.0",
          "Accept": "application/json",
        },
      })
      clearTimeout(timeout)

      latency = Date.now() - startTime
      statusCode = response.status

      if (response.status >= 200 && response.status < 300) {
        status = latency > 2000 ? "degraded" : "healthy"
      } else if (response.status >= 400 && response.status < 500) {
        status = "degraded"
        errorMessage = `认证失败或端点错误：HTTP ${response.status}`
      } else {
        status = "unreachable"
        errorMessage = `服务器错误：HTTP ${response.status}`
      }
    } catch (err: any) {
      latency = Date.now() - startTime
      status = "unreachable"
      errorMessage = err.name === "AbortError"
        ? "连接超时（>5s）"
        : `网络错误：${err.message}`
    }
  } else if (config.channel === "webhook") {
    // webhook 模式无主动 ping，检查 secret 是否配置
    status = missingEnvVars.length === 0 ? "healthy" : "unconfigured"
  }

  // 5. 写审计日志（健康检测也需要追踪）
  await writeAuditLog({
    actor,
    action: "CONNECTOR_HEALTH_CHECKED",
    targetType: "connector",
    targetId: connectorId,
    detail: `健康检测结果：${status}，延迟：${latency ?? "N/A"}ms，HTTP：${statusCode ?? "N/A"}`,
    riskLevel: status === "unreachable" ? "medium" : "low",
    workspaceId: ctx.workspaceId,
  })

  return NextResponse.json({
    connectorId,
    status,
    latency,
    statusCode,
    errorMessage,
    missingEnvVars,
    testedAt: new Date().toISOString(),
    auditWritten: true,
    // 安全：不暴露实际端点 URL 和凭证
    configuredAuthType: config.authType,
    riskLevel: config.riskLevel,
  })
}, "VIEWER")
