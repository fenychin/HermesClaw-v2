/**
 * IndustryIntelSnapshot 单元测试。
 */
import { describe, it, expect } from "vitest"
import { IndustryIntelSnapshotSchema, type IndustryIntelSnapshot } from "../industry-intel-snapshot"

const valid: IndustryIntelSnapshot = {
  snapshotId: "snap_001",
  industryId: "foreign-trade",
  workspaceId: "ws_demo",
  generatedAt: "2026-06-22T10:00:00Z",
  modelConfidence: 94.2,
  evolutionGeneration: 3,
  threatLevel: "MEDIUM",
  radarSection: {
    dimensions: [
      { key: "market-heat", label: "市场热度", value: 72 },
      { key: "competitor-intensity", label: "竞对强度", value: 58 },
    ],
  },
  signalFeed: [
    {
      signalId: "sig_001",
      title: "测试信号",
      description: "",
      source: "",
      threatLevel: "L2",
      confidence: 0.85,
      detectedAt: "2026-06-22T09:45:00Z",
    },
  ],
  systemStatus: "OPERATIONAL",
  version: "1.0.0",
}

describe("IndustryIntelSnapshot", () => {
  it("合法 payload 通过", () => {
    expect(IndustryIntelSnapshotSchema.parse(valid)).toEqual(valid)
  })

  it("序列化 round-trip 一致", () => {
    const restored = IndustryIntelSnapshotSchema.parse(JSON.parse(JSON.stringify(valid)))
    expect(restored).toEqual(valid)
  })

  it("缺 snapshotId 被拒", () => {
    const { snapshotId, ...broken } = valid
    expect(IndustryIntelSnapshotSchema.safeParse(broken).success).toBe(false)
  })

  it("缺 version 被拒", () => {
    const { version, ...broken } = valid
    expect(IndustryIntelSnapshotSchema.safeParse(broken).success).toBe(false)
  })

  it("version 必须为 semver", () => {
    expect(
      IndustryIntelSnapshotSchema.safeParse({ ...valid, version: "1.0" }).success,
    ).toBe(false)
  })

  it("modelConfidence 超出 0-100 被拒", () => {
    expect(
      IndustryIntelSnapshotSchema.safeParse({ ...valid, modelConfidence: 150 }).success,
    ).toBe(false)
    expect(
      IndustryIntelSnapshotSchema.safeParse({ ...valid, modelConfidence: -5 }).success,
    ).toBe(false)
  })

  it("非法 threatLevel 被拒", () => {
    expect(
      IndustryIntelSnapshotSchema.safeParse({ ...valid, threatLevel: "UNKNOWN" }).success,
    ).toBe(false)
  })

  it("非法 systemStatus 被拒", () => {
    expect(
      IndustryIntelSnapshotSchema.safeParse({ ...valid, systemStatus: "BROKEN" }).success,
    ).toBe(false)
  })

  it("radarSection.dimensions 为空数组被拒", () => {
    const broken = { ...valid, radarSection: { dimensions: [] } }
    expect(IndustryIntelSnapshotSchema.safeParse(broken).success).toBe(false)
  })

  it("radarDimension.value 超出 0-100 被拒", () => {
    const broken = {
      ...valid,
      radarSection: {
        dimensions: [{ key: "test", label: "测试", value: 150 }],
      },
    }
    expect(IndustryIntelSnapshotSchema.safeParse(broken).success).toBe(false)
  })

  it("signalItem.confidence 超出 0-1 被拒", () => {
    const broken = {
      ...valid,
      signalFeed: [{ ...valid.signalFeed[0], confidence: 1.5 }],
    }
    expect(IndustryIntelSnapshotSchema.safeParse(broken).success).toBe(false)
  })

  it("signalFeed 超过 50 条被拒", () => {
    const manySignals = Array.from({ length: 51 }, (_, i) => ({
      signalId: `sig_${i}`,
      title: `信号${i}`,
      threatLevel: "L1" as const,
      confidence: 0.5,
      detectedAt: "2026-06-22T10:00:00Z",
    }))
    expect(
      IndustryIntelSnapshotSchema.safeParse({ ...valid, signalFeed: manySignals }).success,
    ).toBe(false)
  })

  it("evolutionGeneration 为负被拒", () => {
    expect(
      IndustryIntelSnapshotSchema.safeParse({ ...valid, evolutionGeneration: -1 }).success,
    ).toBe(false)
  })
})
