import { describe, it, expect } from "vitest"
import {
  CapabilityRegistrationSchema,
  type CapabilityRegistration,
} from "./capability-registration"
import { CONTRACT_VERSION } from "./shared"

const valid: CapabilityRegistration = {
  capabilityId: "cap_email",
  runtimeId: "runtime_1",
  displayName: "Email Connector",
  actionTypes: ["email.send", "email.read"],
  connectorIds: ["conn_email"],
  maxRiskLevel: "high",
  compatibleHermesApi: "1.0.0",
  version: CONTRACT_VERSION,
}

describe("CapabilityRegistration（能力注册 AGENTS §2.2）", () => {
  it("合法 payload 通过", () => {
    expect(CapabilityRegistrationSchema.parse(valid)).toEqual(valid)
  })

  it("connectorIds 缺省为空数组；displayName 可选", () => {
    const minimal = { ...valid }
    delete (minimal as Record<string, unknown>).connectorIds
    delete (minimal as Record<string, unknown>).displayName
    const parsed = CapabilityRegistrationSchema.parse(minimal)
    expect(parsed.connectorIds).toEqual([])
  })

  it("序列化 round-trip 一致", () => {
    const restored = CapabilityRegistrationSchema.parse(
      JSON.parse(JSON.stringify(valid)),
    )
    expect(restored).toEqual(valid)
  })

  it("actionTypes 不能为空数组", () => {
    expect(
      CapabilityRegistrationSchema.safeParse({ ...valid, actionTypes: [] })
        .success,
    ).toBe(false)
  })

  it("缺必备字段被拒", () => {
    for (const key of [
      "capabilityId",
      "runtimeId",
      "actionTypes",
      "maxRiskLevel",
      "compatibleHermesApi",
      "version",
    ] as const) {
      const broken = { ...valid }
      delete (broken as Record<string, unknown>)[key]
      expect(
        CapabilityRegistrationSchema.safeParse(broken).success,
        `缺 ${key}`,
      ).toBe(false)
    }
  })

  it("非法 maxRiskLevel / version 被拒", () => {
    expect(
      CapabilityRegistrationSchema.safeParse({ ...valid, maxRiskLevel: "x" })
        .success,
    ).toBe(false)
    expect(
      CapabilityRegistrationSchema.safeParse({
        ...valid,
        compatibleHermesApi: "1.x",
      }).success,
    ).toBe(false)
  })
})
