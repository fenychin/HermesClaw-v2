/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from 'fs'
import path from 'path'
import { prisma } from "@/lib/prisma"
import { writeAuditLog } from "./audit"
import {
  registerCapability,
  deprecateCapability,
  CapabilityAlreadyRegisteredError
} from "./capability-registry"
import { validateManifest, type IndustryPackManifest } from "@hermesclaw/event-contracts"
import { validateIndustryPackCompatibility } from "@hermesclaw/industry-pack-sdk"
import type { IndustryPackInstallation, Prisma } from "@/generated/prisma-v2/client"
import { compareSemver, satisfiesSemver } from "./utils/semver"
export { satisfiesSemver }

export const PACK_LOADER_VERSION = '2.0'
export const MAX_DEPENDENCY_DEPTH = 5        // 最大依赖递归深度（防止深度循环）
export const INSTALLATION_TIMEOUT_MS = 5 * 60 * 1000  // 安装超时 5 分钟

// 错误定义
export class PackManifestInvalidError extends Error {
  constructor(packId: string, errors: string[]) {
    super(`Pack manifest invalid for ${packId}: ${errors.join('; ')}`)
    this.name = 'PackManifestInvalidError'
  }
}

export class PackAlreadyInstalledError extends Error {
  constructor(packId: string, version: string) {
    super(`Pack ${packId}@${version} is already installed`)
    this.name = 'PackAlreadyInstalledError'
  }
}

export class PackDependencyNotMetError extends Error {
  constructor(packId: string, dependencyPackId: string, requiredVersion: string) {
    super(`Pack ${packId} requires ${dependencyPackId}@${requiredVersion} but it is not installed`)
    this.name = 'PackDependencyNotMetError'
  }
}

export class PackInstallationNotFoundError extends Error {
  constructor(packId: string, version?: string) {
    super(`Pack installation not found for ${packId}${version ? `@${version}` : ''}`)
    this.name = 'PackInstallationNotFoundError'
  }
}

export class PackCoreVersionIncompatibleError extends Error {
  constructor(packId: string, systemVersion: string, requiredVersion: string) {
    super(`Pack ${packId} requires core version ${requiredVersion} but current system version is ${systemVersion}`)
    this.name = 'PackCoreVersionIncompatibleError'
  }
}

export interface PackLoaderDeps {
  prisma?: typeof prisma
  writeAuditLog?: typeof writeAuditLog
  getSystemVersion?: () => string
  registerCapability?: typeof registerCapability
  deprecateCapability?: typeof deprecateCapability
}

function getSystemVersion(): string {
  try {
    const pkgPath = path.join(process.cwd(), 'package.json')
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
    return pkg.version || '0.0.0'
  } catch {
    return '0.0.0'
  }
}

// 敏感词处理
function sanitizeConfigTemplate(obj: unknown): unknown {
  if (!obj || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) {
    return obj.map(sanitizeConfigTemplate)
  }
  const result: Record<string, any> = {}
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase()
    if (typeof value === 'string' &&
        (lowerKey.includes('password') || lowerKey.includes('secret') || lowerKey.includes('key'))) {
      result[key] = 'env:PLACEHOLDER'
    } else if (typeof value === 'object') {
      result[key] = sanitizeConfigTemplate(value)
    } else {
      result[key] = value
    }
  }
  return result
}

// 递归依赖项解析校验
async function verifyDependencyResolved(
  packId: string,
  requiredVersionRange: string,
  workspaceId: string,
  currentDepth: number,
  visited: Set<string>,
  activePrisma: any
): Promise<void> {
  if (currentDepth > MAX_DEPENDENCY_DEPTH) {
    throw new Error(`Dependency resolution depth exceeded limit of ${MAX_DEPENDENCY_DEPTH} at pack ${packId}`)
  }

  // 1. 查找安装记录
  const inst = await activePrisma.industryPackInstallation.findFirst({
    where: {
      workspaceId,
      packId,
      status: 'installed'
    },
    orderBy: { createdAt: 'desc' }
  })

  if (!inst) {
    throw new PackDependencyNotMetError(Array.from(visited)[0] || 'pack', packId, requiredVersionRange)
  }

  // 2. 校验版本是否满足
  if (!satisfiesSemver(inst.packVersion, requiredVersionRange)) {
    throw new PackDependencyNotMetError(Array.from(visited)[0] || 'pack', packId, requiredVersionRange)
  }

  // 3. 递归校验已安装包的依赖
  const manifest = inst.manifest as any
  if (manifest && Array.isArray(manifest.dependencies)) {
    const nextVisited = new Set(visited)
    nextVisited.add(packId)

    for (const dep of manifest.dependencies) {
      if (dep.required) {
        await verifyDependencyResolved(
          dep.packId,
          dep.version,
          workspaceId,
          currentDepth + 1,
          nextVisited,
          activePrisma
        )
      }
    }
  }
}

