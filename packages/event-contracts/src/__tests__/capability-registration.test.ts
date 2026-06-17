import { describe, it, expect } from "vitest"
import {
  CapabilityRegistrationSchema,
  type CapabilityRegistration,
} from "../capability-registration"

const valid: CapabilityRegistration = {
  capabilityId: "cap_email",
  runtimeId: "runtime_1",
  displayName: "Email Connector",
  version: "1.0.0",
  workspaceId: "workspace_1",
  type: "connector",
  capabilityType: "connector",
  name: "email-connector",
}

describe("CapabilityRegistration（能力注册 AGENTS §2.2）", () => {
  it("合法 payload 通过", () => {
    expect(CapabilityRegistrationSchema.parse(valid)).toEqual(valid)
  })

  it("displayName 与 type 可选", () => {
    const minimal = { ...valid }
    delete (minimal as Record<string, unknown>).displayName
    delete (minimal as Record<string, unknown>).type
    const parsed = CapabilityRegistrationSchema.parse(minimal)
    expect(parsed.displayName).toBeUndefined()
    expect(parsed.type).toBeUndefined()
  })

  it("序列化 round-trip 一致", () => {
    const restored = CapabilityRegistrationSchema.parse(
      JSON.parse(JSON.stringify(valid)),
    )
    expect(restored).toEqual(valid)
  })

  it("缺必备字段被拒", () => {
    for (const key of [
      "capabilityId",
      "version",
      "workspaceId",
    ] as const) {
      const broken = { ...valid }
      delete (broken as Record<string, unknown>)[key]
      expect(
        CapabilityRegistrationSchema.safeParse(broken).success,
        `缺 ${key}`,
      ).toBe(false)
    }
  })

  it("非法 type / capabilityType 被拒", () => {
    expect(
      CapabilityRegistrationSchema.safeParse({ ...valid, type: "invalid-type" })
        .success,
    ).toBe(false)
  })
})
