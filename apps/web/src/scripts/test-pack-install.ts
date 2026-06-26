import { prisma } from "@/lib/prisma"
import { installPack, uninstallPack } from "@/lib/server/industry-pack-loader"
import { loadIndustryManifest, loadIndustryWorkflowDag, clearCache } from "@hermesclaw/industry-pack-sdk"
import type { IndustryPackManifest, PackCapabilityEntry } from "@hermesclaw/event-contracts"
import fs from "fs"
import path from "path"
import yaml from "yaml"

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

async function run() {
  const workspaceId = "default" // 默认 workspaceId
  console.log("🚀 开始卸载已存在的「foreign-trade」行业包...")
  try {
    await uninstallPack("foreign-trade", "1.1.0", workspaceId, "admin")
    console.log("✅ 卸载成功")
  } catch (err: any) {
    console.log("ℹ️ 卸载跳过或失败:", err.message)
  }

  // 清除本地之前可能残留的 Skill 数据
  console.log("🧹 清理历史 Skill 实体数据...")
  const names = ['客户画像分析','报价策略生成','开发信生成','询盘深度分析','自动生成报价单','撰写开发信','调用智能体','创建项目空间','result-first-delivery']
  await prisma.skill.deleteMany({
    where: { name: { in: names }, workspaceId }
  })
  console.log("✅ 清理历史 Skill 实体数据成功")

  console.log("📦 开始编译外贸行业包 manifest...")
  clearCache("foreign-trade")
  const manifest = compilePackManifest("foreign-trade")
  console.log("✅ 编译成功，包含能力数量:", manifest.capabilities.length)

  console.log("📥 开始安装外贸行业包...")
  const inst = await installPack(manifest, workspaceId, "admin")
  console.log("✅ 安装成功，状态:", inst.status)

  console.log("🔍 查询数据库验证 Skill 实体和其中的 skillMdContent...")
  const skills = await prisma.skill.findMany({
    where: { name: { in: names }, workspaceId },
    select: { id: true, name: true, status: true, skillMdContent: true }
  })

  skills.forEach(s => {
    console.log(`技能: ${s.name} (${s.id})`)
    console.log(`  - 状态: ${s.status}`)
    console.log(`  - SKILL.md 长度: ${s.skillMdContent ? s.skillMdContent.length + " 字符" : "❌ 无内容"}`)
  })
  const allAgents = await prisma.agent.findMany({
    where: { workspaceId },
    select: { id: true, name: true, status: true, createdAt: true }
  })
  console.log("\n=== 当前数据库中的 Agent 列表 ===")
  allAgents.forEach(a => {
    console.log(`Agent: ${a.name} (${a.id}) - 状态: ${a.status} - 创建时间: ${a.createdAt}`)
  })
}


run()
  .then(() => {
    console.log("✨ 自检完成")
    process.exit(0)
  })
  .catch(e => {
    console.error("❌ 自检出错:", e)
    process.exit(1)
  })
