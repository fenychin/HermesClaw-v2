/**
 * 契约使用门禁（Contract-First 强制器）。
 *
 * 落地 CLAUDE.md §2.2 Contract-First 与 §7.1「所有外部输入必须校验」：
 * 扫描 src/app/api/**\/route.ts，凡读取请求体（req.json() / request.json() / await *.json()）
 * 却未经任意 zod *Schema.parse / safeParse（或项目既有 validateBody/validateQuery 封装）
 * 校验的端点，判定为违规并以非零退出码失败。
 *
 * 用法：pnpm contracts:check
 *
 * 说明：当前仓库 69 个 API 端点中仅少数接入 zod，本门禁会暴露存量缺口（baseline）。
 * 它是一把可被机器强制的尺子——P1 阶段先建尺子，存量整改在后续任务逐端点收敛。
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

const API_ROOT = join(process.cwd(), "src", "app", "api")

/** 读取请求体的特征（会消费外部输入）。 */
const BODY_READ = /\b(req|request|_req)\s*\.\s*json\s*\(/
/** 已做校验的特征（zod 解析或项目封装的校验器）。 */
const VALIDATED = /\.(safeParse|parse)\s*\(|validateBody\s*\(|validateQuery\s*\(/

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (name === "route.ts") out.push(full)
  }
  return out
}

function main() {
  let routes: string[]
  try {
    routes = walk(API_ROOT)
  } catch {
    console.error(`[contracts:check] 找不到 API 目录：${API_ROOT}`)
    process.exit(2)
  }

  const violations: string[] = []
  let bodyReaders = 0

  for (const file of routes) {
    const src = readFileSync(file, "utf8")
    if (!BODY_READ.test(src)) continue // 该端点不读 body（如纯 GET），跳过
    bodyReaders++
    if (!VALIDATED.test(src)) {
      violations.push(file.replace(process.cwd() + "/", ""))
    }
  }

  console.log(
    `[contracts:check] 扫描 ${routes.length} 个 route.ts，其中读取请求体 ${bodyReaders} 个。`,
  )

  if (violations.length === 0) {
    console.log("[contracts:check] ✓ 所有读取请求体的端点均已做 schema 校验。")
    process.exit(0)
  }

  console.error(
    `[contracts:check] ✗ ${violations.length} 个端点读取请求体但未经 *Schema.parse/safeParse 校验（违反 Contract-First）：`,
  )
  for (const v of violations) console.error(`  - ${v}`)
  console.error(
    "\n修复：在 src/contracts 定义/复用 zod schema，并在 handler 入口对 body 调用 safeParse。",
  )
  process.exit(1)
}

main()
