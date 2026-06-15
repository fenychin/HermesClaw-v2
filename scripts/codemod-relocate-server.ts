/**
 * Codemod —— src/lib/server/ 子目录化后的 import 路径批量替换
 *
 * 一次性脚本：扫描全仓所有文件，把 @/lib/server/{boundary,brain,...} 等
 * 25 个平铺文件路径替换为 @/lib/server/{hermes,shared}/{file}。
 *
 * 注意：
 * - 只替换 25 个已知文件，不影响子目录路径（如 @/lib/server/workflow/dag-runner）
 * - harness-eval.ts 搬到 hermes/ 后仍保留同名，但 import 改为新路径。
 *   外部引用 harness-eval 的 5 处代码会同步更新。
 *
 * 用法（一次性，完成后不保留）：
 *   pnpm tsx scripts/codemod-relocate-server.ts
 */
import { readFileSync, writeFileSync } from "node:fs"
import { execSync } from "node:child_process"
import { relative, join } from "node:path"

// 映射表：old-basename → new-relative-path-from-server-root
const MAPPING: Record<string, string> = {
  // ── hermes ──
  "agent-log": "shared/agent-log",
  "agent-serializer": "shared/agent-serializer",
  "agents-md": "shared/agents-md",
  "api-handler": "shared/api-handler",
  "api-response": "shared/api-response",
  "audit": "shared/audit",
  "audited-write": "shared/audited-write",
  "boundary": "hermes/boundary",
  "brain": "hermes/brain",
  "connectors": "shared/connectors",
  "exceptions": "shared/exceptions",
  "extract-file-text": "shared/extract-file-text",
  "guardrail": "hermes/guardrail",
  "harness-eval": "hermes/harness-eval",
  "harness-llm": "hermes/harness-llm",
  "hermes-suggestions": "hermes/hermes-suggestions",
  "industry-health": "hermes/industry-health",
  "industry-pack-loader": "hermes/industry-pack-loader",
  "llm-provider": "shared/llm-provider",
  "memory-service": "hermes/memory-service",
  "model-router": "shared/model-router",
  "output-guard": "shared/output-guard",
  "project-helpers": "hermes/project-helpers",
  "skills": "hermes/skills",
  "tool-registry": "shared/tool-registry",
  "mock-store": "hermes/mock-store",
}

// 在 content 中找到所有 @/lib/server/<file> 的 import（不包含子目录路径）
// 注意不替换已带子目录的（hermes/、shared/、workflow/ 等）
function pattern(): RegExp {
  const names = Object.keys(MAPPING).join("|")
  return new RegExp(`(['"])@/lib/server/(${names})(?![-\\w/])`, "g")
}

function main() {
  const cwd = process.cwd()
  // 找出所有源文件（排除 node_modules 与 generated）
  const out = execSync(
    `find src -type f \\( -name '*.ts' -o -name '*.tsx' \\) -not -path '*/generated/*' -not -path '*/node_modules/*' | sort`,
    { cwd },
  ).toString().trim().split("\n")

  let count = 0
  const re = pattern()

  for (const file of out) {
    const full = join(cwd, file)
    let content: string
    try {
      content = readFileSync(full, "utf-8")
    } catch {
      continue
    }

    let replaced = false
    content = content.replace(re, (match, quote, base: string) => {
      const newPath = MAPPING[base]
      if (!newPath) return match
      replaced = true
      return `${quote}@/lib/server/${newPath}`
    })

    if (replaced) {
      writeFileSync(full, content, "utf-8")
      console.log(`  [replaced] ${file}`)
      count++
    }
  }

  console.log(`\nTotal files replaced: ${count}`)
}

main()
