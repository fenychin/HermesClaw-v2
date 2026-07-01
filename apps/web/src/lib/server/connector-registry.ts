import { prisma } from "@/lib/prisma"

export interface ConnectorConfig {
  id: string
  name: string
  description: string
  category: string
  provider: string
  channel?: string
  authType: "none" | "apikey" | "oauth2" | "basic" | "webhook-secret"
  riskLevel: "low" | "medium" | "high"
  automationLevel: string
  requiresApproval?: boolean
  approvalReason?: string
  healthCheckUrl: string | null
  endpointEnvVar?: string
  requiredEnvVars?: string[]
  dataAccess?: {
    read?: string[]
    write?: string[]
  }
  auditFields?: string[]
}

/**
 * 从数据库中读取并解析连接器的原始 YAML 映射配置。
 * 支持直接 ID、带 workspace 前缀的 ID，以及模糊匹配。
 */
export async function getConnectorConfig(
  connectorId: string,
  workspaceId?: string
): Promise<ConnectorConfig | null> {
  // 1. 尝试直接以 connectorId 查找
  let conn = await prisma.connector.findUnique({
    where: { id: connectorId }
  })

  // 2. 如果没找到，且提供了 workspaceId，尝试以 workspaceId:connectorId 查找
  if (!conn && workspaceId) {
    const scopedId = connectorId.startsWith(`${workspaceId}:`)
      ? connectorId
      : `${workspaceId}:${connectorId}`
    conn = await prisma.connector.findUnique({
      where: { id: scopedId }
    })
  }

  // 3. 如果还是没有找到，且提供了 workspaceId 且 connectorId 没有前缀，
  // 尝试在 workspaceId 下根据后缀模糊查找
  if (!conn && workspaceId) {
    conn = await prisma.connector.findFirst({
      where: {
        workspaceId,
        id: {
          endsWith: `:${connectorId}`
        }
      }
    })
  }

  if (!conn) return null

  // 4. 解析 config 字段（因为 mapping.yaml 里的完整配置均被打包存于 config 中）
  const configObj = conn.config as any
  if (!configObj) return null

  return {
    id: conn.id,
    name: conn.name,
    description: conn.description,
    category: conn.category,
    provider: (configObj.provider as string) || "unknown",
    channel: configObj.channel as string,
    authType: (configObj.authType as ConnectorConfig["authType"]) || "none",
    riskLevel: (configObj.riskLevel as ConnectorConfig["riskLevel"]) || "low",
    automationLevel: (configObj.automationLevel as string) || "L1",
    requiresApproval: configObj.requiresApproval ?? false,
    approvalReason: configObj.approvalReason,
    healthCheckUrl: configObj.healthCheckUrl ?? null,
    endpointEnvVar: configObj.endpointEnvVar,
    requiredEnvVars: configObj.requiredEnvVars ?? [],
    dataAccess: configObj.dataAccess,
    auditFields: configObj.auditFields,
  }
}
