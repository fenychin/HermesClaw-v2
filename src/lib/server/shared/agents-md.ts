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

const AGENTS_MD_PATH = join(process.cwd(), "AGENTS.md")

interface Cache {
  mtimeMs: number
  full: string
  governance: string
}
let cache: Cache | null = null

/** 从全文裁剪治理要点（AI-First 三原则 + 六大组件 + 禁止行为），控制注入 token 量 */
function extractGovernance(full: string): string {
  const lines = full.split("\n")
  const wanted: string[] = []
  let capture = false
  for (const line of lines) {
    // 章节标题作为开关：捕获「禁止行为清单」「AI-First」「六大核心组件」相关段落
    if (/^##+\s/.test(line)) {
      capture =
        /AI-First|禁止行为|核心组件|安全护栏|动态 ?Harness/i.test(line)
    }
    if (capture) wanted.push(line)
  }
  const text = wanted.join("\n").trim()
  // 兜底：解析不到时取全文前 1500 字
  return text.length > 0 ? text.slice(0, 4000) : full.slice(0, 1500)
}

/**
 * 读取并缓存 AGENTS.md。返回全文与治理摘要；读取失败时返回空串（不阻断业务）。
 */
export async function loadAgentsMd(): Promise<{ full: string; governance: string }> {
  try {
    const s = await stat(AGENTS_MD_PATH)
    if (cache && cache.mtimeMs === s.mtimeMs) {
      return { full: cache.full, governance: cache.governance }
    }
    const full = await readFile(AGENTS_MD_PATH, "utf8")
    const governance = extractGovernance(full)
    cache = { mtimeMs: s.mtimeMs, full, governance }
    return { full, governance }
  } catch (error) {
    console.warn("[loadAgentsMd] 读取 AGENTS.md 失败（已降级为空）：", error)
    return { full: "", governance: "" }
  }
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
