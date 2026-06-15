/**
 * 记忆业务逻辑服务层 (MemoryService)
 * —— 实现 mid/long 级别记忆更新时的知识修订版本化 (KCL 机制)，保证数据库事务一致性。
 * —— 符合与 PRD 8.2 / AGENTS.md 第五章的治理审计及隔离规范。
 */
import { prisma } from "@/lib/prisma"
import crypto from "crypto"
import { writeAuditLog } from "@/lib/server/shared/audit"

export interface CreateMemoryInput {
  type: string
  content: string
  summary: string
  source: string
  relatedProject?: string | null
  relatedAgent?: string | null
  confidence?: number
  frozen?: boolean
  tags?: string[]
  projectId?: string | null
  proposalId?: string | null // 关联升级提案 ID
}

export interface UpdateMemoryInput {
  type?: string
  content?: string
  summary?: string
  source?: string
  relatedProject?: string | null
  relatedAgent?: string | null
  confidence?: number
  frozen?: boolean
  tags?: string[]
  projectId?: string | null
  reason?: string // 变更原因 (KCL)
  proposalId?: string | null // 关联升级提案 ID
}

/** 是否需要版本化快照（仅限制 mid 或 long 类型的记忆发生了内容性更改） */
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
 * 核心记忆 Service 层实现
 */
export class MemoryService {
  /**
   * 创建记忆
   * —— 写入 Memory 的同时强制在同一个数据库事务中原子写入 MemoryRevision 初始快照 (version = 1)
   */
  static async createMemory(
    workspaceId: string,
    input: CreateMemoryInput,
    actor: string,
  ) {
    const memory = await prisma.$transaction(async (tx) => {
      const memoryId = crypto.randomUUID()
      const tagsJson = JSON.stringify(input.tags || [])

      const newMemory = await tx.memory.create({
        data: {
          id: memoryId,
          workspaceId,
          type: input.type,
          content: input.content,
          summary: input.summary,
          source: input.source,
          relatedProject: input.relatedProject ?? null,
          relatedAgent: input.relatedAgent ?? null,
          confidence: input.confidence ?? 0.8,
          frozen: input.frozen ?? false,
          tags: tagsJson,
          projectId: input.projectId ?? null,
          version: 1,
          status: "active",
        },
      })

      // 强制写入首条修订快照作为初始版本
      await tx.memoryRevision.create({
        data: {
          workspaceId,
          memoryId: newMemory.id,
          version: 1,
          content: newMemory.content,
          summary: newMemory.summary,
          confidence: newMemory.confidence,
          editedBy: actor,
          reason: "初始创建",
          proposalId: input.proposalId ?? null,
        },
      })

      return newMemory
    })

    // 事务成功后自动追加审计日志留痕（防止因审计接口本身故障阻断主业务）
    await writeAuditLog({
      actor,
      action: "create.memory",
      targetType: "memory",
      targetId: memory.id,
      detail: `${memory.type} · ${memory.summary}`,
      riskLevel: "low",
      workspaceId,
    }).catch((err: unknown) => {
      console.error("[MemoryService] Failed to write audit log for createMemory:", err)
    })

    return memory
  }

  /**
   * 更新记忆
   * —— 针对 mid/long 级别的记忆，如果发生了内容变更，在同一个数据库事务中先写入修订快照，再累加 version 并保存最新值
   */
  static async updateMemory(
    workspaceId: string,
    id: string,
    input: UpdateMemoryInput,
    actor: string,
  ) {
    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.memory.findUnique({
        where: { id },
      })

      if (!existing) {
        throw new Error("Memory not found")
      }

      if (existing.workspaceId !== workspaceId) {
        throw new Error("Unauthorized workspace access to this memory")
      }

      const nextData: Record<string, unknown> = {}

      if (input.type !== undefined) nextData.type = input.type
      if (input.content !== undefined) nextData.content = input.content
      if (input.summary !== undefined) nextData.summary = input.summary
      if (input.source !== undefined) nextData.source = input.source
      if (input.relatedProject !== undefined) nextData.relatedProject = input.relatedProject
      if (input.relatedAgent !== undefined) nextData.relatedAgent = input.relatedAgent
      if (input.confidence !== undefined) nextData.confidence = input.confidence
      if (input.frozen !== undefined) nextData.frozen = input.frozen
      if (input.projectId !== undefined) nextData.projectId = input.projectId
      if (input.tags !== undefined) nextData.tags = JSON.stringify(input.tags)

      // 校验并执行版本化逻辑
      if (shouldVersion(existing.type, nextData)) {
        // 先为当前未修改前的数据版本拍摄快照写入 MemoryRevision
        await tx.memoryRevision.create({
          data: {
            workspaceId,
            memoryId: existing.id,
            version: existing.version,
            content: existing.content,
            summary: existing.summary,
            confidence: existing.confidence,
            editedBy: actor,
            reason: input.reason ?? "更新记忆内容",
            proposalId: input.proposalId ?? null,
          },
        })
        // version 属性自增 +1
        nextData.version = existing.version + 1
      }

      const updatedMemory = await tx.memory.update({
        where: { id },
        data: nextData,
      })

      return updatedMemory
    })

    // 事务成功后自动追加审计日志留痕
    await writeAuditLog({
      actor,
      action: "update.memory",
      targetType: "memory",
      targetId: updated.id,
      detail: `${updated.type} · ${updated.summary} (version: ${updated.version})`,
      riskLevel: "low",
      workspaceId,
    }).catch((err: unknown) => {
      console.error("[MemoryService] Failed to write audit log for updateMemory:", err)
    })

    return updated
  }

  /**
   * 删除记忆
   */
  static async deleteMemory(workspaceId: string, id: string, actor: string) {
    const deleted = await prisma.$transaction(async (tx) => {
      const existing = await tx.memory.findUnique({ where: { id } })
      if (!existing) {
        throw new Error("Memory not found")
      }
      if (existing.workspaceId !== workspaceId) {
        throw new Error("Unauthorized workspace access to this memory")
      }
      await tx.memory.delete({ where: { id } })
      return existing
    })

    // 事务成功后自动追加审计日志留痕
    await writeAuditLog({
      actor,
      action: "delete.memory",
      targetType: "memory",
      targetId: id,
      detail: `${deleted.type} · ${deleted.summary}`,
      riskLevel: "medium",
      workspaceId,
    }).catch((err: unknown) => {
      console.error("[MemoryService] Failed to write audit log for deleteMemory:", err)
    })
  }
}
