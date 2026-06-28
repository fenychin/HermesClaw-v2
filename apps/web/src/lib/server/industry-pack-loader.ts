/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from 'fs'
import path from 'path'
import { prisma } from "@/lib/prisma"
import { writeAuditLog, createAuditEntry, updateAuditEntry } from "./audit"
import {
  registerCapability,
  deprecateCapability,
  reactivateCapability,
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
  createAuditEntry?: typeof createAuditEntry
  updateAuditEntry?: typeof updateAuditEntry
  getSystemVersion?: () => string
  registerCapability?: typeof registerCapability
  deprecateCapability?: typeof deprecateCapability
  reactivateCapability?: typeof reactivateCapability
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

  // 提取本包的所有资产 ID，用于在 Workspace 级做 ID 隔离
  const packAgentIds = new Set<string>()
  const packCapabilityIds = new Set<string>()
  const packWorkflowIds = new Set<string>()
  const packSkillIds = new Set<string>()
  const packConnectorIds = new Set<string>()

  const agents = (manifest as any).agents || []
  if (Array.isArray(agents)) {
    for (const agent of agents) {
      if (agent.id) packAgentIds.add(agent.id)
    }
  }
  if (Array.isArray(manifest.capabilities)) {
    for (const cap of manifest.capabilities) {
      if (cap.id) {
        packCapabilityIds.add(cap.id)
        if (cap.type === 'workflow') packWorkflowIds.add(cap.id)
        if (cap.type === 'skill') packSkillIds.add(cap.id)
        if (cap.type === 'connector') packConnectorIds.add(cap.id)
      }
    }
  }

  // 定义 Workspace 级前缀重写辅助函数
  const toScopedId = (id: string) => {
    if (!id) return id
    const prefix = `${workspaceId}:`
    if (id.startsWith(prefix)) return id
    return `${prefix}${id}`
  }

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

  const sysVer = activeGetSystemVersion()

  const getApiVersion = (field: any) => {
    if (typeof field === 'object' && field !== null) {
      return `${field.min || ''}-${field.max || ''}`.trim() || '1.0.0'
    }
    return String(field || manifest.minHarnessCoreVersion || '1.0.0')
  }

  const compHermes = getApiVersion((manifest as any).compatibleHermesApi)
  const compRuntime = getApiVersion((manifest as any).compatibleRuntimeApi)

  // 6. 预记录审计日志
  const activeCreateAuditEntry = deps?.createAuditEntry || createAuditEntry
  const activeUpdateAuditEntry = deps?.updateAuditEntry || updateAuditEntry

  const auditResult = await activeCreateAuditEntry({
    actor: installedBy || 'system',
    action: 'pack.install.started',
    targetType: 'pack',
    targetId: manifest.packId,
    riskLevel: 'low',
    workspaceId,
    contextSnapshot: {
      packId: manifest.packId,
      packVersion: manifest.packVersion,
      compatibleHermesApi: compHermes,
      compatibleRuntimeApi: compRuntime,
      systemVersion: sysVer
    }
  })
  const auditId = auditResult.auditId

  let logRecordId: string | undefined = undefined
  const registeredCapIds: Array<{ id: string; version: string }> = []

  try {
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
    if (manifest.minHarnessCoreVersion && compareSemver(sysVer, manifest.minHarnessCoreVersion) < 0) {
      throw new PackCoreVersionIncompatibleError(manifest.packId, sysVer, manifest.minHarnessCoreVersion)
    }

    // 3b. 校验 Industry Pack 兼容性声明（CLAUDE.md §6.3）
    const compatResult = validateIndustryPackCompatibility(manifest.packId, sysVer, sysVer)
    if (!compatResult.passed) {
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
    const existingRecord = await activePrisma.industryPackInstallation.findFirst({
      where: {
        workspaceId,
        packId: manifest.packId,
        packVersion: manifest.packVersion
      }
    })

    let logRecord
    if (existingRecord) {
      logRecord = await activePrisma.industryPackInstallation.update({
        where: { id: existingRecord.id },
        data: {
          status: 'installing',
          errorMessage: null,
          installedCapabilities: '[]',
          resolvedDependencies: JSON.stringify(manifest.dependencies || []),
          manifest: manifest as any,
          installedBy: installedBy || 'system',
          installedAt: null,
          uninstalledAt: null,
          uninstalledBy: null
        }
      })
    } else {
      const installationId = `ins-${crypto.randomUUID()}`
      try {
        logRecord = await activePrisma.industryPackInstallation.create({
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
      } catch (createErr: any) {
        const isUniqueConstraint = 
          createErr.code === 'P2002' || 
          (createErr.message && createErr.message.includes('Unique constraint failed'))
        
        if (isUniqueConstraint) {
          console.warn('[installPack] Create failed with unique constraint conflict, falling back to update:', createErr.message)
          const fallbackRecord = await activePrisma.industryPackInstallation.findFirst({
            where: {
              workspaceId,
              packId: manifest.packId,
              packVersion: manifest.packVersion
            }
          })
          if (fallbackRecord) {
            logRecord = await activePrisma.industryPackInstallation.update({
              where: { id: fallbackRecord.id },
              data: {
                status: 'installing',
                errorMessage: null,
                installedCapabilities: '[]',
                resolvedDependencies: JSON.stringify(manifest.dependencies || []),
                manifest: manifest as any,
                installedBy: installedBy || 'system',
                installedAt: null,
                uninstalledAt: null,
                uninstalledBy: null
              }
            })
          } else {
            throw createErr
          }
        } else {
          throw createErr
        }
      }
    }
    logRecordId = logRecord.id

    // 7. 遍历能力组件，写入对应底层表，并注册能力
    for (const entry of manifest.capabilities) {
      const scopedCapId = toScopedId(entry.id)
      // 7a. 写入各自实体表
      if (entry.type === 'skill') {
        let dbSkill = await activePrisma.skill.findUnique({ where: { id: scopedCapId } })
        if (!dbSkill) {
          const conflictingSkill = await activePrisma.skill.findUnique({
            where: {
              workspaceId_name: {
                workspaceId,
                name: entry.displayName
              }
            }
          })
          if (conflictingSkill) {
            console.warn(`[installPack] 发现唯一约束冲突的同名技能 [${entry.displayName}]，将清理旧 ID: ${conflictingSkill.id}`)
            await activePrisma.skill.delete({ where: { id: conflictingSkill.id } })
          }
        }
        dbSkill = await activePrisma.skill.findUnique({ where: { id: scopedCapId } })
        if (dbSkill) {
          await activePrisma.skill.update({
            where: { id: scopedCapId },
            data: {
              version: entry.version,
              description: entry.description,
              status: 'active',
              skillMdContent: entry.skillMdContent || null,
            }
          })
        } else {
          await activePrisma.skill.create({
            data: {
              id: scopedCapId,
              workspaceId,
              name: entry.displayName,
              description: entry.description,
              version: entry.version,
              category: 'general',
              source: 'EXTERNAL',
              status: 'active',
              inputSchema: JSON.stringify(entry.inputSchema),
              outputSchema: JSON.stringify(entry.outputSchema),
              usedByAgents: '[]',
              scenarios: JSON.stringify(entry.tags || []),
              automationLevel: 'L2',
              skillMdContent: entry.skillMdContent || null,
            }
          })
        }
      } else if (entry.type === 'connector') {
        const dbConn = await activePrisma.connector.findUnique({ where: { id: scopedCapId } })
        if (dbConn) {
          await activePrisma.connector.update({
            where: { id: scopedCapId },
            data: {
              description: entry.description,
              packId: manifest.packId,
              config: sanitizeConfigTemplate(entry.configTemplate || {}) as Prisma.InputJsonValue
            }
          })
        } else {
          await activePrisma.connector.create({
            data: {
              id: scopedCapId,
              workspaceId,
              name: entry.displayName,
              iconEmoji: '🔌',
              description: entry.description,
              status: 'available',
              category: 'general',
              permissions: JSON.stringify(['read', 'write']),
              usedByAgents: '[]',
              packId: manifest.packId,
              config: sanitizeConfigTemplate(entry.configTemplate || {}) as Prisma.InputJsonValue
            }
          })
        }
      } else if (entry.type === 'workflow') {
        const dbWorkflow = await activePrisma.workflow.findUnique({ where: { id: scopedCapId } })
        
        // 级联重写 Nodes 中的 ID 引用 (智能体/技能/连接器)
        const rawNodes = (entry.workflowDefinition?.nodes || []) as any[]
        const scopedNodes = rawNodes.map((node: any) => {
          const updatedNode = { ...node }
          if (updatedNode.config) {
            updatedNode.config = { ...updatedNode.config }
            if (updatedNode.config.skillId && (packSkillIds.has(updatedNode.config.skillId) || packSkillIds.has(updatedNode.config.skillId.replace(/^skill-/, '')))) {
              updatedNode.config.skillId = toScopedId(updatedNode.config.skillId)
            }
            if (updatedNode.config.agentId && packAgentIds.has(updatedNode.config.agentId)) {
              updatedNode.config.agentId = toScopedId(updatedNode.config.agentId)
            }
            if (updatedNode.config.connectorId && packConnectorIds.has(updatedNode.config.connectorId)) {
              updatedNode.config.connectorId = toScopedId(updatedNode.config.connectorId)
            }
          }
          if (updatedNode.skillId && (packSkillIds.has(updatedNode.skillId) || packSkillIds.has(updatedNode.skillId.replace(/^skill-/, '')))) {
            updatedNode.skillId = toScopedId(updatedNode.skillId)
          }
          if (updatedNode.agentId && packAgentIds.has(updatedNode.agentId)) {
            updatedNode.agentId = toScopedId(updatedNode.agentId)
          }
          return updatedNode
        })

        const workflowData = {
          description: entry.description,
          nodes: JSON.stringify(scopedNodes),
          edges: JSON.stringify(entry.workflowDefinition?.edges || [])
        }

        if (dbWorkflow) {
          await activePrisma.workflow.update({
            where: { id: scopedCapId },
            data: workflowData
          })
        } else {
          await activePrisma.workflow.create({
            data: {
              id: scopedCapId,
              workspaceId,
              name: entry.displayName,
              description: entry.description,
              status: 'active',
              nodes: JSON.stringify(scopedNodes),
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
          capabilityId: scopedCapId,
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

        registeredCapIds.push({ id: scopedCapId, version: entry.version })
      } catch (err) {
        if (err instanceof CapabilityAlreadyRegisteredError) {
          // 幂等处理：写 warning 并跳过
          await activeWriteAuditLog({
            actor: installedBy || 'system',
            action: 'pack.install.warning',
            targetType: 'capability',
            targetId: scopedCapId,
            detail: `Capability ${scopedCapId}@${entry.version} already registered, skipping.`,
            riskLevel: 'low',
            workspaceId
          })
          registeredCapIds.push({ id: scopedCapId, version: entry.version })
        } else {
          throw err // 其他错误直接向上抛出，触发回滚
        }
      }
    }

    // 7c. 写入智能体实体表
    const agents = (manifest as any).agents || []
    if (Array.isArray(agents)) {
      for (const agent of agents) {
        const scopedAgentId = toScopedId(agent.id)
        // 防御性去重：如果在当前 Workspace 已经存在同名但不同 ID 的 Agent，删除旧的以防同名重复
        const conflictingAgents = await activePrisma.agent.findMany({
          where: {
            workspaceId,
            name: agent.name,
            id: { not: scopedAgentId }
          }
        })
        if (conflictingAgents.length > 0) {
          console.warn(`[installPack] 发现同名不同 ID 的智能体 [${agent.name}]，正在清理旧 ID: ${conflictingAgents.map((a: any) => a.id).join(', ')}`)
          await activePrisma.agent.deleteMany({
            where: {
              id: { in: conflictingAgents.map((a: any) => a.id) }
            }
          })
        }
        const boundSkills = (agent.bindSkills || agent.skills || []).map((s: string) => {
          const rawSkillId = s.startsWith('skill-') ? s : `skill-${s}`
          const cleanSkillId = rawSkillId.replace(/^skill-/, '')
          if (packSkillIds.has(cleanSkillId) || packSkillIds.has(rawSkillId)) {
            return toScopedId(rawSkillId)
          }
          return rawSkillId
        })
        const boundConnectors = (agent.bindConnectors || []).map((c: string) => {
          if (packConnectorIds.has(c)) {
            return toScopedId(c)
          }
          return c
        })

        const dbAgent = await activePrisma.agent.findUnique({ where: { id: scopedAgentId } })
        const agentData = {
          name: agent.name,
          role: agent.role,
          description: agent.description || "",
          status: agent.status || "active",
          source: "pack",
          category: JSON.stringify(agent.category || []),
          bindSkills: JSON.stringify(boundSkills),
          bindConnectors: JSON.stringify(boundConnectors),
          memoryPermission: agent.memoryPermission || "read-write",
          harnessVersion: agent.harnessVersion || "1.0.0",
          automationLevel: agent.automationLevel || "L2",
          canDo: JSON.stringify(agent.canDo || []),
          cannotDo: JSON.stringify(agent.cannotDo || []),
          statsJson: JSON.stringify(agent.statsJson || agent.stats || {}),
          lastActive: agent.lastActive || new Date().toISOString(),
          industryId: agent.industryId || manifest.packId,
          templateId: agent.templateId || agent.id
        }

        if (dbAgent) {
          await activePrisma.agent.update({
            where: { id: scopedAgentId },
            data: agentData
          })
        } else {
          await activePrisma.agent.create({
            data: {
              id: scopedAgentId,
              workspaceId,
              ...agentData
            }
          })
        }
      }
    }

    // 8. 标记安装成功
    const capList = registeredCapIds.map(c => `${c.id}@${c.version}`)
    const updated = await activePrisma.industryPackInstallation.update({
      where: { id: logRecordId },
      data: {
        status: 'installed',
        installedCapabilities: JSON.stringify(capList),
        installedAt: new Date()
      }
    })

    // 8b. 升级时自动废弃旧的已安装版本（AGENTS.md §4.3 Harness Bundle 灰度与生命周期）
    await activePrisma.industryPackInstallation.updateMany({
      where: {
        workspaceId,
        packId: manifest.packId,
        id: { not: logRecordId },
        status: 'installed'
      },
      data: {
        status: 'deprecated'
      }
    })

    // 9. 更新审计日志状态为 success
    await activeUpdateAuditEntry({
      auditId,
      status: 'success',
      detail: `Successfully installed pack ${manifest.packId}@${manifest.packVersion} with ${capList.length} capabilities.`
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

    if (logRecordId) {
      try {
        await activePrisma.industryPackInstallation.update({
          where: { id: logRecordId },
          data: {
            status: 'failed',
            errorMessage: error instanceof Error ? error.message : 'Unknown error occurred during component setup'
          }
        })
      } catch (dbErr) {
        console.error(`[installPack Rollback] Failed to update installation status:`, dbErr)
      }
    }

    // 更新审计日志状态为 failed
    await activeUpdateAuditEntry({
      auditId,
      status: 'failed',
      detail: `Installation failed for pack ${manifest.packId}. Error: ${error.message || 'Unknown error'}`
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

  // 3. 预记录审计日志
  const activeCreateAuditEntry = deps?.createAuditEntry || createAuditEntry
  const activeUpdateAuditEntry = deps?.updateAuditEntry || updateAuditEntry

  const auditResult = await activeCreateAuditEntry({
    actor: uninstalledBy || 'system',
    action: 'pack.uninstall.started',
    targetType: 'pack',
    targetId: packId,
    riskLevel: 'medium',
    workspaceId,
    contextSnapshot: {
      packId,
      packVersion
    }
  })

  // 4. 对已安装的能力逐一执行 deprecate
  let capList: string[] = []
  try {
    capList = JSON.parse(inst.installedCapabilities)
  } catch {
    capList = []
  }

  try {
    for (const capStr of capList) {
      // capStr 格式为 "id@version"
      const atIdx = capStr.lastIndexOf('@')
      if (atIdx === -1) continue
      const capId = capStr.substring(0, atIdx)
      const capVer = capStr.substring(atIdx + 1)

      await activeDeprecateCapability(
        capId,
        capVer,
        `Pack ${packId}@${packVersion} uninstalled`,
        uninstalledBy || 'system',
        { prisma: activePrisma, writeAuditLog: activeWriteAuditLog }
      )
    }

    // 4b. 卸载该包关联的所有智能体
    const manifest = inst.manifest as any
    const agents = manifest?.agents || []
    const toScopedId = (id: string) => {
      if (!id) return id
      const prefix = `${workspaceId}:`
      if (id.startsWith(prefix)) return id
      return `${prefix}${id}`
    }
    if (Array.isArray(agents)) {
      for (const agent of agents) {
        if (!agent.id) continue
        const scopedAgentId = toScopedId(agent.id)
        const exists = await activePrisma.agent.findUnique({
          where: { id: scopedAgentId }
        })
        if (exists) {
          console.log(`[uninstallPack] 清理卸载包绑定的智能体 ID: ${scopedAgentId}`)
          await activePrisma.agent.delete({
            where: { id: scopedAgentId }
          })
        }
      }
    }

    // 5. 更新状态为 uninstalled
    const updated = await activePrisma.industryPackInstallation.update({
      where: { id: inst.id },
      data: {
        status: 'uninstalled',
        uninstalledAt: new Date(),
        uninstalledBy: uninstalledBy || 'system'
      }
    })

    // 6. 更新审计日志状态为 success
    await activeUpdateAuditEntry({
      auditId: auditResult.auditId,
      status: 'success',
      detail: `Successfully uninstalled pack ${packId}@${packVersion}. All ${capList.length} capabilities are deprecated.`
    })

    return updated
  } catch (error: any) {
    // 卸载失败，回滚状态并记录失败审计
    await activePrisma.industryPackInstallation.update({
      where: { id: inst.id },
      data: { status: 'installed' }
    })

    await activeUpdateAuditEntry({
      auditId: auditResult.auditId,
      status: 'failed',
      detail: `Uninstall failed for pack ${packId}. Error: ${error.message || 'Unknown error'}`
    })

    throw error
  }
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

/**
 * 停用（暂停）Industry Pack
 */
export async function deactivatePack(
  packId: string,
  workspaceId: string,
  deactivatedBy?: string,
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
      status: 'installed'
    }
  })
  if (!inst) {
    throw new PackInstallationNotFoundError(packId)
  }

  // 2. 预记录审计日志
  const activeCreateAuditEntry = deps?.createAuditEntry || createAuditEntry
  const activeUpdateAuditEntry = deps?.updateAuditEntry || updateAuditEntry

  const auditResult = await activeCreateAuditEntry({
    actor: deactivatedBy || 'system',
    action: 'pack.deactivate.started',
    targetType: 'pack',
    targetId: packId,
    riskLevel: 'medium',
    workspaceId,
    contextSnapshot: {
      packId,
      packVersion: inst.packVersion
    }
  })

  // 3. 对已安装的能力逐一执行 deprecate (软下线)
  let capList: string[] = []
  try {
    capList = JSON.parse(inst.installedCapabilities)
  } catch {
    capList = []
  }

  try {
    for (const capStr of capList) {
      const atIdx = capStr.lastIndexOf('@')
      if (atIdx === -1) continue
      const capId = capStr.substring(0, atIdx)
      const capVer = capStr.substring(atIdx + 1)

      await activeDeprecateCapability(
        capId,
        capVer,
        `Pack ${packId}@${inst.packVersion} deactivated (paused)`,
        deactivatedBy || 'system',
        { prisma: activePrisma, writeAuditLog: activeWriteAuditLog }
      )
    }

    // 4. 更新状态为 paused
    const updated = await activePrisma.industryPackInstallation.update({
      where: { id: inst.id },
      data: {
        status: 'paused'
      }
    })

    // 5. 写入审计日志为 success
    await activeUpdateAuditEntry({
      auditId: auditResult.auditId,
      status: 'success',
      detail: `Successfully deactivated pack ${packId}@${inst.packVersion}. All ${capList.length} capabilities are deprecated.`
    })

    return updated
  } catch (error: any) {
    // 失败回滚
    await activePrisma.industryPackInstallation.update({
      where: { id: inst.id },
      data: { status: 'installed' }
    })

    await activeUpdateAuditEntry({
      auditId: auditResult.auditId,
      status: 'failed',
      detail: `Deactivation failed for pack ${packId}. Error: ${error.message || 'Unknown error'}`
    })

    throw error
  }
}

/**
 * 启用（恢复激活）一个已被暂停的 Industry Pack
 */
export async function activatePack(
  packId: string,
  workspaceId: string,
  activatedBy?: string,
  deps?: PackLoaderDeps
): Promise<IndustryPackInstallation> {
  const activePrisma = deps?.prisma || prisma
  const activeWriteAuditLog = deps?.writeAuditLog || writeAuditLog
  const activeReactivateCapability = deps?.reactivateCapability || reactivateCapability

  // 1. 查找 paused 记录
  const inst = await activePrisma.industryPackInstallation.findFirst({
    where: {
      workspaceId,
      packId,
      status: 'paused'
    }
  })
  if (!inst) {
    throw new PackInstallationNotFoundError(packId)
  }

  // 2. 预记录审计日志
  const activeCreateAuditEntry = deps?.createAuditEntry || createAuditEntry
  const activeUpdateAuditEntry = deps?.updateAuditEntry || updateAuditEntry

  const auditResult = await activeCreateAuditEntry({
    actor: activatedBy || 'system',
    action: 'pack.activate.started',
    targetType: 'pack',
    targetId: packId,
    riskLevel: 'medium',
    workspaceId,
    contextSnapshot: {
      packId,
      packVersion: inst.packVersion
    }
  })

  // 3. 对已安装的能力逐一执行 reactivate (恢复上线)
  let capList: string[] = []
  try {
    capList = JSON.parse(inst.installedCapabilities)
  } catch {
    capList = []
  }

  try {
    for (const capStr of capList) {
      const atIdx = capStr.lastIndexOf('@')
      if (atIdx === -1) continue
      const capId = capStr.substring(0, atIdx)
      const capVer = capStr.substring(atIdx + 1)

      await activeReactivateCapability(
        capId,
        capVer,
        activatedBy || 'system',
        { prisma: activePrisma, writeAuditLog: activeWriteAuditLog }
      )
    }

    // 4. 更新状态为 installed
    const updated = await activePrisma.industryPackInstallation.update({
      where: { id: inst.id },
      data: {
        status: 'installed'
      }
    })

    // 5. 写入审计日志为 success
    await activeUpdateAuditEntry({
      auditId: auditResult.auditId,
      status: 'success',
      detail: `Successfully activated pack ${packId}@${inst.packVersion}. All ${capList.length} capabilities are reactivated.`
    })

    return updated
  } catch (error: any) {
    // 失败回滚为 paused
    try {
      await activePrisma.industryPackInstallation.update({
        where: { id: inst.id },
        data: { status: 'paused' }
      })
    } catch (dbErr) {
      console.error(`[activatePack Rollback] Failed to rollback status to paused:`, dbErr)
    }

    await activeUpdateAuditEntry({
      auditId: auditResult.auditId,
      status: 'failed',
      detail: `Activation failed for pack ${packId}. Error: ${error.message || 'Unknown error'}`
    })

    throw error
  }
}

/**
 * 回滚 Industry Pack 到上一个已安装版本
 *
 * 执行流程：
 * 1. 查找当前 installed 版本
 * 2. 查找最近一个 deprecated 版本（自动废弃的旧版本）
 * 3. 废弃当前版本的所有能力，重新激活上一版本的能力
 * 4. 恢复上一版本的 Agent 实体
 * 5. 更新两个 installation 记录的状态
 * 6. 全程记录 AuditLog（预记录→成功/失败）
 */
export async function rollbackPack(
  packId: string,
  workspaceId: string,
  rolledBackBy?: string,
  targetVersion?: string,
  deps?: PackLoaderDeps
): Promise<{
  previousInstallation: IndustryPackInstallation
  restoredInstallation: IndustryPackInstallation
}> {
  const activePrisma = deps?.prisma || prisma
  const activeWriteAuditLog = deps?.writeAuditLog || writeAuditLog
  const activeDeprecateCapability = deps?.deprecateCapability || deprecateCapability
  const activeReactivateCapability = deps?.reactivateCapability || reactivateCapability
  const activeCreateAuditEntry = deps?.createAuditEntry || createAuditEntry
  const activeUpdateAuditEntry = deps?.updateAuditEntry || updateAuditEntry

  // 1. 查找当前 installed 版本
  const currentInst = await activePrisma.industryPackInstallation.findFirst({
    where: { workspaceId, packId, status: 'installed' },
    orderBy: { createdAt: 'desc' }
  })

  if (!currentInst) {
    throw new PackInstallationNotFoundError(packId)
  }

  const currentVersion = currentInst.packVersion

  // 2. 查找回滚目标版本
  let targetInst: any = null

  if (targetVersion) {
    targetInst = await activePrisma.industryPackInstallation.findFirst({
      where: { workspaceId, packId, packVersion: targetVersion }
    })
    if (!targetInst) {
      throw new Error(`回滚目标版本 ${targetVersion} 不存在`)
    }
  } else {
    // 自动选择：最近一个 deprecated 版本
    targetInst = await activePrisma.industryPackInstallation.findFirst({
      where: { workspaceId, packId, status: 'deprecated' },
      orderBy: { createdAt: 'desc' }
    })

    if (!targetInst) {
      targetInst = await activePrisma.industryPackInstallation.findFirst({
        where: {
          workspaceId,
          packId,
          id: { not: currentInst.id },
          status: { notIn: ['uninstalled', 'uninstalling'] }
        },
        orderBy: { createdAt: 'desc' }
      })
    }
  }

  if (!targetInst) {
    throw new Error(`无法回滚：未找到 ${packId} 的历史版本。请先安装新版本后再执行回滚。`)
  }

  const targetPackVersion = targetInst.packVersion

  if (targetPackVersion === currentVersion) {
    throw new Error(`回滚目标版本 ${targetPackVersion} 与当前版本相同，无需回滚`)
  }

  // 3. 预记录审计日志
  const auditResult = await activeCreateAuditEntry({
    actor: rolledBackBy || 'system',
    action: 'pack.rollback.started',
    targetType: 'pack',
    targetId: packId,
    riskLevel: 'high',
    workspaceId,
    contextSnapshot: {
      packId,
      fromVersion: currentVersion,
      toVersion: targetPackVersion,
      rolledBackBy: rolledBackBy || 'system'
    }
  })
  const auditId = auditResult.auditId

  // 4. 解析能力列表
  let currentCapList: string[] = []
  try { currentCapList = JSON.parse(currentInst.installedCapabilities) } catch { /* ignore */ }

  let targetCapList: string[] = []
  try { targetCapList = JSON.parse(targetInst.installedCapabilities) } catch { /* ignore */ }

  try {
    // 5a. 废弃当前版本的所有能力
    for (const capStr of currentCapList) {
      const atIdx = capStr.lastIndexOf('@')
      if (atIdx === -1) continue
      const capId = capStr.substring(0, atIdx)
      const capVer = capStr.substring(atIdx + 1)

      try {
        await activeDeprecateCapability(
          capId, capVer,
          `Rolled back from pack ${packId}@${currentVersion} to ${targetPackVersion}`,
          rolledBackBy || 'system',
          { prisma: activePrisma, writeAuditLog: activeWriteAuditLog }
        )
      } catch (err) {
        console.error(`[rollbackPack] 废弃能力 ${capId}@${capVer} 失败:`, err)
      }
    }

    // 5b. 重新激活目标版本的能力
    for (const capStr of targetCapList) {
      const atIdx = capStr.lastIndexOf('@')
      if (atIdx === -1) continue
      const capId = capStr.substring(0, atIdx)
      const capVer = capStr.substring(atIdx + 1)

      try {
        await activeReactivateCapability(
          capId, capVer,
          rolledBackBy || 'system',
          { prisma: activePrisma, writeAuditLog: activeWriteAuditLog }
        )
      } catch (err) {
        console.error(`[rollbackPack] 重新激活能力 ${capId}@${capVer} 失败:`, err)
      }
    }

    // 5c. 处理 Agent：清理当前版本的 Agent，恢复目标版本的 Agent
    const toScopedId = (id: string) => {
      if (!id) return id
      const prefix = `${workspaceId}:`
      if (id.startsWith(prefix)) return id
      return `${prefix}${id}`
    }

    // 删除当前版本的 Agent
    const currentManifest = currentInst.manifest as any
    const currentAgents = currentManifest?.agents || []
    if (Array.isArray(currentAgents)) {
      for (const agent of currentAgents) {
        if (!agent.id) continue
        const scopedAgentId = toScopedId(agent.id)
        try {
          const exists = await activePrisma.agent.findUnique({ where: { id: scopedAgentId } })
          if (exists) {
            await activePrisma.agent.delete({ where: { id: scopedAgentId } })
          }
        } catch (err) {
          console.error(`[rollbackPack] 删除当前 Agent ${scopedAgentId} 失败:`, err)
        }
      }
    }

    // 恢复目标版本的 Agent
    const targetManifest = targetInst.manifest as any
    const targetAgents = targetManifest?.agents || []
    if (Array.isArray(targetAgents)) {
      for (const agent of targetAgents) {
        if (!agent.id) continue
        const scopedAgentId = toScopedId(agent.id)

        try {
          await activePrisma.agent.upsert({
            where: { id: scopedAgentId },
            update: {
              name: agent.name,
              role: agent.role,
              description: agent.description || '',
              status: agent.status || 'active',
              source: 'pack',
              category: JSON.stringify(agent.category || []),
              bindSkills: JSON.stringify(agent.bindSkills || []),
              bindConnectors: JSON.stringify(agent.bindConnectors || []),
              memoryPermission: agent.memoryPermission || 'read-write',
              harnessVersion: agent.harnessVersion || '1.0.0',
              automationLevel: agent.automationLevel || 'L2',
              canDo: JSON.stringify(agent.canDo || []),
              cannotDo: JSON.stringify(agent.cannotDo || []),
              statsJson: JSON.stringify(agent.statsJson || agent.stats || {}),
              industryId: agent.industryId || packId,
              templateId: agent.templateId || agent.id
            },
            create: {
              id: scopedAgentId,
              workspaceId,
              name: agent.name,
              role: agent.role,
              description: agent.description || '',
              status: agent.status || 'active',
              source: 'pack',
              category: JSON.stringify(agent.category || []),
              bindSkills: JSON.stringify(agent.bindSkills || []),
              bindConnectors: JSON.stringify(agent.bindConnectors || []),
              memoryPermission: agent.memoryPermission || 'read-write',
              harnessVersion: agent.harnessVersion || '1.0.0',
              automationLevel: agent.automationLevel || 'L2',
              canDo: JSON.stringify(agent.canDo || []),
              cannotDo: JSON.stringify(agent.cannotDo || []),
              statsJson: JSON.stringify(agent.statsJson || agent.stats || {}),
              industryId: agent.industryId || packId,
              templateId: agent.templateId || agent.id
            }
          })
        } catch (err) {
          console.error(`[rollbackPack] 恢复 Agent ${scopedAgentId} 失败:`, err)
        }
      }
    }

    // 6. 更新 installation 记录状态
    const previousInstallation = await activePrisma.industryPackInstallation.update({
      where: { id: currentInst.id },
      data: { status: 'deprecated' }
    })

    const restoredInstallation = await activePrisma.industryPackInstallation.update({
      where: { id: targetInst.id },
      data: {
        status: 'installed',
        installedAt: new Date(),
        installedBy: rolledBackBy || 'system',
        uninstalledAt: null,
        uninstalledBy: null
      }
    })

    // 7. 更新审计日志为 success
    await activeUpdateAuditEntry({
      auditId,
      status: 'success',
      detail: `成功回滚行业包 ${packId}：${currentVersion} → ${targetPackVersion}。` +
        `已废弃 ${currentCapList.length} 项能力，已恢复 ${targetCapList.length} 项能力。`
    })

    // 额外写一条明文审计
    await activeWriteAuditLog({
      actor: rolledBackBy || 'system',
      action: 'pack.rollback.completed',
      targetType: 'pack',
      targetId: packId,
      detail: `Rollback complete: ${currentVersion} → ${targetPackVersion}`,
      riskLevel: 'high',
      workspaceId,
      contextSnapshot: {
        fromVersion: currentVersion,
        toVersion: targetPackVersion,
        deprecatedCaps: currentCapList.length,
        restoredCaps: targetCapList.length
      }
    })

    return { previousInstallation, restoredInstallation }

  } catch (error: any) {
    // 回滚失败：尝试恢复当前版本状态
    try {
      await activePrisma.industryPackInstallation.update({
        where: { id: currentInst.id },
        data: { status: 'installed' }
      })
    } catch (dbErr) {
      console.error(`[rollbackPack] 回滚失败，恢复当前状态也失败:`, dbErr)
    }

    await activeUpdateAuditEntry({
      auditId,
      status: 'failed',
      detail: `回滚失败：${error.message || '未知错误'}`
    })

    throw error
  }
}
