// @vitest-environment node
/**
 * bundle-snapshot 单元测试 —— 对 prisma 做 mock 验证：
 * - createBundleSnapshot：写入 HarnessBundleSnapshot + 更新 bundle.currentSnapshotId
 * - rollbackBundleToSnapshot：
 *   · 无快照 bundle → NoSnapshotAvailableError（HTTP 422）
 *   · 指定 snapshotId 不存在/跨 bundle → SnapshotNotFoundError
 *   · DRAFT bundle 调 rollback → InvalidTransitionError（HTTP 409）
 *   · CANARY bundle 正常路径 → 写回 7 件套 + status=ROLLED_BACK
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// vi.mock 工厂被 hoist 到文件最顶端，闭包外变量需要用 vi.hoisted 显式提升
const mocks = vi.hoisted(() => {
  type AnyFn = (...args: unknown[]) => unknown
  const m: {
    harnessBundle: { findUnique: AnyFn; update: AnyFn }
    harnessBundleSnapshot: { create: AnyFn; findUnique: AnyFn; findFirst: AnyFn }
    $transaction: AnyFn
  } = {
    harnessBundle: {
      findUnique: () => undefined,
      update: () => undefined,
    },
    harnessBundleSnapshot: {
      create: () => undefined,
      findUnique: () => undefined,
      findFirst: () => undefined,
    },
    $transaction: async () => undefined,
  }
  return m
})

// 事务回调：直接传入 mocks 自身作为 tx client
mocks.$transaction = vi.fn(async (cb: unknown) => {
  if (typeof cb === "function") {
    return (cb as (tx: typeof mocks) => Promise<unknown>)(mocks)
  }
  return undefined
})

vi.mock("@/lib/prisma", () => ({
  prisma: mocks,
}))

// Prisma.JsonNull 哨兵值——只取静态属性，不需要真实 client
vi.mock("@/generated/prisma-v2/client", () => ({
  Prisma: { JsonNull: { _kind: "JsonNull" } as unknown },
}))

import {
  createBundleSnapshot,
  rollbackBundleToSnapshot,
  NoSnapshotAvailableError,
  SnapshotNotFoundError,
} from "../bundle-snapshot"
import { InvalidTransitionError } from "../bundle-state-machine"

// ── 辅助 ──
function makeBundle(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    bundleId: "bundle-1",
    workspaceId: "ws-1",
    status: "CANARY",
    version: "1.0.0",
    agentPolicies: [{ policyId: "p1" }],
    workflowTemplates: null,
    skillBindings: null,
    contextPolicy: null,
    memoryPolicy: null,
    connectorPolicies: null,
    guardrailPolicy: null,
    evalRuleSet: null,
    industryBinding: null,
    canaryPercent: 10,
    canaryStartedAt: new Date("2026-06-15T00:00:00Z"),
    canaryEndsAt: new Date("2026-06-16T00:00:00Z"),
    ...overrides,
  }
}

beforeEach(() => {
  // 每个用例都用 vi.fn().mockResolvedValue(...) 重新覆盖具体方法，
  // 这里只清空 $transaction 的调用记录即可。
  ;(mocks.$transaction as ReturnType<typeof vi.fn>).mockClear()
})

describe("createBundleSnapshot", () => {
  it("写入快照并把 currentSnapshotId 指向新快照", async () => {
    mocks.harnessBundle.findUnique = vi.fn().mockResolvedValue(makeBundle())
    mocks.harnessBundleSnapshot.create = vi.fn().mockResolvedValue({
      snapshotId: "snap-1",
    })
    mocks.harnessBundle.update = vi.fn().mockResolvedValue({})

    const result = await createBundleSnapshot(
      "bundle-1",
      "alice@example.com",
      "pre-canary",
    )

    expect(result.snapshotId).toBe("snap-1")
    expect(mocks.harnessBundleSnapshot.create).toHaveBeenCalledOnce()
    const createCall = (
      mocks.harnessBundleSnapshot.create as ReturnType<typeof vi.fn>
    ).mock.calls[0][0]
    expect(createCall.data.bundleId).toBe("bundle-1")
    expect(createCall.data.reason).toBe("pre-canary")
    expect(createCall.data.createdBy).toBe("alice@example.com")
    expect(createCall.data.version).toBe("1.0.0")
    // content 是深度快照，应包含 7 件套 + canary 配置
    expect(createCall.data.content.agentPolicies).toEqual([{ policyId: "p1" }])
    expect(createCall.data.content.canaryPercent).toBe(10)

    // bundle.currentSnapshotId 已更新
    expect(mocks.harnessBundle.update).toHaveBeenCalledWith({
      where: { bundleId: "bundle-1" },
      data: { currentSnapshotId: "snap-1" },
    })
  })

  it("bundle 不存在时抛 HARNESS_BUNDLE_NOT_FOUND", async () => {
    mocks.harnessBundle.findUnique = vi.fn().mockResolvedValue(null)
    await expect(
      createBundleSnapshot("missing", "actor", "manual"),
    ).rejects.toThrow(/HARNESS_BUNDLE_NOT_FOUND/)
  })
})

describe("rollbackBundleToSnapshot", () => {
  it("无任何快照时抛 NoSnapshotAvailableError", async () => {
    mocks.harnessBundle.findUnique = vi.fn().mockResolvedValue(makeBundle())
    mocks.harnessBundleSnapshot.findFirst = vi.fn().mockResolvedValue(null)

    await expect(
      rollbackBundleToSnapshot("bundle-1", "alice", {}),
    ).rejects.toBeInstanceOf(NoSnapshotAvailableError)
  })

  it("指定的 snapshotId 不存在时抛 SnapshotNotFoundError", async () => {
    mocks.harnessBundle.findUnique = vi.fn().mockResolvedValue(makeBundle())
    mocks.harnessBundleSnapshot.findUnique = vi.fn().mockResolvedValue(null)

    await expect(
      rollbackBundleToSnapshot("bundle-1", "alice", { snapshotId: "snap-x" }),
    ).rejects.toBeInstanceOf(SnapshotNotFoundError)
  })

  it("跨 bundle 的 snapshot 视为未找到（防误回滚）", async () => {
    mocks.harnessBundle.findUnique = vi.fn().mockResolvedValue(makeBundle())
    mocks.harnessBundleSnapshot.findUnique = vi.fn().mockResolvedValue({
      snapshotId: "snap-x",
      bundleId: "other-bundle",
      version: "1.0.0",
      content: {},
    })

    await expect(
      rollbackBundleToSnapshot("bundle-1", "alice", { snapshotId: "snap-x" }),
    ).rejects.toBeInstanceOf(SnapshotNotFoundError)
  })

  it("DRAFT bundle 调用 rollback → InvalidTransitionError（DRAFT→ROLLED_BACK 非法）", async () => {
    mocks.harnessBundle.findUnique = vi
      .fn()
      .mockResolvedValue(makeBundle({ status: "DRAFT" }))
    mocks.harnessBundleSnapshot.findFirst = vi.fn().mockResolvedValue({
      snapshotId: "snap-1",
      bundleId: "bundle-1",
      version: "1.0.0",
      content: {
        version: "1.0.0",
        agentPolicies: null,
        workflowTemplates: null,
        skillBindings: null,
        contextPolicy: null,
        memoryPolicy: null,
        connectorPolicies: null,
        guardrailPolicy: null,
        evalRuleSet: null,
        industryBinding: null,
        canaryPercent: 0,
        canaryStartedAt: null,
        canaryEndsAt: null,
      },
    })

    await expect(
      rollbackBundleToSnapshot("bundle-1", "alice", {}),
    ).rejects.toBeInstanceOf(InvalidTransitionError)
  })

  it("CANARY bundle 正常路径：写回快照内容并将 status 置为 ROLLED_BACK", async () => {
    mocks.harnessBundle.findUnique = vi.fn().mockResolvedValue(makeBundle())
    mocks.harnessBundleSnapshot.findFirst = vi.fn().mockResolvedValue({
      snapshotId: "snap-old",
      bundleId: "bundle-1",
      version: "0.9.0",
      content: {
        version: "0.9.0",
        agentPolicies: [{ policyId: "old-p" }],
        workflowTemplates: null,
        skillBindings: null,
        contextPolicy: null,
        memoryPolicy: null,
        connectorPolicies: null,
        guardrailPolicy: null,
        evalRuleSet: null,
        industryBinding: null,
        canaryPercent: 5,
        canaryStartedAt: null,
        canaryEndsAt: null,
      },
    })
    mocks.harnessBundle.update = vi.fn().mockResolvedValue({})

    const result = await rollbackBundleToSnapshot("bundle-1", "alice", {})

    expect(result).toEqual({
      snapshotId: "snap-old",
      restoredVersion: "0.9.0",
    })
    expect(mocks.harnessBundle.update).toHaveBeenCalledOnce()
    const updateCall = (
      mocks.harnessBundle.update as ReturnType<typeof vi.fn>
    ).mock.calls[0][0]
    expect(updateCall.where).toEqual({ bundleId: "bundle-1" })
    expect(updateCall.data.status).toBe("ROLLED_BACK")
    expect(updateCall.data.canaryPercent).toBe(0)
    expect(updateCall.data.canaryStartedAt).toBeNull()
    expect(updateCall.data.canaryEndsAt).toBeNull()
    // 7 件套从快照恢复
    expect(updateCall.data.agentPolicies).toEqual([{ policyId: "old-p" }])
  })
})
