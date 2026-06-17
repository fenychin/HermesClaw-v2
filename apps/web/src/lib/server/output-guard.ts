/**
 * 模型输出校验层（AGENTS.md 第五章 A6：模型输出不得直接进入生产，须经校验）
 *
 * —— 对 LLM 产出做必填/长度/敏感动作校验，校验不通过则拦截，不直接落库或对外。
 *    与 task/route.ts 的置信度护栏互补：置信度判「要不要人工」，本层判「内容是否安全可用」。
 */

/** 敏感动作短语：输出中若声称已执行这些动作，需拦截（应由受控工具执行而非模型自述） */
const SENSITIVE_CLAIMS = [
  "已发送邮件",
  "已删除",
  "已下单",
  "已付款",
  "已修改生产",
  "已绕过",
]

export interface OutputGuardResult {
  ok: boolean
  /** 不通过原因 */
  reason?: string
}

export interface OutputGuardOptions {
  /** 最小长度（默认 1） */
  minLength?: number
  /** 最大长度（默认 20000，防异常超长） */
  maxLength?: number
}

/**
 * 校验模型输出文本。
 */
export function guardOutput(
  text: string,
  options: OutputGuardOptions = {},
): OutputGuardResult {
  const { minLength = 1, maxLength = 20_000 } = options

  const trimmed = (text ?? "").trim()
  if (trimmed.length < minLength) {
    return { ok: false, reason: "输出为空或过短" }
  }
  if (trimmed.length > maxLength) {
    return { ok: false, reason: "输出超出长度上限" }
  }

  for (const claim of SENSITIVE_CLAIMS) {
    if (trimmed.includes(claim)) {
      return {
        ok: false,
        reason: `输出声称已执行敏感动作「${claim}」，须经受控工具执行而非模型自述`,
      }
    }
  }

  return { ok: true }
}
