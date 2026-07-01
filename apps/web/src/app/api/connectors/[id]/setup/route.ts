import { NextResponse } from "next/server"
import { withRBAC } from "@/lib/server/api-handler"
import { writeAuditLog, actorFromSession } from "@/lib/server/audit"
import { getConnectorConfig } from "@/lib/server/connector-registry"
import { encryptCredential } from "@/lib/server/crypto"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import type { AuditRiskLevel } from "@/types"

const SetupSchema = z.object({
  credentials: z.record(z.string(), z.string()), // 显式声明 2 参数以防 Zod 编译报错
  endpoint: z.string().url().optional(),
  testBeforeSave: z.boolean().default(true),
  confirmRiskAcknowledged: z.boolean(), // 用户必须主动确认风险
})

export const POST = withRBAC(async (
  req: any,
  ctx: any
) => {
  const url = new URL(req.url)
  const segments = url.pathname.split("/")
  const connectorId = segments[segments.indexOf("connectors") + 1]
  if (!connectorId) {
    return NextResponse.json({ error: "缺少连接器 ID" }, { status: 400 })
  }

  const body = SetupSchema.parse(await req.json())
  const actor = (await actorFromSession()) as string
  const workspaceId = ctx.workspaceId as string

  // 1. 读取连接器配置
  const config = await getConnectorConfig(connectorId, workspaceId)
  if (!config) {
    return NextResponse.json({ error: "Connector not found" }, { status: 404 })
  }

  // 2. 高风险连接器检查 ADMIN 权限
  const isAdmin = ctx.role === "ADMIN" || ctx.role === "OWNER"
  if (config.riskLevel === "high" && !isAdmin) {
    await writeAuditLog({
      actor,
      action: "CONNECTOR_SETUP_DENIED",
      targetType: "connector",
      targetId: connectorId,
      detail: `非管理员用户尝试配置高风险连接器 ${connectorId}`,
      riskLevel: "high" as AuditRiskLevel,
      workspaceId,
    })
    return NextResponse.json({
      error: "高风险连接器（ERP/L3）只有管理员可以配置",
      requiresRole: "ADMIN"
    }, { status: 403 })
  }

  // 3. 风险确认必须为 true
  if (!body.confirmRiskAcknowledged) {
    return NextResponse.json({
      error: "必须确认已了解连接器数据访问范围与风险"
    }, { status: 400 })
  }

  // 4. 验证所有必需的环境变量都已提供
  const missingVars = (config.requiredEnvVars ?? []).filter(
    (key: string) => !body.credentials[key]
  )
  if (missingVars.length > 0) {
    return NextResponse.json({
      error: `缺少必需凭证字段：${missingVars.join(", ")}`
    }, { status: 400 })
  }

  // 5. 先测试连通性再保存
  if (body.testBeforeSave && config.healthCheckUrl) {
    const resolvedUrl = config.healthCheckUrl
      ? config.healthCheckUrl.replace(
          /\$\{(\w+)\}/g,
          (_, key) => body.credentials[key] ?? process.env[key] ?? ""
        )
      : null

    if (resolvedUrl) {
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 5000)

        const response = await fetch(resolvedUrl as string, {
          method: "GET",
          signal: controller.signal,
          headers: {
            "User-Agent": "HermesClaw-HealthCheck/1.0",
            "Accept": "application/json",
          },
        })
        clearTimeout(timeout)

        if (response.status < 200 || response.status >= 300) {
          return NextResponse.json({
            error: `保存前健康检测失败，端点 HTTP 状态码: ${response.status}`
          }, { status: 424 })
        }
      } catch (err: any) {
        return NextResponse.json({
          error: `保存前健康检测失败: ${err.message}`
        }, { status: 424 })
      }
    }
  }

  // 6. 加密凭证存储
  const encryptedCredentials: Record<string, string> = {}
  for (const [key, value] of Object.entries(body.credentials)) {
    encryptedCredentials[key] = await encryptCredential(value)
  }

  // 7. 写入数据库
  const connectorSetup = await prisma.connectorSetup.upsert({
    where: {
      workspaceId_connectorId: {
        workspaceId,
        connectorId,
      }
    },
    create: {
      workspaceId,
      connectorId,
      encryptedCredentials: JSON.stringify(encryptedCredentials),
      status: config.requiresApproval ? "pending_approval" : "active",
      configuredBy: actor,
      riskLevel: config.riskLevel,
    },
    update: {
      encryptedCredentials: JSON.stringify(encryptedCredentials),
      status: config.requiresApproval ? "pending_approval" : "active",
      updatedAt: new Date(),
    }
  })

  // 8. 写高风险审计日志
  await writeAuditLog({
    actor,
    action: config.riskLevel === "high"
      ? "CONNECTOR_SETUP_HIGH_RISK"
      : "CONNECTOR_SETUP_COMPLETED",
    targetType: "connector",
    targetId: connectorId,
    detail: config.requiresApproval
      ? `高风险连接器 ${connectorId} 配置完成，进入待审批状态，等待第二个 ADMIN 审批激活`
      : `连接器 ${connectorId} 配置完成并激活`,
    riskLevel: (config.riskLevel === "high" ? "high" : "low") as AuditRiskLevel,
    workspaceId,
    contextSnapshot: {
      connectorId,
      authType: config.authType,
      configuredEnvVars: Object.keys(body.credentials),
      requiresApproval: config.requiresApproval,
    }
  })

  return NextResponse.json({
    success: true,
    connectorId,
    status: connectorSetup.status,
    requiresApproval: config.requiresApproval,
    message: config.requiresApproval
      ? "连接器配置已保存，等待管理员审批激活"
      : "连接器已激活",
  })
}, "MEMBER")