/**
 * 安装 Industry Pack
 */
export async function installPack(
  manifest: IndustryPackManifest,
  workspaceId: string,
  installedBy?: string,
  deps?: PackLoaderDeps
): Promise<IndustryPackInstallation> {
  const activePrisma = deps?.prisma || prisma
  const activeWriteAuditLog = deps?.writeAuditLog || writeAuditLog
  const activeGetSystemVersion = deps?.getSystemVersion || getSystemVersion
  const activeRegisterCapability = deps?.registerCapability || registerCapability
  const activeDeprecateCapability = deps?.deprecateCapability || deprecateCapability

  // 1. 验证 Manifest
  const valResult = validateManifest(manifest)
  if (!valResult.valid) {
    throw new PackManifestInvalidError(manifest.packId || 'unknown', valResult.errors)
  }

  if (valResult.warnings.length > 0) {
    await activeWriteAuditLog({
      actor: installedBy || 'system',
      action: 'pack.install.warning',
      targetType: 'pack',
      targetId: manifest.packId,
      detail: `Manifest warning during installation: ${valResult.warnings.join('; ')}`,
      riskLevel: 'low',
      workspaceId
    })
  }

  // 2. 检查是否已存在该版本的安装记录
  const existing = await activePrisma.industryPackInstallation.findFirst({
    where: {
      workspaceId,
      packId: manifest.packId,
      packVersion: manifest.packVersion,
      status: 'installed'
    }
  })
  if (existing) {
    throw new PackAlreadyInstalledError(manifest.packId, manifest.packVersion)
  }

  // 3. 校验 Harness Core Version 核心版本兼容性
  const sysVer = activeGetSystemVersion()
  if (manifest.minHarnessCoreVersion && compareSemver(sysVer, manifest.minHarnessCoreVersion) < 0) {
    throw new PackCoreVersionIncompatibleError(manifest.packId, sysVer, manifest.minHarnessCoreVersion)
  }

  // 3b. 校验 Industry Pack 兼容性声明（CLAUDE.md §6.3）
  const compatResult = validateIndustryPackCompatibility(manifest.packId, sysVer, sysVer)
  if (!compatResult.passed) {
    await activeWriteAuditLog({
      actor: installedBy || 'system',
      action: 'pack.install.compatibility_failed',
      targetType: 'pack',
      targetId: manifest.packId,
      detail: `兼容性校验失败: ${compatResult.failures.join('; ')}`,
      riskLevel: 'medium',
      workspaceId
    })
    throw new PackCoreVersionIncompatibleError(
      manifest.packId,
      sysVer,
      `compatibility check failed: ${compatResult.failures.join('; ')}`
    )
  }

  // 4. 解析并校验前置依赖项
  if (manifest.dependencies) {
    for (const dep of manifest.dependencies) {
      if (dep.required) {
        const visited = new Set<string>([manifest.packId])
        await verifyDependencyResolved(
          dep.packId,
          dep.version,
          workspaceId,
          1,
          visited,
          activePrisma
        )
      }
    }
  }

  // 5. 创建安装追踪记录 (installing)
  const installationId = `ins-${crypto.randomUUID()}`
  const logRecord = await activePrisma.industryPackInstallation.create({
    data: {
      installationId,
      workspaceId,
      packId: manifest.packId,
      packName: manifest.packName,
      packVersion: manifest.packVersion,
      status: 'installing',
      installedCapabilities: '[]',
      resolvedDependencies: JSON.stringify(manifest.dependencies || []),
      manifest: manifest as any,
      installedBy: installedBy || 'system'
    }
  })

  // 6. 写入审计日志
  await activeWriteAuditLog({
    actor: installedBy || 'system',
    action: 'pack.install.started',
    targetType: 'pack',
    targetId: manifest.packId,
    detail: `Started installation of pack ${manifest.packId}@${manifest.packVersion}`,
    riskLevel: 'low',
    workspaceId
  })

  const registeredCapIds: Array<{ id: string; version: string }> = []

  try {
    // 7. 遍历能力组件，写入对应底层表，并注册能力
    for (const entry of manifest.capabilities) {
      // 7a. 写入各自实体表
      if (entry.type === 'skill') {
        const dbSkill = await activePrisma.skill.findUnique({ where: { id: entry.id } })
        if (dbSkill) {
          await activePrisma.skill.update({
            where: { id: entry.id },
            data: {
              version: entry.version,
              description: entry.description
            }
          })
        } else {
          await activePrisma.skill.create({
            data: {
              id: entry.id,
              workspaceId,
              name: entry.displayName,
              description: entry.description,
              version: entry.version,
              category: 'general',
              source: 'pack',
              status: 'active',
              inputSchema: JSON.stringify(entry.inputSchema),
              outputSchema: JSON.stringify(entry.outputSchema),
              usedByAgents: '[]',
              scenarios: JSON.stringify(entry.tags || []),
              automationLevel: 'L2'
            }
          })
        }
      } else if (entry.type === 'connector') {
        const dbConn = await activePrisma.connector.findUnique({ where: { id: entry.id } })
        if (dbConn) {
          await activePrisma.connector.update({
            where: { id: entry.id },
            data: {
              description: entry.description,
              config: sanitizeConfigTemplate(entry.configTemplate || {}) as Prisma.InputJsonValue
            }
          })
        } else {
          await activePrisma.connector.create({
            data: {
              id: entry.id,
              workspaceId,
              name: entry.displayName,
              iconEmoji: '🔌',
              description: entry.description,
              status: 'available',
              category: 'general',
              permissions: JSON.stringify(['read', 'write']),
              usedByAgents: '[]',
              config: sanitizeConfigTemplate(entry.configTemplate || {}) as Prisma.InputJsonValue
            }
          })
        }
      } else if (entry.type === 'workflow') {
        const dbWorkflow = await activePrisma.workflow.findUnique({ where: { id: entry.id } })
        if (dbWorkflow) {
          await activePrisma.workflow.update({
            where: { id: entry.id },
            data: {
              description: entry.description,
              nodes: JSON.stringify(entry.workflowDefinition?.nodes || []),
              edges: JSON.stringify(entry.workflowDefinition?.edges || [])
            }
          })
        } else {
          await activePrisma.workflow.create({
            data: {
              id: entry.id,
              workspaceId,
              name: entry.displayName,
              description: entry.description,
              status: 'active',
              nodes: JSON.stringify(entry.workflowDefinition?.nodes || []),
              edges: JSON.stringify(entry.workflowDefinition?.edges || []),
              industryId: manifest.packId,
              templateId: entry.id
            }
          })
        }
      }

      // 7b. 版本化能力注册到 Registry
      try {
        await activeRegisterCapability({
          capabilityId: entry.id,
          capabilityType: entry.type as any,
          version: entry.version,
          workspaceId,
          displayName: entry.displayName,
          description: entry.description,
          inputSchema: entry.inputSchema,
          outputSchema: entry.outputSchema,
          tags: entry.tags,
          changelog: entry.changelog || `Installed from pack ${manifest.packId}`,
          publishedBy: installedBy || 'system',
          publishedAt: new Date()
        }, { prisma: activePrisma, writeAuditLog: activeWriteAuditLog })

        registeredCapIds.push({ id: entry.id, version: entry.version })
      } catch (err) {
        if (err instanceof CapabilityAlreadyRegisteredError) {
          // 幂等处理：写 warning 并跳过
          await activeWriteAuditLog({
            actor: installedBy || 'system',
            action: 'pack.install.warning',
            targetType: 'capability',
            targetId: entry.id,
            detail: `Capability ${entry.id}@${entry.version} already registered, skipping.`,
            riskLevel: 'low',
            workspaceId
          })
        } else {
          throw err // 其他错误直接向上抛出，触发回滚
        }
      }
    }

    // 8. 标记安装成功
    const capList = registeredCapIds.map(c => `${c.id}@${c.version}`)
    const updated = await activePrisma.industryPackInstallation.update({
      where: { id: logRecord.id },
      data: {
        status: 'installed',
        installedCapabilities: JSON.stringify(capList),
        installedAt: new Date()
      }
    })

    // 9. 写入审计日志
    await activeWriteAuditLog({
      actor: installedBy || 'system',
      action: 'pack.installed',
      targetType: 'pack',
      targetId: manifest.packId,
      detail: `Successfully installed pack ${manifest.packId}@${manifest.packVersion} with ${capList.length} capabilities.`,
      riskLevel: 'low',
      workspaceId
    })

    return updated

  } catch (error: any) {
    // 异常处理：回滚流程
    // 逐个遍历 registeredCapIds 执行 deprecateCapability
    for (const regCap of registeredCapIds) {
      try {
        await activeDeprecateCapability(
          regCap.id,
          regCap.version,
          `Rollback installation failure of pack ${manifest.packId}@${manifest.packVersion}`,
          installedBy || 'system',
          { prisma: activePrisma, writeAuditLog: activeWriteAuditLog }
        )
      } catch (deprecateErr) {
        console.error(`[installPack Rollback] Failed to deprecate ${regCap.id}@${regCap.version}:`, deprecateErr)
      }
    }

    // 更新状态为 failed
    await activePrisma.industryPackInstallation.update({
      where: { id: logRecord.id },
      data: {
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error occurred during component setup'
      }
    })

    // 写入失败审计日志
    await activeWriteAuditLog({
      actor: installedBy || 'system',
      action: 'pack.install.failed',
      targetType: 'pack',
      targetId: manifest.packId,
      detail: `Installation failed for pack ${manifest.packId}. Error: ${error.message || 'Unknown error'}`,
      riskLevel: 'medium',
      workspaceId
    })

    throw error
  }
}

