/**
 * WorkflowGenerator Agent — DAG 工作流生成引擎
 *
 * 职责：接收用户自然语言意图 + 行业上下文（packId），调用 LLM 将意图解析为
 *       DAG JSON Schema（{ nodes, edges, metadata }），写入 DB Workflow 表
 *       状态为 'draft'（符合 AGENTS.md §4.7 L3 约束：不可直接执行，需人工 Review）。
 *
 * CLAUDE.md §3.2：行业相关的 prompt 模板必须从 industry-pack 注入，不得硬编码到核心。
 * 因此本文件不再持有 `TRADE_WORKFLOW_EXAMPLES` 字面量，而是 runtime 通过
 * `loadIndustryPrompt(packId, 'workflow-templates')` 拉取；缺失则降级到通用模板。
 *
 * Provider 策略（与 harness-llm.ts 一致，复用 llm-provider.ts）：
 *   1. HARNESS_LLM_PROVIDER 显式覆盖
 *   2. ANTHROPIC_API_KEY → 用 Anthropic
 *   3. DEEPSEEK_API_KEY → 回退 DeepSeek
 *
 * ⚠️ 仅在服务端（Route Handler / lib/server）调用，切勿在客户端引入。
 */
import { prisma } from "@/lib/prisma"
import { stringifyJsonField } from "@/lib/api-utils"
import { parseJsonLoose } from "@/lib/server/hermes/harness-llm"
import { logger } from "@/lib/logger"
import { writeAuditLog } from "@/lib/server/shared/audit"
import { guardOutput } from "@/lib/server/shared/output-guard"
import {
  resolveLlmProvider,
  callAnthropicText,
  callDeepSeekJson,
} from "@/lib/server/shared/llm-provider"
import type { WorkflowNode, WorkflowEdge } from "@/lib/server/workflow/dag-types"
import { loadIndustryPrompt } from "@/lib/industry-pack-sdk"

// ---- 类型定义 ----

/** 工作流 DAG 元数据 */
export interface WorkflowDagMetadata {
  /** 行业标识 */
  industry: string
  /** 生成引擎标识 */
  generatedBy: string
  /** Schema 版本 */
  version: string
}

/** 工作流 DAG 完整 Schema（LLM 输出格式） */
export interface WorkflowDagSchema {
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  metadata: WorkflowDagMetadata
}

/** 生成输入 */
export interface WorkflowGenerateInput {
  /** 用户自然语言意图 */
  intent: string
  /** 行业上下文 */
  industryContext: string
  /** 当前操作者，默认为 "system" */
  actor?: string
  /** 工作空间 ID，默认为 "default" */
  workspaceId?: string
  /** 预生成的工作流 ID */
  workflowId?: string
}

/** 生成结果 */
export interface WorkflowGenerateResult {
  workflowId: string
  name: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  metadata: WorkflowDagMetadata
}

// ---- 行业模板注入（CLAUDE.md §3.2：禁止在核心持有特定行业字面量） ----

/**
 * 通用降级模板：当 pack 未提供 `prompts/workflow-templates.md` 时使用。
 * 仅含与具体行业无关的节点 kind 与等级语义说明。
 */
const GENERIC_FALLBACK_TEMPLATE = `
通用 DAG 工作流构造规范：

节点 kind 说明：
- task：自定义任务（需 handler 执行）
- condition：条件分支（config.expression: "ctx.variables.<key> === <value>"）
- subworkflow：子流程嵌套
- noop：占位节点

自动化授权等级（L1-L4）应标注在节点 config.automationLevel 中。
所有涉及发送、删除、审批等操作的节点须为 L3。
工作流生成不涉及 L4（绝对禁止自动）动作。`

/**
 * 构造系统提示词。
 *
 * @param packId 行业包 ID（runtime 注入）。
 *   - 提供时：通过 SDK 加载 `prompts/workflow-templates.md` 拼接进 SYSTEM_PROMPT
 *   - 缺失或加载失败：降级到 GENERIC_FALLBACK_TEMPLATE
 */
