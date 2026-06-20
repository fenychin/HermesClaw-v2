import { z } from "zod"

/**
 * Skill 执行 Payload Schema（对应 actionType = "skill.<name>"）。
 */
export const SkillPayloadSchema = z.object({
  _type: z.string().refine((val) => val.startsWith("skill."), {
    message: "skill payload _type 必须以 skill. 开头",
  }),
  variables: z.record(z.string(), z.unknown()).default({}),
  nodeOutputs: z.record(z.string(), z.unknown()).default({}),
  config: z.record(z.string(), z.unknown()).default({}),
})

export type SkillPayload = z.infer<typeof SkillPayloadSchema>

/**
 * IndustryPayloadRegistry 接口。
 * 行业包通过 augmentation 注册自己的 _type → Schema 映射，
 * 运行时 Loader 读取 Registry 动态派发，无需在本文件枚举。
 */
export interface IndustryPayloadRegistry {
  [key: string]: z.ZodType<any>
}

/**
 * 兜底 Payload Schema（未知 actionType 允许宽泛 record，向后兼容）
 */
export const GenericPayloadSchema = z.object({
  _type: z.string(),
}).catchall(z.unknown())

export type GenericPayload = z.infer<typeof GenericPayloadSchema>

/**
 * TypedTaskInputSchema 综合 Schema。
 * 通过 transform 实现根据 _type 动态分发至对应的 Schema。
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
  if (typeof _type === "string" && _type.startsWith("skill.")) {
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

export type TypedTaskInput = SkillPayload | GenericPayload