/**
 * 卸载 Industry Pack
 */
export async function uninstallPack(
  packId: string,
  packVersion: string,
  workspaceId: string,
  uninstalledBy?: string,
  deps?: PackLoaderDeps
): Promise<IndustryPackInstallation> {
  const activePrisma = deps?.prisma || prisma
  const activeWriteAuditLog = deps?.writeAuditLog || writeAuditLog
  const activeDeprecateCapability = deps?.deprecateCapability || deprecateCapability

  // 1. 查找 installed 记录
  const inst = await activePrisma.industryPackInstallation.findFirst({
    where: {
      workspaceId,
      packId,
      packVersion,
      status: 'installed'
    }
  })
  if (!inst) {
    throw new PackInstallationNotFoundError(packId, packVersion)
  }

  // 2. 状态标为 uninstalling
  await activePrisma.industryPackInstallation.update({
    where: { id: inst.id },
    data: { status: 'uninstalling' }
  })

  // 3. 对已安装的能力逐一执行 deprecate
  let capList: string[] = []
  try {
    capList = JSON.parse(inst.installedCapabilities)
  } catch {
    capList = []
  }

  for (const capStr of capList) {
    // capStr 格式为 "id@version"
    const atIdx = capStr.lastIndexOf('@')
    if (atIdx === -1) continue
    const capId = capStr.substring(0, atIdx)
    const capVer = capStr.substring(atIdx + 1)

    try {
      await activeDeprecateCapability(
        capId,
        capVer,
        `Pack ${packId}@${packVersion} uninstalled`,
        uninstalledBy || 'system',
        { prisma: activePrisma, writeAuditLog: activeWriteAuditLog }
      )
    } catch (err) {
      console.error(`[uninstallPack] Failed to deprecate ${capStr}:`, err)
    }
  }

  // 4. 更新状态为 uninstalled
  const updated = await activePrisma.industryPackInstallation.update({
    where: { id: inst.id },
    data: {
      status: 'uninstalled',
      uninstalledAt: new Date(),
      uninstalledBy: uninstalledBy || 'system'
    }
  })

  // 5. 写入审计日志
  await activeWriteAuditLog({
    actor: uninstalledBy || 'system',
    action: 'pack.uninstalled',
    targetType: 'pack',
    targetId: packId,
    detail: `Successfully uninstalled pack ${packId}@${packVersion}. All ${capList.length} capabilities are deprecated.`,
    riskLevel: 'medium',
    workspaceId
  })

  return updated
}