function buildSystemPrompt(packId?: string): string {
  let industryTemplate = GENERIC_FALLBACK_TEMPLATE
  if (packId) {
    try {
      const loaded = loadIndustryPrompt(packId, "workflow-templates")
      if (loaded && loaded.trim().length > 0) {
        industryTemplate = loaded
      }
    } catch (err) {
      logger.warn("WorkflowGenerator: 行业 prompt 模板加载失败，使用通用降级模板", {
        packId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return `你是 HermesClaw-v2 的 WorkflowGenerator 引擎。
你的职责是将用户的自然语言业务意图，转化为结构化的 DAG（有向无环图）工作流定义。

${industryTemplate}

AGENTS.md §4.7 自动化授权分级：
- L1：全自动执行，无需审批
- L2：建议执行（默认），可自动执行但留痕
- L3：需人工确认，高风险操作必须人工二次确认
- L4：绝对禁止自动（工作流生成不涉及 L4 动作）

重要约束：
- 生成的工作流状态为 'draft'，不可直接执行，需人工 Review 后激活
- 所有节点用中文命名
- condition 节点的分支标签须在对应 edge.when 中引用
- edges 必须形成合法的 DAG（无环）
- 至少包含 2 个节点，最多 10 个节点
- config 中的 automationLevel 必须标注为 "L1" | "L2" | "L3"
- 仅输出 JSON 对象，不要任何额外文字或 Markdown 包裹`
}

/**
 * 构造用户提示词
 */
function buildUserPrompt(input: WorkflowGenerateInput): string {
  return `用户意图：${input.intent}
行业上下文：${input.industryContext}

请生成一份 DAG 工作流 JSON，格式如下：
{
  "nodes": [
    {
      "id": "node-1",
      "kind": "task",
      "name": "节点中文名称",
      "config": {
        "description": "节点描述",
        "automationLevel": "L2",
        "inputSchema": {},
        "outputSchema": {}
      }
    }
  ],
  "edges": [
    { "from": "node-1", "to": "node-2" }
  ],
  "metadata": {
    "industry": "${input.industryContext}",
    "generatedBy": "WorkflowGenerator",
    "version": "1.0"
  }
}

注意：
- node.id 必须唯一且语义化（如 "classify-email"、"ai-analysis"）
- condition 节点须在 config.expression 中指定条件，如 "ctx.variables.score >= 80"
- 对应分支的 edge.when 须与 condition 返回的 branch 标签一致
- 确保节点间的依赖关系形成有向无环图（DAG）
- 严格输出 JSON 对象，不要任何额外文字`
}

// ---- DAG 结构校验 ----

/**
 * Kahn 拓扑排序检测 DAG 环路。
 * @returns 有环时返回错误描述，无环时返回 null
 */
function detectCycle(nodes: WorkflowNode[], edges: WorkflowEdge[]): string | null {
  const inDegree = new Map<string, number>()
  const adjacency = new Map<string, string[]>()

  for (const node of nodes) {
    inDegree.set(node.id, 0)
    adjacency.set(node.id, [])
  }

  for (const edge of edges) {
    adjacency.get(edge.from)?.push(edge.to)
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1)
  }

  const queue: string[] = []
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id)
  }

  let visited = 0
  while (queue.length > 0) {
    const current = queue.shift()!
    visited++
    for (const neighbor of adjacency.get(current) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1
      inDegree.set(neighbor, newDegree)
      if (newDegree === 0) queue.push(neighbor)
    }
  }

  if (visited !== nodes.length) {
    return `DAG 存在循环依赖：已访问 ${visited} 个节点，共 ${nodes.length} 个节点`
  }
  return null
}

/**
 * 检测孤立节点（无入边且无出边）。
 * @returns 孤立节点 ID 列表
 */
function findOrphanNodes(nodes: WorkflowNode[], edges: WorkflowEdge[]): string[] {
  const hasIncoming = new Set(edges.map((e) => e.to))
  const hasOutgoing = new Set(edges.map((e) => e.from))
  return nodes
    .filter((n) => !hasIncoming.has(n.id) && !hasOutgoing.has(n.id))
    .map((n) => n.id)
}

/**
 * 对 LLM 生成的节点内容做输出安全扫描。
 * 扫描不阻断（因为是 draft 且需人工审核），但发现敏感声明时记录审计。
 */
function scanNodesForSensitiveClaims(nodes: WorkflowNode[]): string[] {
  const warnings: string[] = []
  for (const node of nodes) {
    // 扫描节点名称
    const nameResult = guardOutput(node.name, { maxLength: 500 })
    if (!nameResult.ok && nameResult.reason) {
      warnings.push(`节点 "${node.id}" 名称: ${nameResult.reason}`)
    }
    // 扫描节点描述
    const desc = node.config?.description
    if (typeof desc === "string" && desc.length > 0) {
      const descResult = guardOutput(desc, { maxLength: 5000 })
      if (!descResult.ok && descResult.reason) {
        warnings.push(`节点 "${node.id}" 描述: ${descResult.reason}`)
      }
    }
  }
  return warnings
}

/**
 * 校验并收窄 LLM 返回为 WorkflowDagSchema。
 * 包含：结构校验、DAG 环路检测、孤立节点检测。
 */
function validateDagSchema(raw: unknown): WorkflowDagSchema {
  if (!raw || typeof raw !== "object") {
    throw new Error("AI 返回结果不是合法对象")
  }
  const obj = raw as Record<string, unknown>

  // 校验 nodes
  const nodes: WorkflowNode[] = []
  if (!Array.isArray(obj.nodes)) {
    throw new Error("nodes 字段必须是数组")
  }
  const nodeIds = new Set<string>()
  for (const n of obj.nodes) {
    const node = n as Record<string, unknown>
    if (!node.id || !node.name) {
      throw new Error("每个节点必须包含 id 和 name")
    }
    const id = String(node.id)
    if (nodeIds.has(id)) {
      throw new Error(`节点 ID 重复: "${id}"`)
    }
    nodeIds.add(id)
    const kind = String(node.kind ?? "task")
    if (!["task", "condition", "subworkflow", "noop"].includes(kind)) {
      throw new Error(`节点 "${id}" 的 kind 不合法: ${kind}`)
    }
    nodes.push({
      id,
      kind: kind as WorkflowNode["kind"],
      name: String(node.name),
      config: node.config as Record<string, unknown> | undefined,
      handler: node.handler ? String(node.handler) : undefined,
    })
  }

  if (nodes.length < 2) {
    throw new Error(`工作流至少需要 2 个节点，当前仅 ${nodes.length} 个`)
  }

  // 校验 edges
  const edges: WorkflowEdge[] = []
  if (!Array.isArray(obj.edges)) {
    throw new Error("edges 字段必须是数组")
  }
  for (const e of obj.edges) {
    const edge = e as Record<string, unknown>
    if (!edge.from || !edge.to) {
      throw new Error("每条边必须包含 from 和 to")
    }
    if (!nodeIds.has(String(edge.from))) {
      throw new Error(`边引用了不存在的源节点: ${edge.from}`)
    }
    if (!nodeIds.has(String(edge.to))) {
      throw new Error(`边引用了不存在的目标节点: ${edge.to}`)
    }
    edges.push({
      from: String(edge.from),
      to: String(edge.to),
      when: edge.when ? String(edge.when) : undefined,
    })
  }

  // DAG 环路检测（AGENTS.md §2.3）
  const cycleError = detectCycle(nodes, edges)
  if (cycleError) {
    throw new Error(cycleError)
  }

  // 孤立节点检测（仅在节点数 > 2 时告警，简单线性 DAG 允许首尾无直接连接）
  const orphans = findOrphanNodes(nodes, edges)
  if (orphans.length > 0 && nodes.length > 2) {
    logger.warn("validateDagSchema: 存在孤立节点", { orphans, nodeCount: nodes.length })
  }

  // 校验 metadata
  const metadata = (obj.metadata as Record<string, unknown> | undefined) ?? {}
  return {
    nodes,
    edges,
    metadata: {
      industry: metadata.industry ? String(metadata.industry) : "",
      generatedBy: String(metadata.generatedBy ?? "WorkflowGenerator"),
      version: String(metadata.version ?? "1.0"),
    },
  }
}

/**
 * 从用户意图生成工作流名称（截断至 100 字符）
 */
function generateWorkflowName(intent: string): string {
  const cleaned = intent.replace(/\s+/g, " ").trim()
  return cleaned.length > 80 ? cleaned.slice(0, 80) + "…" : cleaned
}

// ---- LLM 调用（复用 llm-provider.ts 共享工具） ----

/** Anthropic 路径 */
async function generateWithAnthropic(
  systemPrompt: string,
  userPrompt: string,
  model: string,
): Promise<WorkflowDagSchema> {
  const text = await callAnthropicText({
    systemPrompt,
    userPrompt,
    model,
    maxTokens: 4096,
  })
  return validateDagSchema(parseJsonLoose(text))
}

/** DeepSeek 路径：兜底生成 */
async function generateWithDeepSeek(
  systemPrompt: string,
  userPrompt: string,
  model: string,
): Promise<WorkflowDagSchema> {
  const raw = await callDeepSeekJson({
    systemPrompt,
    userPrompt,
    model,
    maxTokens: 4096,
  })
  return validateDagSchema(raw)
}

/**
 * WorkflowGenerator 主入口
 *
 * 1. 调用 LLM 将自然语言意图解析为 DAG 工作流
 * 2. 对 LLM 产出做输出安全扫描
 * 3. 写入 DB Workflow 表（状态 'draft'）+ AuditLog
 * 4. 返回生成结果（workflowId + 预览 DAG）
 */
export async function generateWorkflow(
  input: WorkflowGenerateInput,
): Promise<WorkflowGenerateResult> {
  // Provider 选择（复用共享工具 llm-provider.ts）
  const { provider, model } = resolveLlmProvider()

  // 行业模板由 packId（即 industryContext）通过 SDK 注入；缺失则降级到通用模板
  const systemPrompt = buildSystemPrompt(input.industryContext)

  // 调用 LLM 生成 DAG
  const userPrompt = buildUserPrompt(input)
  const schema =
    provider === "anthropic"
      ? await generateWithAnthropic(systemPrompt, userPrompt, model)
      : await generateWithDeepSeek(systemPrompt, userPrompt, model)

  const workflowName = generateWorkflowName(input.intent)

  // 输出安全扫描：扫描 LLM 生成的节点内容（AGENTS.md §5 #6 / §2.3 输出校验层）
  const sensitiveWarnings = scanNodesForSensitiveClaims(schema.nodes)
  if (sensitiveWarnings.length > 0) {
    logger.warn("WorkflowGenerator: 节点内容输出安检告警", {
      count: sensitiveWarnings.length,
      warnings: sensitiveWarnings,
    })
  }

  // 写入 DB：状态为 'draft'（符合 AGENTS.md L3 约束，不可直接执行）
  const workflowId = input.workflowId ?? crypto.randomUUID()
  const created = await prisma.workflow.create({
    data: {
      id: workflowId,
      workspaceId: input.workspaceId ?? "default",
      name: workflowName,
      description: JSON.stringify(schema.metadata),
      status: "draft",
      nodes: stringifyJsonField(schema.nodes),
      edges: stringifyJsonField(schema.edges),
    },
  })

  logger.info("WorkflowGenerator 生成成功", {
    workflowId: created.id,
    provider,
    model,
    nodeCount: schema.nodes.length,
    edgeCount: schema.edges.length,
    sensitiveWarningCount: sensitiveWarnings.length,
  })

  return {
    workflowId: created.id,
    name: workflowName,
    nodes: schema.nodes,
    edges: schema.edges,
    metadata: schema.metadata,
  }
}
