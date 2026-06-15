/**
 * HarnessBundle 契约测试（CLAUDE.md §2.3 / §7.2 必须版本化的对象）。
 *
 * 测试范围：Bundle 聚合 schema / 七类子对象 schema / 版本兼容。
 */
import { describe, it, expect } from "vitest"
import {
  HarnessBundleSchema,
  WorkflowTemplateSchema,
  AgentPolicySchema,
  SkillBindingSchema,
  ContextPolicySchema,
  MemoryPolicySchema,
  ConnectorPolicySchema,
  EvalRuleSetSchema,
  HARNESS_BUNDLE_VERSION,
} from "../src/harness-bundle"

// ---- 子对象测试 ----

describe("WorkflowTemplate", () => {
  const valid = {
    templateId: "tmpl-001",
    name: "询盘处理工作流",
    description: "自动处理外贸询盘的标准流程",
    nodes: [],
    edges: [],
    version: "1.0.0",
  }

  it("合法 payload 通过", () => {
    expect(() => WorkflowTemplateSchema.parse(valid)).not.toThrow()
  })

  it("缺必备字段被拒", () => {
    expect(() => WorkflowTemplateSchema.parse({})).toThrow()
  })
})

describe("AgentPolicy", () => {
  const valid = {
    policyId: "pol-001",
    agentId: "agent-001",
    canDo: ["邮件分类", "询盘评分"],
    cannotDo: ["删除客户"],
    automationLevel: "L2" as const,
    bindSkills: ["skill-email"],
    bindConnectors: ["connector-imap"],
    memoryPermission: "read-write" as const,
    version: "1.0.0",
  }

  it("合法 payload 通过", () => {
    expect(() => AgentPolicySchema.parse(valid)).not.toThrow()
  })

  it("canDo/cannotDo 缺省为空数组", () => {
    const { canDo, cannotDo, ...rest } = valid
    const parsed = AgentPolicySchema.parse(rest)
    expect(parsed.canDo).toEqual([])
    expect(parsed.cannotDo).toEqual([])
  })
})

describe("SkillBinding", () => {
  const valid = {
    bindingId: "bind-001",
    skillId: "skill-email",
    targetType: "agent" as const,
    targetId: "agent-001",
    version: "1.0.0",
  }

  it("合法 payload 通过", () => {
    expect(() => SkillBindingSchema.parse(valid)).not.toThrow()
  })

  it("非法 targetType 被拒", () => {
    expect(() => SkillBindingSchema.parse({ ...valid, targetType: "unknown" })).toThrow()
  })
})

describe("ContextPolicy", () => {
  const valid = {
    policyId: "ctx-001",
    maxTokens: 200000,
    compressionThreshold: 150000,
    compressionStrategy: "hybrid" as const,
    recentMessageCount: 20,
    version: "1.0.0",
  }

  it("合法 payload 通过", () => {
    expect(() => ContextPolicySchema.parse(valid)).not.toThrow()
  })

  it("缺省值生效", () => {
    const parsed = ContextPolicySchema.parse({ policyId: "ctx-002", version: "1.0.0" })
    expect(parsed.maxTokens).toBe(200000)
    expect(parsed.compressionStrategy).toBe("hybrid")
  })
})

describe("MemoryPolicy", () => {
  const valid = {
    policyId: "mem-001",
    shortTermTtl: 3600,
    midTermTtl: 86400,
    longTermRetention: "forever" as const,
    retrievalStrategy: "hybrid" as const,
    version: "1.0.0",
  }

  it("合法 payload 通过", () => {
    expect(() => MemoryPolicySchema.parse(valid)).not.toThrow()
  })
})

describe("ConnectorPolicy", () => {
  const valid = {
    policyId: "cp-001",
    connectorId: "conn-email",
    allowedScopes: ["read", "send"],
    riskLevel: "medium" as const,
    requiresApproval: true,
    version: "1.0.0",
  }

  it("合法 payload 通过", () => {
    expect(() => ConnectorPolicySchema.parse(valid)).not.toThrow()
  })
})

describe("EvalRuleSet", () => {
  const valid = {
    ruleSetId: "eval-001",
    failureRateThreshold: 0.1,
    evaluationWindowHours: 72,
    minSampleSize: 5,
    connectorSuccessRateFloor: 0.9,
    version: "1.0.0",
  }

  it("合法 payload 通过", () => {
    expect(() => EvalRuleSetSchema.parse(valid)).not.toThrow()
  })

  it("缺省值生效", () => {
    const parsed = EvalRuleSetSchema.parse({ ruleSetId: "eval-002", version: "1.0.0" })
    expect(parsed.failureRateThreshold).toBe(0.1)
    expect(parsed.evaluationWindowHours).toBe(72)
  })
})

// ---- 聚合 Bundle 测试 ----

describe("HarnessBundle（聚合契约）", () => {
  const valid = {
    bundleId: "bundle-001",
    workspaceId: "ws-default",
    version: HARNESS_BUNDLE_VERSION,
    workflowTemplates: [
      { templateId: "tmpl-001", name: "询盘处理", version: "1.0.0" },
    ],
    agentPolicies: [
      {
        policyId: "pol-001",
        agentId: "agent-001",
        automationLevel: "L2",
        memoryPermission: "read",
        version: "1.0.0",
      },
    ],
    skillBindings: [
      {
        bindingId: "bind-001",
        skillId: "skill-email",
        targetType: "agent",
        targetId: "agent-001",
        version: "1.0.0",
      },
    ],
    contextPolicy: {
      policyId: "ctx-001",
      version: "1.0.0",
    },
    memoryPolicy: {
      policyId: "mem-001",
      version: "1.0.0",
    },
    connectorPolicies: [
      {
        policyId: "cp-001",
        connectorId: "conn-email",
        riskLevel: "medium",
        version: "1.0.0",
      },
    ],
    evalRuleSet: {
      ruleSetId: "eval-001",
      version: "1.0.0",
    },
    createdAt: "2026-06-13T12:00:00.000Z",
    updatedAt: "2026-06-13T12:00:00.000Z",
  }

  it("完整 Bundle 通过", () => {
    expect(() => HarnessBundleSchema.parse(valid)).not.toThrow()
  })

  it("最小 Bundle（仅必填字段）通过", () => {
    const minimal = {
      bundleId: "bundle-min",
      workspaceId: "ws-default",
      version: HARNESS_BUNDLE_VERSION,
      createdAt: "2026-06-13T12:00:00.000Z",
      updatedAt: "2026-06-13T12:00:00.000Z",
    }
    expect(() => HarnessBundleSchema.parse(minimal)).not.toThrow()
  })

  it("序列化 round-trip 一致", () => {
    const restored = HarnessBundleSchema.parse(JSON.parse(JSON.stringify(valid)))
    expect(restored.bundleId).toBe("bundle-001")
    expect(restored.workflowTemplates).toHaveLength(1)
    expect(restored.agentPolicies).toHaveLength(1)
  })

  it("缺必备字段被拒", () => {
    expect(() => HarnessBundleSchema.parse({})).toThrow()
  })
})
