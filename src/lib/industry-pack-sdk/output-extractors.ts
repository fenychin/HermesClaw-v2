/**
 * Industry Pack SDK — 工作流输出通用提取器
 *
 * 职责：
 * - 提供行业无关的通用输出扫描逻辑（scanNodeOutputs 策略）
 * - 各行业包的具体输出结构由 schemas/workflow-outputs.yaml 声明
 * - 前端只需调用此 SDK 函数，不得在视图层硬编码 nodeId 或字段路径
 *
 * 遵循 CLAUDE.md §3.2 §6.1：
 * - 行业包内部具体业务逻辑必须落在 industry-packs/<pack-id>/
 * - src/lib/industry-pack-sdk/ 只放行业包装载与校验逻辑
 * - 前端 src/app/ 通过此 SDK 函数间接消费行业包资产，不直接依赖私有 helper
 */

/** 输出对象键数上限（防御超大对象的 DoS 风险） */
const MAX_OUTPUT_KEYS = 50

/**
 * 开发信草稿结构（与 foreign-trade/schemas/workflow-outputs.yaml devLetterDraft 对应）
 */
export interface WorkflowDevLetterDraft {
  subject: string
  body: string
}

/**
 * 询盘分级结果结构（与 foreign-trade/schemas/workflow-outputs.yaml inquiryGradeInfo 对应）
 */
export interface WorkflowGradeInfo {
  grade: string
  score: number
  analysis: string
  suggestedAction: string
}

/**
 * 扫描策略（scanNodeOutputs）：
 * 遍历 workflowOutput 的所有节点结果，找到第一个符合字段定义的对象。
 * 采用此策略可避免与 nodeId（如 n4-email）直接耦合，
 * 工作流内部节点调整不影响前端展现。
 */

/**
 * 从 workflowOutput（nodeId → nodeResult 映射表）中
 * 提取开发信草稿（devLetterDraft 输出策略）
 */
export function extractWorkflowDevLetter(workflowOutput: unknown): WorkflowDevLetterDraft | null {
  if (!workflowOutput || typeof workflowOutput !== 'object') return null
  const outputs = workflowOutput as Record<string, unknown>
  if (Object.keys(outputs).length > MAX_OUTPUT_KEYS) return null

  for (const nodeResult of Object.values(outputs)) {
    if (!nodeResult || typeof nodeResult !== 'object') continue
    const nr = nodeResult as Record<string, unknown>
    // 优先检查 nr.result（嵌套结构），其次检查 nr 本身（扁平结构）
    const result =
      typeof nr.result === 'object' && nr.result
        ? (nr.result as Record<string, unknown>)
        : nr
    const subject = typeof result.subject === 'string' ? result.subject : null
    const body = typeof result.body === 'string' ? result.body : null
    if (subject && body) {
      return { subject, body }
    }
  }
  return null
}

/**
 * 从 workflowOutput（nodeId → nodeResult 映射表）中
 * 提取询盘分级信息（inquiryGradeInfo 输出策略）
 */
export function extractWorkflowGradeInfo(workflowOutput: unknown): WorkflowGradeInfo | null {
  if (!workflowOutput || typeof workflowOutput !== 'object') return null
  const outputs = workflowOutput as Record<string, unknown>
  if (Object.keys(outputs).length > MAX_OUTPUT_KEYS) return null

  for (const nodeResult of Object.values(outputs)) {
    if (!nodeResult || typeof nodeResult !== 'object') continue
    const nr = nodeResult as Record<string, unknown>
    const result =
      typeof nr.result === 'object' && nr.result
        ? (nr.result as Record<string, unknown>)
        : nr

    const grade = typeof result.grade === 'string' ? result.grade : null
    if (!grade) continue

    const score =
      typeof result.score === 'number'
        ? result.score
        : typeof result.score === 'string'
          ? parseInt(result.score, 10)
          : 0
    const analysis =
      typeof result.analysis === 'string'
        ? result.analysis
        : typeof nr.summary === 'string'
          ? nr.summary
          : ''
    const suggestedAction =
      typeof result.suggestedAction === 'string'
        ? result.suggestedAction
        : typeof result.suggested_action === 'string'
          ? result.suggested_action
          : ''

    return { grade, score, analysis, suggestedAction }
  }
  return null
}
