/**
 * 契约使用门禁（Contract-First 强制器）—— ts-morph AST 版。
 *
 * 落地 CLAUDE.md §2.2 Contract-First 与 §7.1「所有外部输入必须校验」：
 * 通过 AST 精确追踪 req.json() 返回值的变量流与使用链，验证每个 json() 结果
 * 在消费前都经过了 safeParse / parse / validateBody / validateQuery 校验。
 *
 * 用法：pnpm contracts:check
 *
 * 升级说明（P2 3.1）：
 *   原正则版存在盲区——不追踪变量引用、跨行匹配受限、无法区分“文件某处有校验”
 *   与“json() 结果确实经过了校验”。本 AST 版追踪每个 json() 结果的变量流，
 *   消除误报/漏报。裸 as 断言单独检测，与校验状态独立。
 */
import { readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { Project, SyntaxKind, Node, type CallExpression } from "ts-morph"

const API_ROOT = join(process.cwd(), "src", "app", "api")

// ─── AST 判断工具 ─────────────────────────────────────────────────────

function isJsonCall(node: Node): boolean {
  if (!Node.isCallExpression(node)) return false
  const expr = node.getExpression()
  if (!Node.isPropertyAccessExpression(expr)) return false
  if (expr.getName() !== "json") return false
  const obj = expr.getExpression()
  return /^\b(req|request|_req)\b/.test(obj.getText())
}

function isValidationCall(node: Node): boolean {
  if (!Node.isCallExpression(node)) return false
  const expr = node.getExpression()
  if (Node.isPropertyAccessExpression(expr)) {
    const name = expr.getName()
    if (name === "safeParse" || name === "parse") return true
  }
  if (Node.isIdentifier(expr)) {
    const name = expr.getText()
    if (name === "validateBody" || name === "validateQuery") return true
  }
  return false
}

/** 节点是否处于 `as Type` 断言中（向上找 AsExpression 父节点）。 */
function isAsCasted(node: Node): boolean {
  let cur: Node | undefined = node
  while (cur) {
    if (cur.getParent() && cur.getParent()?.getKind() === SyntaxKind.AsExpression) {
      return true
    }
    cur = cur.getParent()
  }
  return false
}

/**
 * 从 json() 调用中提取「接收 json 结果的标识符列表」。
 *
 * 覆盖三种赋值模式：
 *   1. const body = await req.json()     → VariableDeclaration
 *   2. body = await req.json()           → BinaryExpression (assignment)
 *   3. Schema.safeParse(await req.json()) → 直接传入（不产生变量，由调用方处理）
 *
 * 多层解构 const { a, b } = ... 暂不支持——P2 待办。
 */
function getAssignedIdentifiers(jsonCall: CallExpression): string[] {
  const ids: string[] = []
  let cur: Node = jsonCall

  // 穿透 await / parenthesis 到达赋值表达式或变量声明
  while (cur.getParent()) {
    const p = cur.getParent()
    if (!p) break
    const kind = p.getKind()

    // 模式 1：VariableDeclaration
    if (kind === SyntaxKind.VariableDeclaration) {
      const decl = p.asKindOrThrow(SyntaxKind.VariableDeclaration)
      ids.push(decl.getName())
      break
    }

    // 模式 2：BinaryExpression（赋值 x = await req.json()）
    if (kind === SyntaxKind.BinaryExpression) {
      try {
        const bin = p as unknown as {
          getLeft: () => Node
          getOperatorToken: () => { getText: () => string }
        }
        const left = bin.getLeft()
        if (Node.isIdentifier(left) && bin.getOperatorToken().getText() === "=") {
          ids.push(left.getText())
        }
      } catch {
        // 非赋值类 BinaryExpression，继续向上
      }
      break
    }

    // 穿透中间层：await、括号、.catch()/.then() 链式调用
    if (
      kind === SyntaxKind.AwaitExpression ||
      kind === SyntaxKind.ParenthesizedExpression ||
      kind === SyntaxKind.CallExpression ||
      kind === SyntaxKind.PropertyAccessExpression
    ) {
      cur = p
      continue
    }
    break
  }
  return ids
}

/**
 * 检查 json() 结果是否经过了校验——全文件级变量流追踪。
 *
 * 策略：
 *   1. 提取 json() 结果接收的标识符列表（const x = / x =）。
 *   2. 扫描同一文件内所有安全校验调用点（safeParse / parse / validateBody / validateQuery）。
 *   3. 任一标识符出现在任一校验调用的参数中 → 已校验。
 *   4. 特殊情况：json() 直接被包在校验调用参数中（不产生变量）→ 已校验。
 */
function isJsonResultValidated(
  jsonCall: CallExpression,
  allValidationCalls: CallExpression[],
): boolean {
  // 特殊情况：json() 直接被包在 safeParse(await req.json().catch(...)) 内
  let cur: Node = jsonCall
  while (cur.getParent()) {
    const p = cur.getParent()
    if (!p) break
    const kind = p.getKind()
    // 穿透：await、括号、.catch()/.then() 链式调用
    if (
      kind === SyntaxKind.AwaitExpression ||
      kind === SyntaxKind.ParenthesizedExpression ||
      kind === SyntaxKind.CallExpression ||
      kind === SyntaxKind.PropertyAccessExpression
    ) {
      cur = p
      continue
    }
    if (Node.isCallExpression(p) && isValidationCall(p)) {
      return true
    }
    break
  }

  // 变量模式：提取 json() 赋值的标识符 → 在文件中找校验调用
  const assignedIds = getAssignedIdentifiers(jsonCall)
  if (assignedIds.length === 0) return false

  for (const vc of allValidationCalls) {
    const args = vc.getArguments()
    for (const arg of args) {
      if (Node.isIdentifier(arg) && assignedIds.includes(arg.getText())) {
        return true
      }
    }
  }
  return false
}

// ─── 主逻辑 ────────────────────────────────────────────────────────────

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

  const project = new Project({ tsConfigFilePath: join(process.cwd(), "tsconfig.json") })

  const violations: string[] = []
  const asWarnings: string[] = []
  let bodyReaders = 0

  for (const file of routes) {
    const sourceFile = project.addSourceFileAtPathIfExists(file)
    if (!sourceFile) {
      console.warn(`[contracts:check] ⚠ 无法解析源文件，跳过：${file}`)
      continue
    }

    // 找到所有 req/request.json() 调用
    const allCalls = sourceFile.getDescendants()
    const jsonCalls = allCalls.filter(
      (n) => Node.isCallExpression(n) && isJsonCall(n),
    ) as CallExpression[]

    if (jsonCalls.length === 0) {
      sourceFile.forget()
      continue
    }
    bodyReaders += jsonCalls.length

    // 收集文件中所有校验调用（safeParse / parse / validateBody / validateQuery）
    const validationCalls = allCalls.filter(
      (n) => Node.isCallExpression(n) && isValidationCall(n),
    ) as CallExpression[]

    let allValidated = true
    for (const call of jsonCalls) {
      if (!isJsonResultValidated(call, validationCalls)) {
        allValidated = false
        break
      }
    }

    // 独立检测 as 断言：即使有校验器，裸 as 也是坏味道
    let hasAsCast = false
    for (const call of jsonCalls) {
      if (isAsCasted(call)) {
        hasAsCast = true
        break
      }
    }

    const relPath = file.replace(process.cwd() + "/", "")

    if (!allValidated) {
      violations.push(relPath)
    }
    if (hasAsCast) {
      asWarnings.push(relPath)
    }
  }

  console.log(
    `[contracts:check] AST 扫描 ${routes.length} 个 route.ts，检测到 ${bodyReaders} 个 json() 调用点。`,
  )

  // 先输出 as 断言警告（不阻断）
  if (asWarnings.length > 0) {
    console.warn(
      `\n[contracts:check] ⚠ ${asWarnings.length} 个文件对 json() 结果使用了裸 \`as Type\` 断言：`,
    )
    for (const w of asWarnings) console.warn(`  - ${w}`)
    console.warn(
      "  建议替换为 zod schema + validateBody/safeParse，消除运行时类型安全隐患。\n",
    )
  }

  if (violations.length === 0) {
    console.log(
      "[contracts:check] ✓ 所有 json() 调用点的返回值均经过了 schema 校验。",
    )
    process.exit(0)
  }

  console.error(
    `[contracts:check] ✗ ${violations.length} 个文件的 json() 结果未经 schema 校验（违反 Contract-First）：`,
  )
  for (const v of violations) console.error(`  - ${v}`)
  console.error(
    "\n修复：在 src/contracts 定义/复用 zod schema，并在 handler 入口对 json() 结果调用 safeParse。",
  )
  process.exit(1)
}

main()
