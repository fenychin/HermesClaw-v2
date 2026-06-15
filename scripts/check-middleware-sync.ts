#!/usr/bin/env tsx
/**
 * middleware 双文件同步检查脚本（P1-V3 修复）
 *
 * 背景：Next.js 16 turbopack/webpack 非确定性加载 middleware.ts 或 src/middleware.ts。
 * 两份文件的**运行时行为**必须完全一致。
 *
 * 本脚本：去除所有注释（行注释 // 与块注释）后删除空白行，
 * 归一化空格，逐字节比对。不一致则 exit 1。
 */

import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const ROOT = resolve(import.meta.dirname, "..")
const FILES = [
  resolve(ROOT, "middleware.ts"),
  resolve(ROOT, "src/middleware.ts"),
]

/** 去除所有注释（// 行注释 + 块注释），压缩空白 */
function normalize(js: string): string {
  // 先移除块注释（跨行）
  let result = js.replace(/\/\*[\s\S]*?\*\//g, "")
  // 再移除单行注释
  result = result.replace(/\/\/[^\n]*/g, "")
  // 压缩连续空白行 -> 单空行
  result = result.replace(/\n\s*\n/g, "\n")
  // 压缩行内连续空格
  result = result.replace(/[ \t]+/g, " ")
  // trim 每行，去空行
  return result
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join("\n")
}

function main() {
  const contents = FILES.map((f) => {
    try {
      return normalize(readFileSync(f, "utf-8"))
    } catch (err) {
      console.error(`❌ 无法读取 ${f}:`, err)
      process.exit(1)
    }
  })

  if (contents[0] !== contents[1]) {
    console.error("❌ middleware.ts 与 src/middleware.ts 行为不一致（去除注释后内容不同）")

    // 逐行 diff
    const a = contents[0].split("\n")
    const b = contents[1].split("\n")
    const maxLen = Math.max(a.length, b.length)
    let firstDiff = -1
    for (let i = 0; i < maxLen; i++) {
      if (a[i] !== b[i]) {
        firstDiff = i
        break
      }
    }
    if (firstDiff >= 0) {
      console.error(`   首处差异在第 ${firstDiff + 1} 行：`)
      console.error(`   middleware.ts:     ${a[firstDiff]?.slice(0, 120) ?? "(EOF)"}`)
      console.error(`   src/middleware.ts: ${b[firstDiff]?.slice(0, 120) ?? "(EOF)"}`)
    }

    process.exit(1)
  }

  console.log("✅ middleware.ts 与 src/middleware.ts 行为一致")
  process.exit(0)
}

main()
