/**
 * SemVer 版本解析与比较公共工具
 */

/**
 * 解析 SemVer 格式版本号，支持可选的 'v' 前缀及后缀 (如 '3.04.00-dev' -> [3, 4, 0])
 */
export function parseSemver(v: string): [number, number, number] | null {
  const m = v.match(/^v?(\d+)\.(\d+)\.(\d+)(?:-.*)?$/)
  if (!m) return null
  return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)]
}

/**
 * 比较两个 SemVer 版本。
 * 如果 v1 > v2 返回 1，v1 < v2 返回 -1，相等返回 0
 */
export function compareSemver(v1: string, v2: string): number {
  const p1 = parseSemver(v1)
  const p2 = parseSemver(v2)
  if (!p1 && !p2) return 0
  if (!p1) return -1
  if (!p2) return 1
  for (let i = 0; i < 3; i++) {
    if (p1[i] > p2[i]) return 1
    if (p1[i] < p2[i]) return -1
  }
  return 0
}

/**
 * 判断版本是否满足给定的 SemVer 范围描述（如 '>=1.0.0 <2.0.0'）
 */
export function satisfiesSemver(version: string, range: string): boolean {
  if (!range || range === '*' || range === 'latest') return true
  const parts = range.split(/\s+/)
  for (const part of parts) {
    const m = part.match(/^(>=|<=|>|<|=)?\s*v?(\d+\.\d+\.\d+.*)$/)
    if (!m) continue
    const op = m[1] || '='
    const target = m[2]
    const cmp = compareSemver(version, target)
    if (op === '>=') {
      if (cmp < 0) return false
    } else if (op === '<=') {
      if (cmp > 0) return false
    } else if (op === '>') {
      if (cmp <= 0) return false
    } else if (op === '<') {
      if (cmp >= 0) return false
    } else if (op === '=') {
      if (cmp !== 0) return false
    }
  }
  return true
}