/**
 * 获取 Industry Pack 安装记录
 */
export async function getPackInstallation(
  packId: string,
  workspaceId: string,
  packVersion?: string
): Promise<IndustryPackInstallation | null> {
  const queryClause: any = {
    workspaceId,
    packId
  }
  if (packVersion) {
    queryClause.packVersion = packVersion
  }
  return await prisma.industryPackInstallation.findFirst({
    where: queryClause,
    orderBy: { createdAt: 'desc' }
  })
}

/**
 * 分页列出已安装的 Industry Packs
 */
export async function listInstalledPacks(
  workspaceId: string,
  options?: {
    targetIndustry?: string
    status?: string
    page?: number
    pageSize?: number
  }
): Promise<{ packs: IndustryPackInstallation[]; total: number }> {
  const page = options?.page || 1
  const pageSize = options?.pageSize || 10
  const skip = (page - 1) * pageSize

  const whereClause: any = { workspaceId }
  if (options?.status) {
    whereClause.status = options.status
  }
  if (options?.targetIndustry) {
    whereClause.manifest = {
      path: ['targetIndustry'],
      equals: options.targetIndustry
    }
  }

  const [packs, total] = await Promise.all([
    prisma.industryPackInstallation.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize
    }),
    prisma.industryPackInstallation.count({
      where: whereClause
    })
  ])

  return { packs, total }
}

