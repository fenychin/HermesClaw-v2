/**
 * 极简 LCS (最长公共子序列) 行级 Diff 算法
 *
 * 用于记忆版本对比等场景，输出带有 added/removed 标记的行列表。
 * 提取自 apps/web/src/app/(workspace)/brain/page.tsx 以减少路由文件体积。
 */

export interface DiffLine {
  value: string
  added?: boolean
  removed?: boolean
}

export function diffLines(oldStr: string, newStr: string): DiffLine[] {
  const one = oldStr.split("\n")
  const two = newStr.split("\n")
  const N = one.length
  const M = two.length
  const dp: number[][] = Array.from({ length: N + 1 }, () => Array(M + 1).fill(0))

  for (let i = 1; i <= N; i++) {
    for (let j = 1; j <= M; j++) {
      if (one[i - 1] === two[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  const result: DiffLine[] = []
  let i = N, j = M
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && one[i - 1] === two[j - 1]) {
      result.unshift({ value: one[i - 1] })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ value: two[j - 1], added: true })
      j--
    } else {
      result.unshift({ value: one[i - 1], removed: true })
      i--
    }
  }
  return result
}
