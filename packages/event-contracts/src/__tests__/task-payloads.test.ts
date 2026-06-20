import { describe, it, expect } from "vitest"
import { TypedTaskInputSchema } from "../task-payloads"

describe("task-payloads schema tests", () => {

  describe("技能 actionType（skill.*）校验", () => {
    it("合法 skill.* 输入应通过校验", () => {
      const valid = {
        _type: "skill.some-skill",
        variables: { foo: "bar" },
        nodeOutputs: {},
        config: {},
      }
      const result = TypedTaskInputSchema.safeParse(valid)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data._type).toBe("skill.some-skill")
      }
    })

    it("非 skill.* 前缀应走兜底 GenericPayloadSchema", () => {
      const payload = {
        _type: "custom.action",
        arbitrary: "value",
      }
      const result = TypedTaskInputSchema.safeParse(payload)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data._type).toBe("custom.action")
      }
    })
  })

  describe("未知 _type 兼容性校验", () => {
    it("未知 _type 应经 GenericPayloadSchema 校验通过", () => {
      const unknownPayload = {
        _type: "custom.unknown-action",
        someField: "arbitrary value",
        nested: { foo: "bar" },
      }
      const result = TypedTaskInputSchema.safeParse(unknownPayload)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data._type).toBe("custom.unknown-action")
        expect((result.data as any).someField).toBe("arbitrary value")
      }
    })
  })

  describe("边界与防御性校验", () => {
    it("非对象输入应拒绝", () => {
      expect(TypedTaskInputSchema.safeParse("string").success).toBe(false)
      expect(TypedTaskInputSchema.safeParse(123).success).toBe(false)
      expect(TypedTaskInputSchema.safeParse(null).success).toBe(false)
      expect(TypedTaskInputSchema.safeParse(undefined).success).toBe(false)
    })

    it("缺少 _type 应拒绝", () => {
      expect(TypedTaskInputSchema.safeParse({ foo: "bar" }).success).toBe(false)
    })

    it("_type 为非字符串应拒绝", () => {
      expect(TypedTaskInputSchema.safeParse({ _type: 123 }).success).toBe(false)
    })
  })
})
