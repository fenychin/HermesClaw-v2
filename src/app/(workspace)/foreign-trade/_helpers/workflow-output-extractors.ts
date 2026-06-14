/**
 * 工作流输出抽取器：开发信草稿、询盘分级
 *
 * P2-2 抽出：原本嵌在 inquiry-quick-entry.tsx 的纯函数。
 * 仅依赖 unknown → 结构化对象的转换，无 React / fetch 副作用。
 */

export interface DevLetterDraft {
  subject: string
  body: string
}

export interface GradeInfo {
  grade: string
  score: number
  analysis: string
  suggestedAction: string
}

/** 输出对象键数上限（防御 Buffer/大对象） */
const MAX_OUTPUT_KEYS = 50

/**
 * 从 workflowOutput 中提取 n4-email 节点生成的开发信草稿
 * —— workflowOutput 是 nodeId → nodeResult 的映射表
 */
export function extractDevLetter(workflowOutput: unknown): DevLetterDraft | null {
  if (!workflowOutput || typeof workflowOutput !== "object") return null
  const outputs = workflowOutput as Record<string, unknown>
  if (Object.keys(outputs).length > MAX_OUTPUT_KEYS) return null
  for (const nodeResult of Object.values(outputs)) {
    if (!nodeResult || typeof nodeResult !== "object") continue
    const nr = nodeResult as Record<string, unknown>
    const result =
      typeof nr.result === "object" && nr.result
        ? (nr.result as Record<string, unknown>)
        : nr
    const subject = typeof result.subject === "string" ? result.subject : null
    const body = typeof result.body === "string" ? result.body : null
    if (subject && body) {
      return { subject, body }
    }
  }
  return null
}

/** 从 workflowOutput 中提取询盘分级信息 */
export function extractGradeInfo(workflowOutput: unknown): GradeInfo | null {
  if (!workflowOutput || typeof workflowOutput !== "object") return null
  const outputs = workflowOutput as Record<string, unknown>
  if (Object.keys(outputs).length > MAX_OUTPUT_KEYS) return null
  for (const nodeResult of Object.values(outputs)) {
    if (!nodeResult || typeof nodeResult !== "object") continue
    const nr = nodeResult as Record<string, unknown>
    const result =
      typeof nr.result === "object" && nr.result
        ? (nr.result as Record<string, unknown>)
        : nr
    const grade = typeof result.grade === "string" ? result.grade : null
    if (!grade) continue
    const score =
      typeof result.score === "number"
        ? result.score
        : typeof result.score === "string"
          ? parseInt(result.score, 10)
          : 0
    const analysis =
      typeof result.analysis === "string"
        ? result.analysis
        : typeof nr.summary === "string"
          ? nr.summary
          : ""
    const suggestedAction =
      typeof result.suggestedAction === "string"
        ? result.suggestedAction
        : typeof result.suggested_action === "string"
          ? result.suggested_action
          : ""
    return { grade, score, analysis, suggestedAction }
  }
  return null
}
