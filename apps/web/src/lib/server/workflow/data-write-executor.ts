/**
 * Data-Write 节点执行器（Hermes Control Kernel 域 —— 编排数据写入）
 *
 * 职责：从上游节点输出取值 → 白名单校验目标模型 → 审计预记录 → Prisma 写入 →
 *       ctx.variables 同步供下游条件分支读取。
 *
 * 归属：Hermes Control Kernel（编排层）。直接 Prisma 写入属于控制面的数据编排，
 *      不是 OpenClaw 连接器动作（后者通过 connector API 完成）。
 *
 * 安全护栏（AGENTS.md §5）：
 *   - target 仅限显式白名单（Inquiry），禁止动态拼接表名
 *   - 写入值经 sourcePath 限定的路径提取，不接受任意表达式
 *   - 审计预记录模式：写前留痕、写后更新状态
 */

import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { createAuditEntry, updateAuditEntry } from '@/lib/server/audit'
import type {
  WorkflowNode,
  WorkflowRunContext,
  NodeExecutionResult,
} from './dag-types'

// ---- 辅助函数 ----

/**
 * 按点号路径从嵌套对象中取值（如 "result.grade" → obj.result.grade）
 * 返回 undefined 表示路径不可达
 */
export function resolveNestedValue(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined
  const parts = path.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (current === null || current === undefined) return undefined
    if (typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

// ---- 主执行器 ----

/**
 * Data-Write 节点执行器。
 *
 * 职责：
 *   1. 从上游节点的 output 中按 sourcePath 取值
 *   2. 通过 Prisma 更新目标模型字段（仅 Inquiry 单表）
 *   3. 通过 createAuditEntry() 预记录 → 写入 → updateAuditEntry() 标记成功（L2 审计留痕）
 *   4. 将写入的值同步到 ctx.variables（供下游 condition 节点读取）
 *
 * 行业包注入点：
 *   - config.valueMap?: Record<string, string> —— 行业包声明的业务值映射
 *     （如外贸 {A→high, B→mid, C→low}），有则查表转值，无则直写原始值
 *   - config.field —— 目标字段，经白名单校验后直接用于 Prisma set
 */
export async function executeDataWriteNode(
  node: WorkflowNode,
  ctx: WorkflowRunContext,
): Promise<NodeExecutionResult> {
  const config = node.config ?? {}
  const target = typeof config.target === 'string' ? config.target : null
  const field = typeof config.field === 'string' ? config.field : null
  const sourceNode = typeof config.sourceNode === 'string' ? config.sourceNode : null
  const sourcePath = typeof config.sourcePath === 'string' ? config.sourcePath : null

  // 1. 校验必填配置
  if (!target || !field || !sourceNode) {
    return {
      status: 'failed',
      error: `Data-Write 节点 ${node.id} 缺少必填 config：target=${target}, field=${field}, sourceNode=${sourceNode}`,
      riskLevel: 'low',
    }
  }

  // 2. 目标模型白名单校验（禁止动态表名，AGENTS.md §5 安全护栏）
  if (target !== 'Inquiry') {
    return {
      status: 'failed',
      error: `Data-Write 目标 ${target} 不在白名单内（仅支持 Inquiry）`,
      riskLevel: 'high',
    }
  }

  // 3. 从上游节点输出中提取值
  const upstreamOutput = ctx.nodeOutputs[sourceNode]
  if (upstreamOutput === undefined || upstreamOutput === null) {
    return {
      status: 'failed',
      error: `Data-Write 上游节点 ${sourceNode} 无输出`,
      riskLevel: 'low',
    }
  }

  const value = sourcePath ? resolveNestedValue(upstreamOutput, sourcePath) : upstreamOutput
  if (value === undefined || value === null) {
    return {
      status: 'failed',
      error: `Data-Write 路径 ${sourcePath ?? '(root)'} 在节点 ${sourceNode} 输出中不可达`,
      riskLevel: 'low',
    }
  }

  // 4. 解析 Inquiry ID（从 ctx.variables 或 nodeOutputs 中获取）
  const inquiryId =
    (typeof ctx.variables.inquiryId === 'string' ? ctx.variables.inquiryId : null) ??
    (typeof ctx.nodeOutputs.inquiryId === 'string' ? ctx.nodeOutputs.inquiryId : null)

  if (!inquiryId) {
    return {
      status: 'failed',
      error: `Data-Write 无法定位 Inquiry ID（ctx.variables.inquiryId 缺失）`,
      riskLevel: 'low',
    }
  }

  // 5. 审计预记录（AGENTS.md §5 #3 禁止静默执行）
  const auditEntry = await createAuditEntry({
    actor: ctx.actor,
    action: 'workflow.data_write',
    targetType: 'inquiry',
    targetId: inquiryId,
    detail: `工作流节点「${node.name}」写入 Inquiry.${field}=${String(value).slice(0, 50)}（来自 ${sourceNode}.${sourcePath ?? '(root)'}）`,
    riskLevel: 'low',
    workspaceId: ctx.workspaceId ?? 'default',
    automationLevel: 'L2',
    triggeredBy: 'system',
    contextSnapshot: {
      nodeId: node.id,
      sourceNode,
      sourcePath,
      target,
      field,
      value: typeof value === 'string' ? value.slice(0, 200) : value,
    },
  })

  // 6. 执行 Prisma 写入（仅 Inquiry 单表）
  try {
    // 将 grade 值映射为 Inquiry.priority 字段
    if (target === 'Inquiry') {
      const valueMap = typeof config.valueMap === 'object' && config.valueMap !== null
        ? (config.valueMap as Record<string, string>)
        : null
      const rawValue = String(value).trim()

      // 有 valueMap → 查表转值（行业包声明的业务映射，如 A→high）；无 → 直写
      let writeValue: string
      if (valueMap) {
        writeValue = valueMap[rawValue] ?? valueMap[rawValue.toUpperCase()] ?? rawValue
      } else {
        writeValue = rawValue
      }

      // 白名单 field，防止恶意注入（仅允许 Inquiry 模型字段）
      const allowedFields = ['priority', 'status', 'assignee', 'note', 'grade'] as const
      const writeField = (allowedFields as readonly string[]).includes(field) ? field : 'priority'

      await prisma.inquiry.update({
        where: { id: inquiryId },
        data: { [writeField]: writeValue },
      })

      logger.info(
        `[data-write-executor] Data-Write 已更新 Inquiry ${inquiryId}.${writeField} = ${writeValue}` +
        (valueMap ? `（valueMap: ${rawValue}→${writeValue}）` : ''),
        { nodeId: node.id, sourceNode, inquiryId },
      )

      // 7. 同步到 ctx.variables（供下游 condition 节点读取）
      ctx.variables['grade'] = rawValue.toUpperCase()
      ctx.variables['priority'] = writeField === 'priority' ? writeValue : (ctx.variables['priority'] ?? null)
    }

    // 8. 审计状态更新为成功
    await updateAuditEntry({
      auditId: auditEntry.auditId,
      status: 'success',
      detail: `写入成功：Inquiry.${field}=${String(value).slice(0, 50)}`,
    })

    return {
      status: 'completed',
      output: { updated: true, target, field, value: String(value).slice(0, 200) },
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : '数据库写入异常'
    logger.error(`[data-write-executor] Data-Write 节点 ${node.id} 写入失败`, { error: errorMsg, inquiryId })

    await updateAuditEntry({
      auditId: auditEntry.auditId,
      status: 'failed',
      detail: `写入失败：${errorMsg}`,
    })

    return {
      status: 'failed',
      error: `Data-Write 写入 Inquiry.${field} 失败：${errorMsg}`,
      riskLevel: 'high',
    }
  }
}
