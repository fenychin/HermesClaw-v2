/**
 * AGENTS.md 运行时加载（AGENTS.md 第七章：本文档是 Agent 启动加载的第一份上下文）
 *
 * —— 在服务端读取仓库根目录 AGENTS.md，解析出治理要点并缓存，注入各 AI 角色的
 *    system prompt 与 Harness 评估基准，实现「治理规则单一事实源」，替代手抄条款。
 *
 * ⚠️ 仅服务端调用（用到 node:fs）；dev 下按 mtime 失效缓存以便热更新。
 */
import { readFile, stat } from "node:fs/promises"
import { join } from "node:path"

/** 候选项目根目录（覆盖 monorepo turbo 运行 / apps/web 直接启动 / 根目录直接启动） */
const CANDIDATE_ROOTS = [
  process.cwd(),                           // 1. 直接在项目根或 workspace 根运行
  join(process.cwd(), "..", ".."),         // 2. 从 apps/web/ 往上两级到达项目根（turbo dev）
  join(process.cwd(), "apps", "web"),      // 3. 从项目根进 apps/web（兜底）
]

interface Cache {
  mtimeMs: number
  full: string
  governance: string
}
let cache: Cache | null = null
let resolvedPath: string | null = null

/** 从全文裁剪治理要点（AI-First 三原则 + 六大组件 + 禁止行为），控制注入 token 量 */
function extractGovernance(full: string): string {
  const lines = full.split("\n")
  const wanted: string[] = []
  let capture = false
  for (const line of lines) {
    if (/^##+\s/.test(line)) {
      capture =
        /AI-First|禁止行为|核心组件|安全护栏|动态 ?Harness/i.test(line)
    }
    if (capture) wanted.push(line)
  }
  const text = wanted.join("\n").trim()
  return text.length > 0 ? text.slice(0, 4000) : full.slice(0, 1500)
}

/**
 * 读取并缓存 AGENTS.md。返回全文与治理摘要；读取失败时返回空串（不阻断业务）。
 * 自动尝试多个候选路径以适配 monorepo 目录结构。
 */
export async function loadAgentsMd(): Promise<{ full: string; governance: string }> {
  // 若已解析成功路径，直接复用
  if (resolvedPath) {
    try {
      const s = await stat(resolvedPath)
      if (cache && cache.mtimeMs === s.mtimeMs) {
        return { full: cache.full, governance: cache.governance }
      }
      const full = await readFile(resolvedPath, "utf8")
      const governance = extractGovernance(full)
      cache = { mtimeMs: s.mtimeMs, full, governance }
      return { full, governance }
    } catch {
      // 路径失效，重新搜索
      resolvedPath = null
      cache = null
    }
  }

  // 查找 AGENTS.md（兼容 monorepo 不同启动位置）
  for (const root of CANDIDATE_ROOTS) {
    const path = join(root, "AGENTS.md")
    try {
      const s = await stat(path)
      const full = await readFile(path, "utf8")
      const governance = extractGovernance(full)
      resolvedPath = path
      cache = { mtimeMs: s.mtimeMs, full, governance }
      return { full, governance }
    } catch { /* 尝试下一个路径 */ }
  }

  console.warn(
    "[loadAgentsMd] 在所有候选路径中均未找到 AGENTS.md：",
    CANDIDATE_ROOTS.map((r) => join(r, "AGENTS.md")),
  )
  return { full: "", governance: "" }
}

/**
 * 取治理条款片段，用于拼接到 system prompt 末尾。
 * 失败或为空时返回空串（调用方拼接安全）。
 */
export async function getGovernanceClause(): Promise<string> {
  const { governance } = await loadAgentsMd()
  if (!governance) return ""
  return `\n\n## 治理规则（来自 AGENTS.md，最高优先级，运行时加载）\n${governance}`
}
