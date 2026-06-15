/**
 * Route → Service → Repository 三层强制门禁（AST 版）。
 *
 * 落地全局架构审查 P1-#4 与 CLAUDE.md §3.2「目录边界」：
 * - 新代码：route.ts 不得直接 import `@/lib/prisma`（数据访问应经 src/lib/server/* 服务封装）。
 * - 存量：使用白名单（scripts/check-route-prisma.allowlist.json）渐进迁移。
 *
 * 用法：pnpm routes:check
 *
 * 与 scripts/check-contract-usage.ts 同风格（ts-morph AST），同样作为 lint 流水线的一环。
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs"
import { join, relative } from "node:path"
import { Project, Node } from "ts-morph"

const API_ROOT = join(process.cwd(), "src", "app", "api")
const ALLOWLIST_PATH = join(process.cwd(), "scripts", "check-route-prisma.allowlist.json")

interface AllowlistFile {
  /** 写明允许直接 import @/lib/prisma 的存量 route 路径（相对仓库根，正斜线）。 */
  allowlist: string[]
  /** 文档：白名单存在的原因与逐步缩减策略。 */
  notes?: string
}

function loadAllowlist(): Set<string> {
  if (!existsSync(ALLOWLIST_PATH)) return new Set()
  const raw = readFileSync(ALLOWLIST_PATH, "utf-8")
  const json = JSON.parse(raw) as AllowlistFile
  return new Set(json.allowlist ?? [])
}

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) walk(full, files)
    else if (entry === "route.ts") files.push(full)
  }
  return files
}

interface Violation {
  file: string
  reason: string
}

function checkFile(filePath: string, project: Project): Violation | null {
  const sourceFile = project.addSourceFileAtPath(filePath)
  for (const importDecl of sourceFile.getImportDeclarations()) {
    const moduleSpecifier = importDecl.getModuleSpecifierValue()
    if (moduleSpecifier === "@/lib/prisma" || moduleSpecifier.endsWith("/lib/prisma")) {
      return {
        file: filePath,
        reason: `直接 import "${moduleSpecifier}"`,
      }
    }
    // 也拦 import { PrismaClient } from "@prisma/client" / "@/generated/prisma-v2"
    if (
      moduleSpecifier === "@prisma/client" ||
      moduleSpecifier.startsWith("@/generated/prisma")
    ) {
      const named = importDecl.getNamedImports().map((n) => n.getName())
      if (named.includes("PrismaClient")) {
        return {
          file: filePath,
          reason: `直接 import PrismaClient from "${moduleSpecifier}"`,
        }
      }
    }
  }
  return null
}

function main() {
  if (!existsSync(API_ROOT)) {
    console.error(`API_ROOT 不存在：${API_ROOT}`)
    process.exit(1)
  }

  const allowlist = loadAllowlist()
  const project = new Project({
    tsConfigFilePath: join(process.cwd(), "tsconfig.json"),
    skipAddingFilesFromTsConfig: true,
  })

  const files = walk(API_ROOT)
  const violations: Violation[] = []
  const stillAllowlisted: string[] = []
  const unusedAllowlist = new Set(allowlist)

  for (const file of files) {
    const rel = relative(process.cwd(), file).split("\\").join("/")
    const v = checkFile(file, project)
    if (!v) continue

    if (allowlist.has(rel)) {
      stillAllowlisted.push(rel)
      unusedAllowlist.delete(rel)
      continue
    }
    violations.push({ ...v, file: rel })
  }

  // 报告
  console.log(`\n[routes-check] 扫描 ${files.length} 个 route.ts 文件`)
  console.log(`[routes-check] 白名单条目 ${allowlist.size}，仍在违规中的 ${stillAllowlisted.length}`)

  if (unusedAllowlist.size > 0) {
    console.log(`\n✅ 已脱白名单（建议从 allowlist.json 移除以收紧门禁）：`)
    for (const f of unusedAllowlist) console.log(`   - ${f}`)
  }

  if (violations.length === 0) {
    console.log(`\n✅ 所有非白名单 route 均通过 Route→Service→Repository 三层门禁。`)
    process.exit(0)
  }

  console.error(`\n❌ ${violations.length} 个 route 违反 Route→Service→Repository 三层规则：`)
  for (const v of violations) {
    console.error(`   - ${v.file}: ${v.reason}`)
  }
  console.error(`\n修复方式：`)
  console.error(`  1) 把数据访问封装到 src/lib/server/<domain>/<repo>.ts 或 src/lib/server/repositories/`)
  console.error(`  2) route 改为 import 该 service 函数（不直接 import @/lib/prisma）`)
  console.error(`  3) 紧急情况可临时把路径加入 scripts/check-route-prisma.allowlist.json，但应附计划逐步移除`)
  process.exit(1)
}

main()
