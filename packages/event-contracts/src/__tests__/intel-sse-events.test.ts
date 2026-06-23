/**
 * Intel SSE 事件单元测试 + discriminatedUnion 分发测试。
 */
import { describe, it, expect } from "vitest"
import {
  IntelSSEEventSchema,
  IntelFlowTickSchema,
  IntelSignalDetectedSchema,
  IntelTopologyUpdatedSchema,
  IntelAlertTacticalSchema,
  IntelEvolutionProposalCreatedSchema,
  IntelAgentHeartbeatSchema,
  type IntelFlowTick,
  type IntelSignalDetected,
  type IntelTopologyUpdated,
  type IntelAlertTactical,
  type IntelEvolutionProposalCreated,
  type IntelAgentHeartbeat,
} from "../intel-sse-events"

// ─── intel.flow.tick ──────────────────────────────────────────────────

const validFlowTick: IntelFlowTick = {
  eventType: "intel.flow.tick",
  timestamp: "2026-06-22T10:00:03Z",
  capitalFlowIndex: 72.5,
  volumeIndex: 68.3,
  version: "1.0.0",
}

describe("IntelFlowTick", () => {
  it("合法 payload 通过", () => {
    expect(IntelFlowTickSchema.parse(validFlowTick)).toEqual(validFlowTick)
  })

  it("capitalFlowIndex 超出 0-100 被拒", () => {
    expect(IntelFlowTickSchema.safeParse({ ...validFlowTick, capitalFlowIndex: 150 }).success).toBe(false)
  })

  it("volumeIndex 超出 0-100 被拒", () => {
    expect(IntelFlowTickSchema.safeParse({ ...validFlowTick, volumeIndex: -5 }).success).toBe(false)
  })
})

// ─── intel.signal.detected ────────────────────────────────────────────

const validSignalDetected: IntelSignalDetected = {
  eventType: "intel.signal.detected",
  signalId: "sig_001",
  title: "检测到竞对降价",
  threatLevel: "L2",
  confidence: 0.85,
  detectedAt: "2026-06-22T09:58:00Z",
  version: "1.0.0",
}

describe("IntelSignalDetected", () => {
  it("合法 payload 通过", () => {
    expect(IntelSignalDetectedSchema.parse(validSignalDetected)).toEqual(validSignalDetected)
  })

  it("非法 threatLevel 被拒", () => {
    expect(IntelSignalDetectedSchema.safeParse({ ...validSignalDetected, threatLevel: "L4" }).success).toBe(false)
  })

  it("confidence 超出 0-1 被拒", () => {
    expect(IntelSignalDetectedSchema.safeParse({ ...validSignalDetected, confidence: 1.2 }).success).toBe(false)
  })
})

// ─── intel.topology.updated ───────────────────────────────────────────

const validTopologyUpdated: IntelTopologyUpdated = {
  eventType: "intel.topology.updated",
  added: [{ id: "node_1", label: "新节点", category: "company" }],
  removed: [],
  updated: [],
  timestamp: "2026-06-22T10:05:00Z",
  version: "1.0.0",
}

describe("IntelTopologyUpdated", () => {
  it("合法 payload 通过", () => {
    expect(IntelTopologyUpdatedSchema.parse(validTopologyUpdated)).toEqual(validTopologyUpdated)
  })

  it("added/removed/updated 默认为空数组", () => {
    const { added, removed, updated, ...rest } = validTopologyUpdated
    const parsed = IntelTopologyUpdatedSchema.parse(rest)
    expect(parsed.added).toEqual([])
    expect(parsed.removed).toEqual([])
    expect(parsed.updated).toEqual([])
  })
})

// ─── intel.alert.tactical ─────────────────────────────────────────────

const validAlert: IntelAlertTactical = {
  eventType: "intel.alert.tactical",
  alertId: "alert_001",
  title: "CRITICAL 告警",
  description: "",
  threatLevel: "CRITICAL",
  triggeredAt: "2026-06-22T10:02:00Z",
  linkedSignalIds: [],
  version: "1.0.0",
}

