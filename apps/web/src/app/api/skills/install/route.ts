/**
 * POST /api/skills/install
 * 上传技能 zip 包，解压后读取 SKILL.md frontmatter 校验并写入 Skill 表。
 *
 * 请求格式：multipart/form-data
 *   - file: .zip 文件
 *   - name: 技能名称（可选，与 SKILL.md name 交叉校验）
 */
import { logger } from '@/lib/logger'
import { successResponse, errorResponse, serializeSkill } from "@/lib/api-utils"
import { withRBAC } from "@/lib/server/api-handler"
import type { WorkspaceContext } from "@/lib/workspace"
import { createAuditEntry, updateAuditEntry, actorFromSession } from "@/lib/server/audit"
import { createSkillRecord } from "@/lib/server/skills"
import * as fs from "fs"
import * as path from "path"
import * as os from "os"

import { prisma } from "@/lib/prisma"

function copyFolderSync(from: string, to: string) {
  fs.mkdirSync(to, { recursive: true })
  const elements = fs.readdirSync(from)
  for (const element of elements) {
    const fromPath = path.join(from, element)
    const toPath = path.join(to, element)
    const stat = fs.statSync(fromPath)
    if (stat.isDirectory()) {
      copyFolderSync(fromPath, toPath)
    } else {
      fs.copyFileSync(fromPath, toPath)
    }
  }
}

/** 简易 frontmatter 解析（无 gray-matter 时的 fallback） */
function parseFrontmatter(raw: string): Record<string, string> | null {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!match) return null
  const fm: Record<string, string> = {}
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^([\w-]+):\s*(.*)$/)
    if (kv) fm[kv[1]] = kv[2].trim()
  }
  return fm
}

