import { describe, it, expect } from "vitest"
import {
  AutomationLevelSchema,
  RiskLevelSchema,
  EventTypeSchema,
  ExecutionStatusSchema,
  VersionSchema,
  TimestampSchema,
  CONTRACT_VERSION,
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

  it("EventType 覆盖 run.* / session.* / tool.* 事件族（AGENTS §3.3）", () => {
    expect(EventTypeSchema.safeParse("run.completed").success).toBe(true)
    expect(EventTypeSchema.safeParse("session.created").success).toBe(true)
    expect(EventTypeSchema.safeParse("tool.call.failed").success).toBe(true)
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
})
