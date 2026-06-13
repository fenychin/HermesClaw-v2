/**
 * 契约使用门禁（Contract-First 强制器）。
 *
 * 落地 CLAUDE.md §2.2 Contract-First 与 §7.1「所有外部输入必须校验」：
 * 扫描 src/app/api/**\/route.ts，凡读取请求体（req.json() / request.json()）：
 *   1. 未经任意 *Schema.parse / safeParse / validateBody / validateQuery 校验 → ERROR 非零退出
 *   2. 使用 `as Type` 裸断言（可能绕过校验）→ WARNING（不阻断，但暴露风险）
 *
 * 用法：pnpm contracts:check
 *
 * 已知限制：
 *   本门禁使用正则启发式，有以下盲区：
 *   - 不追踪变量引用（const s = S; s.safeParse(...) 不会匹配 S.safeParse）
 *   - 不检查 schema 与 json() 结果是否确实对应
 *   - 跨行模式匹配有限（. 不匹配换行符）
 *   这些不是 bug，是正则扫描的固有限制。P2 建议升级为 ts-morph AST 扫描，
 *   可精确追踪变量流 + 调用图，消除所有误报/漏报。
 *
 * AST 升级路径（P2）：
 *   pnpm add -D ts-morph
 *   → 解析每个 route.ts 的 AST
 *   → 找到所有 req.json() 调用点 → 追踪其返回值的使用链
 *   → 验证使用链中存在 safeParse/parse/validateBody 调用
 *   → 无则报 ERROR；有裸 as 断言则报 WARNING
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

const API_ROOT = join(process.cwd(), "src", "app", "api")

/** 读取请求体的特征（会消费外部输入）。 */
const BODY_READ = /\b(req|request|_req)\s*\.\s*json\s*\(/

/** 已做校验的特征（zod 解析或项目封装的校验器）。 */
const VALIDATED = /\.(safeParse|parse)\s*\(|validateBody\s*\(|validateQuery\s*\(/

/**
 * 反模式：对 json() 结果直接用 `as Type` 断言（绕过运行时校验）。
 * 匹配：await req.json() as Foo 或 const x = await req.json() as Bar
 */
const AS_CAST_ON_BODY = /\.\s*json\s*\(\s*\)\s+as\s+\w+/i

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
  const asWarnings: string[] = []
  let bodyReaders = 0

  for (const file of routes) {
    const src = readFileSync(file, "utf8")
    if (!BODY_READ.test(src)) continue
    bodyReaders++

    if (!VALIDATED.test(src)) {
      violations.push(file.replace(process.cwd() + "/", ""))
    }

    // 独立检测 as 断言模式：即使有校验器，裸 as 也是坏味道
    if (AS_CAST_ON_BODY.test(src)) {
      asWarnings.push(file.replace(process.cwd() + "/", ""))
    }
  }

  console.log(
    `[contracts:check] 扫描 ${routes.length} 个 route.ts，其中读取请求体 ${bodyReaders} 个。`,
  )

  // 先输出 as 断言警告（不阻断）
  if (asWarnings.length > 0) {
    console.warn(
      `\n[contracts:check] ⚠ ${asWarnings.length} 个端点对 json() 结果使用了裸 \`as Type\` 断言：`,
    )
    for (const w of asWarnings) console.warn(`  - ${w}`)
    console.warn(
      "  建议替换为 zod schema + validateBody/safeParse，消除运行时类型安全隐患。\n",
    )
  }

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
