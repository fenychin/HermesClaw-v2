import { describe, it, expect } from "vitest"
import { z } from "zod"
import {
  AutomationLevelSchema,
  RiskLevelSchema,
  EventTypeSchema,
  ExecutionStatusSchema,
  VersionSchema,
  TimestampSchema,
  IdSchema,
  CONTRACT_VERSION,
  typedPayload,
  roundTrip,
} from "./shared"

describe("shared enums & primitives", () => {
  it("AutomationLevel 只接受 L1–L4（AGENTS §5.2）", () => {
    for (const lvl of ["L1", "L2", "L3", "L4"]) {
      expect(AutomationLevelSchema.parse(lvl)).toBe(lvl)
    }
    expect(AutomationLevelSchema.safeParse("L0").success).toBe(false)
    expect(AutomationLevelSchema.safeParse("L5").success).toBe(false)
    // Level 0–3 与 L1–L4 严禁混用
    expect(AutomationLevelSchema.safeParse("0").success).toBe(false)
  })

  it("RiskLevel 枚举校验", () => {
    expect(RiskLevelSchema.parse("critical")).toBe("critical")
    expect(RiskLevelSchema.safeParse("severe").success).toBe(false)
  })

  it("EventType 覆盖 run.* / session.* / tool.* / approval.* / artifact.* 事件族（AGENTS §3.3）", () => {
    // run 族
    expect(EventTypeSchema.safeParse("run.completed").success).toBe(true)
    expect(EventTypeSchema.safeParse("run.cancelled").success).toBe(true)
    // session 族
    expect(EventTypeSchema.safeParse("session.created").success).toBe(true)
    expect(EventTypeSchema.safeParse("session.expired").success).toBe(true)
    // tool 族
    expect(EventTypeSchema.safeParse("tool.call.failed").success).toBe(true)
    // approval 族
    expect(EventTypeSchema.safeParse("approval.requested").success).toBe(true)
    expect(EventTypeSchema.safeParse("approval.resolved").success).toBe(true)
    // artifact 族
    expect(EventTypeSchema.safeParse("artifact.created").success).toBe(true)
    expect(EventTypeSchema.safeParse("artifact.deleted").success).toBe(true)
    // 非法
    expect(EventTypeSchema.safeParse("run.exploded").success).toBe(false)
  })

  it("ExecutionStatus 枚举校验", () => {
    expect(ExecutionStatusSchema.parse("completed")).toBe("completed")
    expect(ExecutionStatusSchema.safeParse("done").success).toBe(false)
  })

  it("Version 必须为 semver；CONTRACT_VERSION 自身合法", () => {
    expect(VersionSchema.parse(CONTRACT_VERSION)).toBe(CONTRACT_VERSION)
    expect(VersionSchema.safeParse("1.0").success).toBe(false)
    expect(VersionSchema.safeParse("v1.0.0").success).toBe(false)
  })

  it("Timestamp 必须为带偏移的 ISO-8601", () => {
    expect(TimestampSchema.safeParse("2026-06-13T10:00:00Z").success).toBe(true)
    expect(TimestampSchema.safeParse("2026-06-13").success).toBe(false)
    expect(TimestampSchema.safeParse("not-a-date").success).toBe(false)
  })

  it("IdSchema 拒绝空串与纯空白，接受合法 id", () => {
    expect(IdSchema.safeParse("").success).toBe(false)
    expect(IdSchema.safeParse("   ").success).toBe(false)
    expect(IdSchema.safeParse("\t\n").success).toBe(false)
    expect(IdSchema.parse("task_1")).toBe("task_1")
    expect(IdSchema.parse("  foo  ")).toBe("foo") // trim
  })

  it("typedPayload 构造器：必须字段通过、缺字段被拒、额外键宽容", () => {
    const EmailPayload = typedPayload({
      to: z.string().email(),
      subject: z.string(),
    })
    // 合法
    const parsed = EmailPayload.parse({
      to: "a@b.com",
      subject: "hi",
      extra: true,
    })
    expect(parsed.to).toBe("a@b.com")
    expect(parsed.subject).toBe("hi")
    expect(parsed.extra).toBe(true)
    // 缺必须字段被拒
    expect(EmailPayload.safeParse({ to: "a@b.com" }).success).toBe(false)
    // 必须字段类型错误被拒
    expect(
      EmailPayload.safeParse({ to: "not-an-email", subject: "hi" }).success,
    ).toBe(false)
  })

  it("roundTrip：JSON 序列化后 schema 可恢复（undefined 键被丢弃属正常行为）", () => {
    const s = z.object({ a: z.number(), b: z.string().optional() })
    const v = { a: 1 }
    const restored = roundTrip(s, v)
    expect(restored.a).toBe(1)
    expect("b" in restored).toBe(false) // undefined 键被 JSON.stringify 丢弃
  })
})
