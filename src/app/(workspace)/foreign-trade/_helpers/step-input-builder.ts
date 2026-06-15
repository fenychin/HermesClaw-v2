/**
 * 工作流详情页步骤输入字段构造器
 *
 * P2-2 抽出：原本嵌在 [id]/page.tsx 的 buildStepInputs。
 */

export interface StepInputDef {
  key: string
  label: string
  type: "text" | "textarea" | "select"
  required: boolean
  placeholder?: string
  options?: Array<{ label: string; value: string }>
}

export interface StepNodeMeta {
  id: string
  kind: string
}

/** 按节点类型构建步骤输入字段 */
export function buildStepInputs(node: StepNodeMeta, index: number): StepInputDef[] {
  if (node.kind === "skill") {
    return [
      {
        key: `input_${node.id}_text`,
        label: "输入内容",
        type: "textarea",
        required: true,
        placeholder:
          index === 0
            ? "粘贴询盘邮件原文 / 客户需求描述..."
            : "补充信息或调整指令...",
      },
    ]
  }
  // data-write / task 节点不需要用户输入
  return []
}