export const POST = withRBAC(async (request: Request, ctx: WorkspaceContext) => {
  const actor = await actorFromSession()
  const auditEntry = await createAuditEntry({
    actor, action: "skill.install", targetType: "skill", targetId: "pending",
    detail: "安装技能", riskLevel: "medium",
    workspaceId: ctx.workspaceId,
    automationLevel: "L2", triggeredBy: "user"
  })

  let tmpDir = ""
  try {
    const formData = await request.formData()
    const zipFile = formData.get("file") as File | null
    if (!zipFile) {
      await updateAuditEntry({ auditId: auditEntry.auditId, status: "failed", detail: "未上传文件" })
      return errorResponse("请上传 .zip 文件", 400)
    }
    if (!zipFile.name.endsWith(".zip")) {
      await updateAuditEntry({ auditId: auditEntry.auditId, status: "failed", detail: "文件格式错误" })
      return errorResponse("仅支持 .zip 格式", 400)
    }

    // 写入临时目录
    const buffer = Buffer.from(await zipFile.arrayBuffer())
    tmpDir = path.join(os.tmpdir(), `skill-${Date.now()}`)
    fs.mkdirSync(tmpDir, { recursive: true })
    const zipPath = path.join(tmpDir, zipFile.name)
    fs.writeFileSync(zipPath, buffer)

    // 尝试用系统 unzip，读取 SKILL.md
    const { execSync } = await import("child_process")
    try {
      execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${tmpDir}' -Force"`, {
        stdio: "pipe", timeout: 30000
      })
    } catch {
      logger.warn("zip 解压失败，使用 formData 中的元数据")
    }

    // 在解压目录中查找 SKILL.md
    let skillMdContent = ""
    let skillName = ""
    let skillDescription = ""

    for (const root of [tmpDir, ...fs.readdirSync(tmpDir).map(d => path.join(tmpDir, d))]) {
      const mdPath = path.join(root, "SKILL.md")
      if (fs.existsSync(mdPath)) {
        skillMdContent = fs.readFileSync(mdPath, "utf-8")
        const fm = parseFrontmatter(skillMdContent)
        if (fm?.["name"]) skillName = fm["name"]
        if (fm?.["description"]) skillDescription = fm["description"]
        break
      }
    }

    // 也检查根目录
    const rootMd = path.join(tmpDir, "SKILL.md")
    if (!skillMdContent && fs.existsSync(rootMd)) {
      skillMdContent = fs.readFileSync(rootMd, "utf-8")
      const fm = parseFrontmatter(skillMdContent)
      if (fm?.["name"]) skillName = fm["name"]
      if (fm?.["description"]) skillDescription = fm["description"]
    }

    // 如果没有 SKILL.md，从 formData 中取得
    if (!skillName) skillName = (formData.get("name") as string) || zipFile.name.replace(/\.zip$/i, "")
    if (!skillDescription) skillDescription = (formData.get("description") as string) || ""

    // 用 SDK 对 SKILL.md 进行强格式校验 (P1)
    const { validateSkillMd, parseFrontmatter: sdkParseFrontmatter } = await import("@hermesclaw/industry-pack-sdk")
    const validation = validateSkillMd(skillMdContent)
    if (!validation.valid) {
      await updateAuditEntry({ auditId: auditEntry.auditId, status: "failed", detail: `SKILL.md 格式不合法: ${validation.errors.join("; ")}` })
      return errorResponse(`SKILL.md 校验失败: ${validation.errors.join("; ")}`, 400)
    }

    const sdkFm = sdkParseFrontmatter(skillMdContent)
    if (sdkFm && sdkFm.name) skillName = sdkFm.name
    if (sdkFm && sdkFm.description) skillDescription = sdkFm.description

    // 拷贝解压后的文件包至持久物理路径 .agents/skills/[skillName] (P2)
    const targetDir = path.join(process.cwd(), ".agents", "skills", skillName)
    try {
      copyFolderSync(tmpDir, targetDir)
      // 删掉复制过去的临时 zip 文件
      const zipInTarget = path.join(targetDir, zipFile.name)
      if (fs.existsSync(zipInTarget)) {
        fs.unlinkSync(zipInTarget)
      }
    } catch (copyErr: any) {
      logger.warn(`Failed to copy skill files to .agents/skills/${skillName}: ${copyErr.message}`)
    }

    const existingSkill = await prisma.skill.findUnique({
      where: {
        workspaceId_name: {
          workspaceId: ctx.workspaceId,
          name: skillName
        }
      }
    })

    if (existingSkill && existingSkill.status === "inactive") {
      try {
        const { uninstallPack } = await import("@/lib/server/industry-pack-loader")
        await uninstallPack(`pack-${skillName}`, "1.0.0", ctx.workspaceId, ctx.userId || "system")
      } catch (packErr) {
        logger.warn(`安装前自愈清理历史残留行业包 [pack-${skillName}] 失败: ${String(packErr)}`)
      }
    }

    // 构造临时 IndustryPackManifest 以调用 installPack (P0)
    const { installPack } = await import("@/lib/server/industry-pack-loader")
    const manifest: any = {
      manifestVersion: "1.0",
      packId: `pack-${skillName}`,
      packName: skillName,
      packVersion: "1.0.0",
      version: "1.0.0",
      description: skillDescription,
      author: actor,
      license: "MIT",
      tags: ["skill"],
      targetIndustry: "general",
      minHarnessCoreVersion: "1.0.0",
      compatibleHermesApi: { min: "1.0.0", max: "99.0.0" },
      compatibleRuntimeApi: { min: "1.0.0", max: "99.0.0" },
      migrationRules: [
        {
          fromVersion: "0.0.1",
          toVersion: "1.0.0",
          description: "Initial migration for dynamic skill"
        }
      ],
      changelog: "Initial version",
      dependencies: [],
      capabilities: [
        {
          id: skillName,
          type: "skill",
          displayName: skillName,
          description: skillDescription,
          version: "1.0.0",
          inputSchema: {},
          outputSchema: {},
          tags: [],
          changelog: "Initial version"
        }
      ]
    }

    const { setCachedManifest } = await import("@hermesclaw/industry-pack-sdk")
    setCachedManifest(`pack-${skillName}`, manifest)

    await installPack(manifest, ctx.workspaceId, ctx.userId || "system")

    // 查询创建好的技能记录
    const skill = await prisma.skill.findUnique({
      where: {
        workspaceId_name: {
          workspaceId: ctx.workspaceId,
          name: skillName
        }
      }
    })

    if (!skill) {
      throw new Error("安装后未能找到技能记录")
    }

    // 更新 zipPath 和 skillMdContent 保证物理信息完整，同时确保 status 为 active
    const updatedSkill = await prisma.skill.update({
      where: { id: skill.id },
      data: {
        zipPath,
        skillMdContent,
        source: "EXTERNAL", // 强设为外部安装类型
        status: "active",   // 确保重装后状态为可见
      }
    })

    await updateAuditEntry({ auditId: auditEntry.auditId, status: "success", detail: `已安装/更新技能：${updatedSkill.id}` })
    return successResponse({ skill: serializeSkill(updatedSkill as unknown as Record<string, unknown>) }, 201)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error("POST /api/skills/install: 失败", { error: msg })
    await updateAuditEntry({ auditId: auditEntry.auditId, status: "failed", detail: msg })
    return errorResponse(`安装技能失败: ${msg}`)
  } finally {
    // 清理临时目录（异步）
    if (tmpDir) {
      setTimeout(() => {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
      }, 5000)
    }
  }
}, "MEMBER")
