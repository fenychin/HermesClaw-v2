/**
 * 知识版本化 + KCL（AGENTS.md 第四章 4.2 上下文供给链 / 第五章 A4）
 *
 * —— mid/long 记忆的内容性改动不原地覆盖：先把当前版本快照写入 MemoryRevision，
 *    再 bump version 应用新值。short 记忆为实时上下文，不版本化（省成本）。
 *    每次变更可附 reason（知识变更日志），供溯源与 KCL 一致性检查。
 */
import { prisma } from "@/lib/prisma"

/** 是否需要版本化（仅 mid/long，且发生内容性字段变更） */
export function shouldVersion(
  type: string,
  changes: { content?: unknown; summary?: unknown; confidence?: unknown },
): boolean {
  if (type !== "mid" && type !== "long") return false
  return (
    changes.content !== undefined ||
    changes.summary !== undefined ||
    changes.confidence !== undefined
  )
}

/**
 * 在更新前把当前记忆快照写入 MemoryRevision，并返回新的 version 号。
 * 调用方随后用 { version: newVersion, ...changes } 更新 Memory。
 */
export async function snapshotRevision(
  memory: {
    id: string
    version: number
    content: string
    summary: string
    confidence: number
  },
  editedBy: string,
  reason?: string,
): Promise<number> {
  await prisma.memoryRevision.create({
    data: {
      memoryId: memory.id,
      version: memory.version,
      content: memory.content,
      summary: memory.summary,
      confidence: memory.confidence,
      editedBy,
      reason: reason ?? null,
    },
  })
  return memory.version + 1
}
