import { z } from "zod"

/**
 * Skill 执行 Payload Schema（对应 actionType = "skill.<name>"）。
 * 动态的 skill 名称无法列入 discriminatedUnion 的字面量，但本 schema 在
 * TypedTaskInputSchema 的 transform 中被 skill.* 前缀分支拦截校验，
 * 不会裸落到 GenericPayloadSchema。
 */
export const SkillPayloadSchema = z.object({
  _type: z.string().refine((val) => val.startsWith("skill."), {
    message: "skill payload _type 必须以 skill. 开头",
  }),
  /** 工作流上下文的变量集 */
  variables: z.record(z.string(), z.unknown()).default({}),
  /** 上游节点输出累积 */
  nodeOutputs: z.record(z.string(), z.unknown()).default({}),
  /** 当前节点的 config */
  config: z.record(z.string(), z.unknown()).default({}),
})

export type SkillPayload = z.infer<typeof SkillPayloadSchema>

/**
 * 询盘处理 Payload Schema
 */
export const HandleInquiryPayloadSchema = z.object({
  _type: z.literal("trade.handle-inquiry"),
  inquiryText: z.string().min(1),
  sourceEmail: z.string().email().optional(),
  priority: z.enum(["high", "medium", "low"]).default("medium"),
  clientId: z.string().optional(),
})

export type HandleInquiryPayload = z.infer<typeof HandleInquiryPayloadSchema>

/**
 * 开发信生成 Payload Schema
 */
export const GenerateDevLetterPayloadSchema = z.object({
  _type: z.literal("trade.generate-dev-letter"),
  clientProfile: z.record(z.string(), z.unknown()),
  productCategory: z.string(),
  tone: z.enum(["formal", "friendly", "brief"]).default("formal"),
})

export type GenerateDevLetterPayload = z.infer<typeof GenerateDevLetterPayloadSchema>

/**
 * 报价单生成 Payload Schema
 */
export const GenerateQuotationPayloadSchema = z.object({
  _type: z.literal("trade.generate-quotation"),
  productId: z.string(),
  quantity: z.number().positive(),
  currency: z.enum(["USD", "EUR", "CNY"]).default("USD"),
  clientId: z.string(),
})

export type GenerateQuotationPayload = z.infer<typeof GenerateQuotationPayloadSchema>

// 已知的 _type 列表，用于 GenericPayloadSchema 排除已知类型以保障强校验
export const KNOWN_TYPES = [
  "trade.handle-inquiry",
  "trade.generate-dev-letter",
  "trade.generate-quotation",
] as const

/**
 * 兜底 Payload Schema（未知 actionType 允许宽泛 record，向后兼容）
 * 排除已知的 _type，避免已知的 payload 缺失必填字段时由于兜底 schema 宽容而误通过
 */
export const GenericPayloadSchema = z.object({
  _type: z.string().refine((val) => !KNOWN_TYPES.includes(val as any), {
    message: "已知的 _type 应使用对应的具体 Schema 校验",
  }),
}).catchall(z.unknown())

export type GenericPayload = z.infer<typeof GenericPayloadSchema>

/**
 * 已知业务动作类型的 discriminatedUnion
 */
export const KnownTaskInputSchema = z.discriminatedUnion("_type", [
  HandleInquiryPayloadSchema,
  GenerateDevLetterPayloadSchema,
  GenerateQuotationPayloadSchema,
])

/**
 * TypedTaskInputSchema 综合 Schema。
 * 通过 transform 实现根据 _type 动态分发至对应的 Schema，
 * 既保证已知 actionType 的高精度强校验与扁平的错误信息，又对未知类型完美兼容，
 * 并且能够正确输出带有默认值的校验后数据。
 */
export const TypedTaskInputSchema = z.any().transform((data, ctx) => {
  if (!data || typeof data !== "object") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "输入必须是对象",
    })
    return z.NEVER
  }

  const { _type } = data as any
  if (typeof _type !== "string") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["_type"],
      message: "缺少 _type 字段或类型不正确",
    })
    return z.NEVER
  }

  let result
  if (_type === "trade.handle-inquiry") {
    result = HandleInquiryPayloadSchema.safeParse(data)
  } else if (_type === "trade.generate-dev-letter") {
    result = GenerateDevLetterPayloadSchema.safeParse(data)
  } else if (_type === "trade.generate-quotation") {
    result = GenerateQuotationPayloadSchema.safeParse(data)
  } else if (typeof _type === "string" && _type.startsWith("skill.")) {
    // P2-2.3：skill.* 动态 actionType 分支拦截，不走 GenericPayloadSchema 兜底
    result = SkillPayloadSchema.safeParse(data)
  } else {
    result = GenericPayloadSchema.safeParse(data)
  }

  if (!result.success) {
    for (const issue of result.error.issues) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: issue.path as (string | number)[],
        message: issue.message,
      })
    }
    return z.NEVER
  }

  return result.data
})

export type TypedTaskInput =
  | HandleInquiryPayload
  | GenerateDevLetterPayload
  | GenerateQuotationPayload
  | SkillPayload
  | GenericPayload

/**
 * 辅助函数：判断是否为高危 L3/L4 动作类型
 * 返回 true 的 actionType 必须经过强校验拦截
 */
export function isCriticalActionType(actionType: string): boolean {
  return actionType === "trade.send-quotation" || actionType === "trade.sign-contract"
}
