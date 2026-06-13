import { describe, it, expect } from "vitest"
import { ConnectorLeaseSchema, type ConnectorLease } from "./connector-lease"
import { CONTRACT_VERSION } from "./shared"

const valid: ConnectorLease = {
  leaseId: "lease_1",
  taskId: "task_1",
  workspaceId: "ws_1",
  connectorId: "conn_email",
  runtimeId: "runtime_1",
  grantedAt: "2026-06-13T10:00:00Z",
  expiresAt: "2026-06-13T11:00:00Z",
  scope: ["send"],
  maxRiskLevel: "medium",
  status: "active",
  version: CONTRACT_VERSION,
}

describe("ConnectorLease（连接器使用租约）", () => {
  it("合法 payload 通过", () => {
    expect(ConnectorLeaseSchema.parse(valid)).toEqual(valid)
  })

  it("序列化 round-trip 一致", () => {
    const restored = ConnectorLeaseSchema.parse(
      JSON.parse(JSON.stringify(valid)),
    )
    expect(restored).toEqual(valid)
  })

  it("scope 不能为空数组", () => {
    expect(ConnectorLeaseSchema.safeParse({ ...valid, scope: [] }).success).toBe(
      false,
    )
  })

  it("缺必备字段被拒", () => {
    for (const key of [
      "leaseId",
      "taskId",
      "workspaceId",
      "connectorId",
      "runtimeId",
      "grantedAt",
      "expiresAt",
      "scope",
      "maxRiskLevel",
      "status",
      "version",
    ] as const) {
      const broken = { ...valid }
      delete (broken as Record<string, unknown>)[key]
      expect(ConnectorLeaseSchema.safeParse(broken).success, `缺 ${key}`).toBe(
        false,
      )
    }
  })

  it("非法 status / 时间戳 / version 被拒", () => {
    expect(
      ConnectorLeaseSchema.safeParse({ ...valid, status: "paused" }).success,
    ).toBe(false)
    expect(
      ConnectorLeaseSchema.safeParse({ ...valid, expiresAt: "soon" }).success,
    ).toBe(false)
    expect(
      ConnectorLeaseSchema.safeParse({ ...valid, version: "1.0" }).success,
    ).toBe(false)
  })
})
