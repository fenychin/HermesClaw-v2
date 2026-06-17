import { describe, it, expect } from "vitest"
import * as payloads from "../task-payloads"
import {
  TypedTaskInputSchema,
  isCriticalActionType,
  HandleInquiryPayloadSchema,
  GenerateQuotationPayloadSchema,
} from "../task-payloads"

describe("task-payloads schema tests", () => {
  describe("HandleInquiryPayload 校验", () => {
    it("合法输入应通过校验", () => {
      const valid = {
        _type: "trade.handle-inquiry",
        inquiryText: "Looking for 500 units of custom components.",
        sourceEmail: "client@example.com",
        priority: "high",
        clientId: "client-123",
      }
      const result = TypedTaskInputSchema.safeParse(valid)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data._type).toBe("trade.handle-inquiry")
      }
    })

    it("缺省非必填字段应使用默认值通过校验", () => {
      const minimal = {
        _type: "trade.handle-inquiry",
        inquiryText: "Short inquiry text",
      }
      const result = TypedTaskInputSchema.safeParse(minimal)
      expect(result.success).toBe(true)
      if (result.success) {
        expect((result.data as any).priority).toBe("medium") // 默认值
      }
    })
  })

  describe("GenerateQuotationPayload 校验", () => {
    it("合法输入应通过校验", () => {
      const valid = {
        _type: "trade.generate-quotation",
        productId: "prod-456",
        quantity: 100,
        currency: "USD",
        clientId: "client-789",
      }
      const result = TypedTaskInputSchema.safeParse(valid)
      expect(result.success).toBe(true)
    })

    it("缺少 clientId 应该报错", () => {
      const invalid = {
        _type: "trade.generate-quotation",
        productId: "prod-456",
        quantity: 100,
        currency: "USD",
        // 缺少 clientId
      }
      const result = TypedTaskInputSchema.safeParse(invalid)
      expect(result.success).toBe(false)
      if (!result.success) {
        // 确保能给出具体的错误原因（关于 clientId 缺失）
        const issues = result.error.issues
        const hasClientIdError = issues.some((issue) => issue.path.includes("clientId"))
        expect(hasClientIdError).toBe(true)
      }
    })
  })

  describe("未知 _type 兼容性校验", () => {
    it("未知 _type 应经 GenericPayloadSchema 校验通过", () => {
      const unknownPayload = {
        _type: "trade.custom-unknown-action",
        someField: "arbitrary value",
        nested: { foo: "bar" },
      }
      const result = TypedTaskInputSchema.safeParse(unknownPayload)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data._type).toBe("trade.custom-unknown-action")
        expect((result.data as any).someField).toBe("arbitrary value")
      }
    })
  })

  describe("isCriticalActionType 辅助函数", () => {
    it("应该识别 critical 动作", () => {
      expect(isCriticalActionType("trade.send-quotation")).toBe(true)
      expect(isCriticalActionType("trade.sign-contract")).toBe(true)
      expect(isCriticalActionType("trade.handle-inquiry")).toBe(false)
      expect(isCriticalActionType("trade.generate-dev-letter")).toBe(false)
      expect(isCriticalActionType("unknown")).toBe(false)
    })
  })

  describe("防御性架构守卫：防遗漏反射校验", () => {
    it("所有以 PayloadSchema 结尾的导出 Schema 必须在 KNOWN_TYPES 和 KnownTaskInputSchema 中注册", () => {
      const allExports = payloads as Record<string, any>
      
      const payloadSchemaKeys = Object.keys(allExports).filter(
        (key) => key.endsWith("PayloadSchema") && key !== "GenericPayloadSchema" && key !== "SkillPayloadSchema"
      )
      
      expect(payloadSchemaKeys.length).toBeGreaterThan(0)
      
      const registeredInUnion = allExports.KnownTaskInputSchema.options.map(
        (schema: any) => schema.shape?._type?.value || schema.shape?._type?._def?.value || schema.shape?._type?._def?.values?.[0]
      )
      
      for (const key of payloadSchemaKeys) {
        const schema = allExports[key]
        const literalType = schema.shape?._type?.value || schema.shape?._type?._def?.value || schema.shape?._type?._def?.values?.[0]
        
        expect(allExports.KNOWN_TYPES).toContain(literalType)
        expect(registeredInUnion).toContain(literalType)
      }
    })
  })
})