/**
 * 从 Capability Registry Health 聚合健康度统计
 */
export async function refreshPackHealthFromRegistry(
  workspaceId: string,
  deps?: PackLoaderDeps
): Promise<{ healthy: number; degraded: number; unhealthy: number; unknown: number }> {
  const activePrisma = deps?.prisma || prisma
  const activeWriteAuditLog = deps?.writeAuditLog || writeAuditLog

  const result = { healthy: 0, degraded: 0, unhealthy: 0, unknown: 0 }

  // 1. 获取所有状态为 installed 的包
  const installedPacks = await activePrisma.industryPackInstallation.findMany({
    where: { workspaceId, status: 'installed' }
  })

  const uniqueCaps = new Set<string>()
  for (const pack of installedPacks) {
    try {
      const capList: string[] = JSON.parse(pack.installedCapabilities)
      capList.forEach(c => uniqueCaps.add(c))
    } catch {
      // ignore JSON parse error
    }
  }

  // 2. 对每个唯一的能力 ID 查询健康状态并计数
  for (const capStr of uniqueCaps) {
    const atIdx = capStr.lastIndexOf('@')
    if (atIdx === -1) continue
    const capId = capStr.substring(0, atIdx)
    const capVer = capStr.substring(atIdx + 1)

    const versionRecord = await activePrisma.capabilityVersion.findUnique({
      where: {
        capabilityId_version: {
          capabilityId: capId,
          version: capVer
        }
      }
    })

    if (versionRecord) {
      const status = versionRecord.healthStatus as string
      if (status === 'healthy') result.healthy++
      else if (status === 'degraded') result.degraded++
      else if (status === 'unhealthy') result.unhealthy++
      else result.unknown++
    } else {
      result.unknown++
    }
  }

  // 3. 写入审计日志记录健康情况
  await activeWriteAuditLog({
    actor: 'system',
    action: 'pack.health.aggregated',
    targetType: 'pack',
    targetId: 'all',
    detail: `Aggregated health metrics: healthy=${result.healthy}, degraded=${result.degraded}, unhealthy=${result.unhealthy}, unknown=${result.unknown}`,
    riskLevel: 'low',
    workspaceId
  })

  return result
}
