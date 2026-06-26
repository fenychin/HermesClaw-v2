import { ApiResponse } from '@/lib/server/api-response'; import { withRBAC } from '@/lib/server/api-handler'
import { checkAutomationGate } from '@/lib/server/guardrail'
import { installPack, listInstalledPacks, PackAlreadyInstalledError, PackManifestInvalidError, PackDependencyNotMetError, PackCoreVersionIncompatibleError } from '@/lib/server/industry-pack-loader'
import { loadIndustryManifest, loadIndustryWorkflowDag, clearCache } from '@hermesclaw/industry-pack-sdk'
import type { IndustryPackManifest, PackCapabilityEntry } from '@hermesclaw/event-contracts'
import type { WorkspaceContext } from '@/lib/workspace'
import fs from 'fs'
import path from 'path'
import yaml from 'yaml'

function resolvePacksDir(): string {
  const candidates = [
    path.join(process.cwd(), "industry-packs"),
    path.resolve(process.cwd(), "..", "industry-packs"),
    path.resolve(process.cwd(), "..", "..", "industry-packs"),
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  return candidates[candidates.length - 1]
}

function readAssetFile(basePathWithoutExt: string): any {
  const exts = [
    ".yaml",
    ".yml",
    ".json",
    ".skill.yaml",
    ".workflow.yaml",
    ".dashboard.yaml",
    ".eval.yaml",
    ".connector.yaml",
  ];
  for (const ext of exts) {
    const filePath = basePathWithoutExt + ext;
    if (fs.existsSync(filePath)) {
      const rawText = fs.readFileSync(filePath, "utf-8");
      if (ext === ".json") {
        return JSON.parse(rawText);
      } else {
        return yaml.parse(rawText);
      }
    }
  }
  return null;
}

function compilePackManifest(packId: string): IndustryPackManifest {
  const sdkManifest = loadIndustryManifest(packId)
  const packsDir = resolvePacksDir()

  const capabilities: PackCapabilityEntry[] = []

  // 1. 加载 Skills
  const skillIds = sdkManifest.directory?.skills || []
  for (const skillId of skillIds) {
    const skillPath = path.join(packsDir, packId, "skills", skillId)
    const parsed = readAssetFile(skillPath)
    if (parsed) {
      const rawId = parsed.id || skillId
      // 自动读取同名的 .SKILL.md 内容
      let skillMdContent: string | undefined = undefined
      const mdPath = path.join(packsDir, packId, "skills", `${skillId}.SKILL.md`)
      if (fs.existsSync(mdPath)) {
        skillMdContent = fs.readFileSync(mdPath, "utf-8")
      }
      capabilities.push({
        id: rawId.startsWith('skill-') ? rawId : `skill-${rawId}`,
        type: 'skill',
        displayName: parsed.displayName || parsed.name || skillId,
        description: parsed.description || "",
        version: parsed.version || "1.0.0",
        inputSchema: parsed.inputSchema || {},
        outputSchema: parsed.outputSchema || parsed.outputContract || {},
        tags: parsed.harnessTags || parsed.tags || [],
        changelog: parsed.changelog || "init",
        skillMdContent
      })
    }
  }

  // 2. 加载 Connectors
  const mappingPath = path.join(packsDir, packId, "connectors", "mapping")
  const mappings = readAssetFile(mappingPath)
  if (Array.isArray(mappings)) {
    for (const conn of mappings) {
      capabilities.push({
        id: conn.id,
        type: 'connector',
        displayName: conn.name || conn.id,
        description: conn.description || "",
        version: conn.version || "1.0.0",
        inputSchema: {},
        outputSchema: {},
        tags: [conn.category || "general"],
        changelog: "init",
        configTemplate: conn
      })
    }
  }

  // 3. 加载 Workflows
  const wfIds = sdkManifest.directory?.workflows || []
  for (const wfId of wfIds) {
    const dag = loadIndustryWorkflowDag(packId, wfId)
    if (dag) {
      capabilities.push({
        id: wfId,
        type: 'workflow',
        displayName: dag.name || wfId,
        description: dag.description || "",
        version: "1.0.0",
        inputSchema: {},
        outputSchema: {},
        tags: [],
        changelog: "init",
        workflowDefinition: {
          nodes: dag.nodes || [],
          edges: dag.edges || []
        }
      })
    } else {
      const workflowPath = path.join(packsDir, packId, "workflows", wfId)
      const parsed = readAssetFile(workflowPath)
      if (parsed) {
        capabilities.push({
          id: parsed.id || wfId,
          type: 'workflow',
          displayName: parsed.name || wfId,
          description: parsed.description || "",
          version: parsed.version || "1.0.0",
          inputSchema: {},
          outputSchema: {},
          tags: [],
          changelog: "init",
          workflowDefinition: {
            nodes: parsed.nodes || [],
            edges: parsed.edges || []
          }
        })
      }
    }
  }

  // 4. 加载 Agents
  const agentIds = sdkManifest.directory?.agents || []
  const loadedAgents: any[] = []
  for (const agentId of agentIds) {
    const agentPath = path.join(packsDir, packId, "agents", agentId)
    const parsed = readAssetFile(agentPath)
    if (parsed) {
      loadedAgents.push({
        id: parsed.id || agentId,
        name: parsed.name || agentId,
        role: parsed.role || "",
        description: parsed.description || "",
        status: parsed.status || "active",
        source: parsed.source || "pack",
        category: parsed.category || [],
        bindSkills: parsed.bindSkills || parsed.skills || [],
        bindConnectors: parsed.bindConnectors || [],
        memoryPermission: parsed.memoryPermission || "read-write",
        harnessVersion: parsed.harnessVersion || "1.0.0",
        automationLevel: parsed.automationLevel || "L2",
        canDo: parsed.canDo || [],
        cannotDo: parsed.cannotDo || [],
        statsJson: parsed.statsJson || parsed.stats || {},
        lastActive: parsed.lastActive || new Date().toISOString(),
        industryId: parsed.industryId || packId,
        templateId: parsed.templateId || agentId
      })
    }
  }

  // 计算兼容性的最低 core 版本
  const minVersion = typeof sdkManifest.compatibleHermesApi === 'object' && sdkManifest.compatibleHermesApi !== null
    ? (sdkManifest.compatibleHermesApi as any).min || "1.0.0"
    : "1.0.0"

  return {
    manifestVersion: '1.0',
    packId: sdkManifest.packId,
    packName: sdkManifest.name,
    packVersion: sdkManifest.version,
    description: sdkManifest.description || "",
    author: sdkManifest.author || "system",
    license: "MIT",
    tags: [sdkManifest.industry],
    targetIndustry: sdkManifest.industry,
    capabilities,
    dependencies: (sdkManifest.dependencies || []).map(d => ({
      packId: typeof d === 'string' ? d : (d as any).packId,
      version: '>=1.0.0',
      required: true
    })),
    minHarnessCoreVersion: minVersion,
    changelog: "Initial version",
    agents: loadedAgents
  } as any
}

export const GET = withRBAC(async (request: Request, ctx: WorkspaceContext) => {
  try {
    const { searchParams } = new URL(request.url)
    const result = await listInstalledPacks(ctx.workspaceId, { targetIndustry: searchParams.get('targetIndustry') || undefined, status: searchParams.get('status') || undefined, page: parseInt(searchParams.get('page') || '1', 10), pageSize: parseInt(searchParams.get('pageSize') || '10', 10) })
    return ApiResponse.ok(result)
  } catch (error) { return ApiResponse.error(error instanceof Error ? error.message : '未知错误', 500) }
}, 'VIEWER')

export const POST = withRBAC(async (request: Request, ctx: WorkspaceContext) => {
  try {
    const body = await request.json(); const packId = body.packId || body.id
    if (!packId) return ApiResponse.error('缺少 packId', 400)
    const gate = await checkAutomationGate({ automationLevel: "L3", riskLevel: "medium", confirmed: body.confirm === true, actionName: `安装行业包: ${packId}` })
    if (!gate.ok) return gate.response
    // 清除 SDK 缓存，读取最新修改的 manifest.yaml 属性
    clearCache(packId)
    // 编译并丰富 Manifest，加载具体技能、连接器和工作流定义，再交给 loader 写库
    const manifest = compilePackManifest(packId)
    const result = await installPack(manifest, ctx.workspaceId, ctx.userId || "system")
    return ApiResponse.ok(result)
  } catch (error) {
    if (error instanceof PackAlreadyInstalledError) return ApiResponse.error(error.message, 409)
    if (error instanceof PackManifestInvalidError) return ApiResponse.error(error.message, 400)
    if (error instanceof PackDependencyNotMetError || error instanceof PackCoreVersionIncompatibleError) return ApiResponse.error(error.message, 400)
    return ApiResponse.error(error instanceof Error ? error.message : '未知错误', 500)
  }
}, 'ADMIN')