describe("IntelAlertTactical", () => {
  it("合法 payload 通过（最小字段）", () => {
    expect(IntelAlertTacticalSchema.parse(validAlert)).toEqual(validAlert)
  })

  it("threatLevel 只允许 HIGH/CRITICAL", () => {
    expect(IntelAlertTacticalSchema.safeParse({ ...validAlert, threatLevel: "LOW" }).success).toBe(false)
    expect(IntelAlertTacticalSchema.safeParse({ ...validAlert, threatLevel: "MEDIUM" }).success).toBe(false)
  })
})

// ─── intel.evolution.proposal-created ─────────────────────────────────

const validEvolutionProposal: IntelEvolutionProposalCreated = {
  eventType: "intel.evolution.proposal-created",
  proposalId: "prop_001",
  proposalType: "AgentPolicy",
  confidence: 0.78,
  createdAt: "2026-06-22T11:00:00Z",
  version: "1.0.0",
}

describe("IntelEvolutionProposalCreated", () => {
  it("合法 payload 通过", () => {
    expect(IntelEvolutionProposalCreatedSchema.parse(validEvolutionProposal)).toEqual(validEvolutionProposal)
  })

  it("非法 proposalType 被拒", () => {
    expect(
      IntelEvolutionProposalCreatedSchema.safeParse({ ...validEvolutionProposal, proposalType: "InvalidType" }).success,
    ).toBe(false)
  })
})

// ─── intel.agent.heartbeat ────────────────────────────────────────────

const validHeartbeat: IntelAgentHeartbeat = {
  eventType: "intel.agent.heartbeat",
  agentId: "A1",
  status: "running",
  heartbeatAt: "2026-06-22T10:00:00Z",
  version: "1.0.0",
}

describe("IntelAgentHeartbeat", () => {
  it("合法 payload 通过", () => {
    expect(IntelAgentHeartbeatSchema.parse(validHeartbeat)).toEqual(validHeartbeat)
  })

  it("agentId 只允许 A1-A5", () => {
    expect(IntelAgentHeartbeatSchema.safeParse({ ...validHeartbeat, agentId: "A6" }).success).toBe(false)
  })

  it("非法 status 被拒", () => {
    expect(IntelAgentHeartbeatSchema.safeParse({ ...validHeartbeat, status: "crashed" }).success).toBe(false)
  })
})

// ─── IntelSSEEvent discriminatedUnion 分发测试 ─────────────────────────

describe("IntelSSEEvent discriminatedUnion", () => {
  it("所有 6 种事件类型均通过 union 解析", () => {
    const events = [
      validFlowTick,
      validSignalDetected,
      validTopologyUpdated,
      validAlert,
      validEvolutionProposal,
      validHeartbeat,
    ]
    for (const evt of events) {
      const parsed = IntelSSEEventSchema.parse(evt)
      expect(parsed.eventType).toBe(evt.eventType)
    }
  })

  it("JSON round-trip 后 discriminatedUnion 仍正确解析", () => {
    for (const evt of [validFlowTick, validSignalDetected, validAlert, validHeartbeat]) {
      const json = JSON.stringify(evt)
      const restored = IntelSSEEventSchema.parse(JSON.parse(json))
      expect(restored.eventType).toBe(evt.eventType)
    }
  })

  it("未知 eventType 被拒", () => {
    expect(
      IntelSSEEventSchema.safeParse({ eventType: "intel.unknown", foo: "bar" }).success,
    ).toBe(false)
  })

  it("所有事件 version 为 semver", () => {
    const events = [
      validFlowTick,
      validSignalDetected,
      validTopologyUpdated,
      validAlert,
      validEvolutionProposal,
      validHeartbeat,
    ]
    for (const evt of events) {
      expect(evt.version).toMatch(/^\d+\.\d+\.\d+$/)
    }
  })
})
