/**
 * 记忆业务逻辑服务层 (MemoryService)
 * —— 实现 mid/long 级别记忆更新时的知识修订版本化 (KCL 机制)，保证数据库事务一致性。
 * —— 符合与 PRD 8.2 / AGENTS.md 第五章的治理审计及隔离规范。
 */
import { prisma } from "@/lib/prisma"
import crypto from "crypto"
import { writeAuditLog } from "./audit"
import { withTraceStep } from "./reasoning-trace"
import type { ReasoningTrace } from "@hermesclaw/event-contracts"

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

  /**
   * 搜索记忆
   */
  static async searchMemory(
    workspaceId: string,
    query: string,
    trace?: ReasoningTrace
  ) {
    return withTraceStep(
      trace,
      {
        type: 'memory.recall',
        label: '调取相关记忆',
        inputs: { query },
      },
      async (step) => {
        // 简单实现基于内容的搜索
        const memories = await prisma.memory.findMany({
          where: {
            workspaceId,
            status: "active",
            OR: [
              { content: { contains: query } },
              { summary: { contains: query } },
            ],
          },
          take: 20,
        })

        step._pendingUpdate = {
          outputs: { recalledCount: memories.length },
          dataSources: memories.slice(0, 5).map(m => ({
            type: 'memory' as const,
            id: m.id,
            label: m.summary ?? m.type,
            excerpt: m.content?.slice(0, 100),
          })),
        }

        return memories
      }
    )
  }

  /**
   * 中短期记忆压缩升格 (compressMemories)
   * 将关联项目空间的 active mid 记忆合并，LLM 提炼并升格为全局性的 long 长期记忆
   */
  static async compressMemories(workspaceId: string, projectId: string, actor: string) {
    // 1. 查询该项目下所有活跃的、未冻结的 mid 中期记忆
    const midMemories = await prisma.memory.findMany({
      where: {
        workspaceId,
        projectId,
        type: "mid",
        status: "active",
        frozen: false,
      },
    });

    if (midMemories.length === 0) return null;

    let summary = "";
    let content = "";

    try {
      const { resolveLlmProvider, callDeepSeekJson } = await import("./llm-provider");
      const { provider, model } = resolveLlmProvider();

      const prompt = `你是一个长期记忆提炼助手。下面是关于某项目空间的多条零碎中期记忆，请将它们合并、提炼并抽象为一条完整的、高抽象度的长期全局记忆。
中期记忆列表：
${midMemories.map((m, idx) => `[${idx + 1}] Summary: ${m.summary}\nContent: ${m.content}`).join("\n\n")}

请输出一个合规的 JSON，不要任何 Markdown 标记：
{
  "summary": "合并后的长期记忆精炼摘要",
  "content": "合并后的长期记忆具体内容（高抽象度、跨场景）"
}`;
      const res = await callDeepSeekJson({
        systemPrompt: "你是一个记忆处理助手，只输出 JSON。",
        userPrompt: prompt,
        model,
      }) as { summary?: string; content?: string } | null;

      if (res && res.summary && res.content) {
        summary = res.summary;
        content = res.content;
      } else {
        throw new Error("Invalid LLM response structure");
      }
    } catch (err: any) {
      console.warn("[compressMemories] LLM 记忆压缩失败，降级至拼接规则:", err.message);
      summary = `项目记忆合并升格 (${projectId})`;
      content = `本条长期记忆是由中期记忆合并提炼生成：\n` + midMemories.map(m => `- [${m.summary}] ${m.content}`).join("\n");
    }

    // 2. 事务原子写入：将旧的中期记忆归档，并创建新的升格长期记忆
    const newMemory = await prisma.$transaction(async (tx) => {
      // 归档中期记忆
      await tx.memory.updateMany({
        where: { id: { in: midMemories.map(m => m.id) } },
        data: { status: "archived" },
      });

      const newId = crypto.randomUUID();
      const created = await tx.memory.create({
        data: {
          id: newId,
          workspaceId,
          type: "long",
          content,
          summary,
          source: "system",
          confidence: 0.9,
          frozen: false,
          tags: JSON.stringify(["compressed", "升格记忆"]),
          version: 1,
          status: "active",
        },
      });

      // 写入修订历史
      await tx.memoryRevision.create({
        data: {
          workspaceId,
          memoryId: newId,
          version: 1,
          content,
          summary,
          confidence: 0.9,
          editedBy: actor,
          reason: "由系统评估自动中期记忆压缩升格",
        },
      });

      return created;
    });

    // 写入审计日志 (action: 'compress.memory')
    await writeAuditLog({
      actor,
      action: "compress.memory",
      targetType: "memory",
      targetId: newMemory.id,
      detail: `成功将 ${midMemories.length} 条中期记忆压缩并升格为长期记忆: ${summary}`,
      riskLevel: "low",
      workspaceId,
    }).catch(() => {});

    return newMemory;
  }

  /**
   * 长期记忆去重与自动摘要合并 (mergeDuplicateMemories)
   * 检索活跃的 long 记忆，使用 LLM 判别并合并相同语义下的冗余知识片段，融合成精炼的 long 记忆
   */
  static async mergeDuplicateMemories(workspaceId: string, actor: string) {
    // 1. 查询该工作区下所有活跃的、未冻结的 long 长期记忆
    const longMemories = await prisma.memory.findMany({
      where: {
        workspaceId,
        type: "long",
        status: "active",
        frozen: false,
      },
    });

    if (longMemories.length < 2) return null;

    interface MergeResultItem {
      summary: string;
      content: string;
      mergedFromIds: string[];
    }

    let mergedItems: MergeResultItem[] = [];

    try {
      const { resolveLlmProvider, callDeepSeekJson } = await import("./llm-provider");
      const { provider, model } = resolveLlmProvider();

      const prompt = `下面是当前工作区内所有的活跃长期记忆。请找出其中关于同一个事实、同一项规则、或是同一类领域知识的重复/冗余记忆，并把它们进行语义融合，输出精炼后的长期记忆。
对于不重复、不冗余的记忆，请原样保留。

记忆列表：
${longMemories.map(m => `ID: ${m.id}\nSummary: ${m.summary}\nContent: ${m.content}`).join("\n\n")}

请返回融合去重后的记忆列表，只输出 JSON，不要任何 Markdown 标记。格式如下：
{
  "merged": [
    {
      "summary": "提炼后的摘要",
      "content": "提炼后的内容",
      "mergedFromIds": ["id1", "id2"] // 该条融合记忆由哪几条原始记忆合并而来。若没有合并，则填其自身单 ID
    }
  ]
}`;
      const res = await callDeepSeekJson({
        systemPrompt: "你是一个长期记忆融合助手，只输出 JSON。",
        userPrompt: prompt,
        model,
      }) as { merged?: MergeResultItem[] } | null;

      if (res && Array.isArray(res.merged)) {
        mergedItems = res.merged;
      } else {
        throw new Error("Invalid LLM response structure");
      }
    } catch (err: any) {
      console.warn("[mergeDuplicateMemories] LLM 记忆融合失败，降级至兜底合并:", err.message);
      // 降级保底：合并最后创建的两条活跃记忆（假定它们为冗余）
      const lastTwo = longMemories.slice(-2);
      mergedItems = [
        {
          summary: `融合记忆: ${lastTwo[0].summary} & ${lastTwo[1].summary}`,
          content: `这是由以下冗余长期记忆语义去重融合而成：\n1. ${lastTwo[0].content}\n2. ${lastTwo[1].content}`,
          mergedFromIds: lastTwo.map(m => m.id),
        }
      ];
    }

    // 2. 事务写入：对被合并的旧记忆归档，并新建融合后的记忆
    const result = await prisma.$transaction(async (tx) => {
      const archiveIds: string[] = [];
      const createdMemories = [];

      for (const item of mergedItems) {
        if (item.mergedFromIds && item.mergedFromIds.length > 1) {
          archiveIds.push(...item.mergedFromIds);

          const newId = crypto.randomUUID();
          const created = await tx.memory.create({
            data: {
              id: newId,
              workspaceId,
              type: "long",
              content: item.content,
              summary: item.summary,
              source: "system",
              confidence: 0.9,
              frozen: false,
              tags: JSON.stringify(["merged", "去重记忆"]),
              version: 1,
              status: "active",
            },
          });

          await tx.memoryRevision.create({
            data: {
              workspaceId,
              memoryId: newId,
              version: 1,
              content: item.content,
              summary: item.summary,
              confidence: 0.9,
              editedBy: actor,
              reason: "跨项目重复记忆语义融合去重",
            },
          });

          createdMemories.push(created);
        }
      }

      if (archiveIds.length > 0) {
        await tx.memory.updateMany({
          where: { id: { in: archiveIds } },
          data: { status: "archived" },
        });
      }

      return createdMemories;
    });

    if (result.length > 0) {
      await writeAuditLog({
        actor,
        action: "merge.memory",
        targetType: "memory",
        targetId: result[0].id,
        detail: `成功对 ${result.length * 2} 条冗余长期记忆进行去重与融合。`,
        riskLevel: "low",
        workspaceId,
      }).catch(() => {});
    }

    return result;
  }
}
