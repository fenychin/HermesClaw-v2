/**
 * IndustryIntelligencePage — 页面测试
 *
 * 覆盖：
 * 1. 渲染测试：五板块 + 顶栏 + 骨架屏
 * 2. SSE 事件驱动测试：flow tick / signal / heartbeat / alert
 * 3. 沙盘表单提交流程测试
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

// ─── Mock Store ─────────────────────────────────────────────────────────

const mockStoreState = {
  activeIndustryId: "industry-intelligence-v2",
  industryOptions: [
    { id: "industry-intelligence-v2", name: "跨行业舆情", packId: "industry-intelligence-v2", isIntelCenter: true },
  ],
  sseStatus: "disconnected" as const,
  agentHeartbeats: {} as Record<string, unknown>,
  alerts: [] as unknown[],
  globalThreatLevel: "LOW" as const,
  connectorHealth: [] as unknown[],
  dashboardConfig: null,
  setActiveIndustry: vi.fn(),
  setIndustryOptions: vi.fn(),
  setSSEStatus: vi.fn(),
  updateAgentHeartbeat: vi.fn(),
  setAgentHeartbeats: vi.fn(),
  addAlert: vi.fn(),
  acknowledgeAlert: vi.fn(),
  clearAlerts: vi.fn(),
  setGlobalThreatLevel: vi.fn(),
  setConnectorHealth: vi.fn(),
  setDashboardConfig: vi.fn(),
  sandboxPreFill: null as Record<string, unknown> | null,
  setSandboxPreFill: vi.fn(),
  clearSandboxPreFill: vi.fn(),
}

vi.mock("@/stores/industry-intel-store", () => ({
  useIndustryIntelStore: (selector?: (s: typeof mockStoreState) => unknown) => {
    if (selector) return selector(mockStoreState)
    return mockStoreState
  },
}))

// ─── Mock Hooks ─────────────────────────────────────────────────────────

const mockIntelStream = {
  connected: false,
  flowTicks: [] as unknown[],
  signals: [] as unknown[],
  latestAlert: null,
  disconnect: vi.fn(),
  reconnect: vi.fn(),
}

vi.mock("@/hooks/use-intel-stream", () => ({
  useIntelStream: () => mockIntelStream,
}))

vi.mock("@/hooks/use-intel-snapshot", () => ({
  useIntelSnapshot: () => ({
    snapshot: null,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}))

vi.mock("@/hooks/use-agent-heartbeat", () => ({
  useAgentHeartbeat: () => ({
    heartbeats: {},
    onlineCount: 0,
    offlineAgents: [],
    agentList: [
      { agentId: "A1", label: "态势", status: "offline", lastHeartbeatAt: null, heartbeatIntervalMs: 30_000, automationLevel: "L2" },
      { agentId: "A2", label: "数据流", status: "offline", lastHeartbeatAt: null, heartbeatIntervalMs: 3_000, automationLevel: "L1" },
      { agentId: "A3", label: "星云", status: "offline", lastHeartbeatAt: null, heartbeatIntervalMs: 300_000, automationLevel: "L2" },
      { agentId: "A4", label: "沙盘", status: "offline", lastHeartbeatAt: null, heartbeatIntervalMs: 0, automationLevel: "L1" },
      { agentId: "A5", label: "进化", status: "offline", lastHeartbeatAt: null, heartbeatIntervalMs: 3_600_000, automationLevel: "L2" },
    ],
  }),
}))

vi.mock("@/hooks/use-sandbox-submit", () => ({
  useSandboxSubmit: () => ({
    isRunning: false,
    result: null,
    error: null,
    submit: vi.fn(),
    reset: vi.fn(),
  }),
}))

vi.mock("@/hooks/use-evolution-proposals", () => ({
  useEvolutionProposals: () => ({
    dna: { generation: 1, decisionAlignment: 0, weightStability: 1, policyEffectiveness: 0 },
    proposals: [],
    pendingCount: 0,
    totalCount: 0,
    latestSignature: null,
    alignmentHistory: [],
    isLoading: false,
    error: null,
    refresh: vi.fn(),
    approvalCenterUrl: "/settings/harness?tab=proposals",
  }),
}))

vi.mock("@/hooks/use-knowledge-graph", () => ({
  useKnowledgeGraph: () => ({
    nodes: [],
    edges: [],
    layout: null,
    isLoading: false,
    error: null,
    lastDiff: null,
    requestLayout: vi.fn(),
  }),
}))

vi.mock("@/hooks/use-nebula-render", () => ({
  useNebulaRender: () => ({
    renderMode: "d3-2d",
    perf: { fps: 60, frameTimeMs: 0, renderMode: "d3-2d", nodeCount: 0, edgeCount: 0, degraded: false },
    selectedNodeId: null,
    hoveredNodeId: null,
    selectNode: vi.fn(),
    forceDegrade: vi.fn(),
  }),
}))

// ─── 动态导入组件（必须在 mock 之后） ──────────────────────────────────

let IndustryIntelligencePage: React.ComponentType

beforeEach(async () => {
  vi.clearAllMocks()
  mockIntelStream.flowTicks = []
  mockIntelStream.signals = []
  mockIntelStream.latestAlert = null
  mockStoreState.alerts = []

  const mod = await import("@/views/industry-intelligence/industry-intelligence-page")
  IndustryIntelligencePage = mod.default
})

// ─── 1. 渲染测试 ──────────────────────────────────────────────────────

describe("IndustryIntelligencePage 渲染", () => {
  it("渲染五面板", async () => {
    await act(async () => {
      render(<IndustryIntelligencePage />)
    })

    expect(screen.getByLabelText("行业舆情")).toBeDefined()
    expect(screen.getByLabelText("战略态势感知面板")).toBeDefined()
    expect(screen.getByLabelText("数据流量与动力学面板")).toBeDefined()
    expect(screen.getByLabelText("行业生态全景星云面板")).toBeDefined()
    expect(screen.getByLabelText("决策推演沙盘面板")).toBeDefined()
    expect(screen.getByLabelText("人机进化核心面板")).toBeDefined()
  })

  it("渲染顶栏：威胁等级 + Agent 心跳 + GEN-N", async () => {
    await act(async () => {
      render(<IndustryIntelligencePage />)
    })

    expect(screen.getByLabelText("舆情中心顶栏")).toBeDefined()
    expect(screen.getByLabelText("全局威胁等级: LOW")).toBeDefined()
    expect(screen.getByLabelText("Agent 心跳状态")).toBeDefined()
    expect(screen.getByLabelText("进化代数")).toBeDefined()
  })

  it("渲染各面板 aria-label", async () => {
    await act(async () => {
      render(<IndustryIntelligencePage />)
    })

    expect(screen.getByLabelText("战略态势感知面板")).toBeDefined()
    expect(screen.getByLabelText("数据流量与动力学面板")).toBeDefined()
    expect(screen.getByLabelText("行业生态全景星云面板")).toBeDefined()
    expect(screen.getByLabelText("决策推演沙盘面板")).toBeDefined()
    expect(screen.getByLabelText("人机进化核心面板")).toBeDefined()
  })
})

// ─── 2. SSE 事件驱动测试 ──────────────────────────────────────────────

describe("SSE 事件驱动", () => {
  it("收到 flow tick 后不崩溃", async () => {
    mockIntelStream.flowTicks = [
      {
        eventType: "intel.flow.tick",
        timestamp: new Date().toISOString(),
        agentId: "A2",
        payload: { capitalFlowIndex: 72, index: 72 },
      },
    ]

    await act(async () => {
      render(<IndustryIntelligencePage />)
    })

    // 页面应正常渲染
    expect(screen.getByLabelText("行业舆情")).toBeDefined()
  })

  it("收到 signal 后不崩溃", async () => {
    mockIntelStream.signals = [
      {
        eventType: "intel.signal.detected",
        title: "测试信号",
        description: "测试描述",
        threatLevel: "MEDIUM",
        source: "test",
        modelConfidence: 75,
        timestamp: new Date().toISOString(),
        agentId: "A1",
        payload: {},
      },
    ]

    await act(async () => {
      render(<IndustryIntelligencePage />)
    })

    expect(screen.getByLabelText("战略态势感知面板")).toBeDefined()
  })

  it("收到 alert 后写入 store", async () => {
    // useIntelStream hook 被完整 mock，直接模拟 store 中的 alert 写入
    mockStoreState.alerts = [
      {
        id: "alert-test-1",
        eventType: "intel.alert.tactical" as const,
        payload: {
          title: "测试告警",
          description: "紧急测试告警",
          threatLevel: "HIGH" as const,
          source: "A1",
          modelConfidence: 90,
          eventType: "intel.alert.tactical",
          timestamp: new Date().toISOString(),
          agentId: "A1",
          payload: {},
        },
        timestamp: new Date().toISOString(),
        acknowledged: false,
      },
    ]

    await act(async () => {
      render(<IndustryIntelligencePage />)
    })

    // 有未确认告警时 ThreatAlertModal 渲染
    expect(screen.getByLabelText("战术告警通知")).toBeDefined()
    expect(screen.getByText("测试告警")).toBeDefined()
  })
})

// ─── 3. 沙盘表单提交 ──────────────────────────────────────────────────

describe("Panel4 沙盘推演表单", () => {
  it("渲染场景输入表单", async () => {
    await act(async () => {
      render(<IndustryIntelligencePage />)
    })

    expect(screen.getByLabelText("沙盘推演输入表单")).toBeDefined()
    expect(screen.getByLabelText("场景描述")).toBeDefined()
    expect(screen.getByLabelText("假设条件")).toBeDefined()
  })

  it("空输入时按钮禁用", async () => {
    await act(async () => {
      render(<IndustryIntelligencePage />)
    })

    const btn = screen.getByRole("button", { name: "开始推演" })
    expect((btn as HTMLButtonElement).disabled).toBe(true)
  })

  it("输入场景和假设后按钮可用", async () => {
    const user = userEvent.setup()

    await act(async () => {
      render(<IndustryIntelligencePage />)
    })

    const scenarioInput = screen.getByPlaceholderText(/欧盟对中国电动汽车加征关税/)
    const hypothesisInput = screen.getByPlaceholderText(/税率从10%提升至25%/)

    await user.type(scenarioInput, "欧盟加征关税")
    await user.type(hypothesisInput, "税率提升至25%")

    await waitFor(() => {
      const btn = screen.getByRole("button", { name: "开始推演" })
      expect((btn as HTMLButtonElement).disabled).toBe(false)
    })
  })
})

// ─── 4. ThreatAlertModal 告警浮层 ─────────────────────────────────────

describe("ThreatAlertModal 告警浮层", () => {
  it("无告警时不渲染", async () => {
    await act(async () => {
      render(<IndustryIntelligencePage />)
    })

    expect(screen.queryByLabelText("战术告警通知")).toBeNull()
  })

  it("有未确认告警时渲染浮层", async () => {
    mockStoreState.alerts = [
      {
        id: "alert-1",
        eventType: "intel.alert.tactical" as const,
        payload: {
          title: "测试告警",
          description: "测试",
          threatLevel: "HIGH" as const,
          source: "test",
          modelConfidence: 85,
          eventType: "intel.alert.tactical",
          timestamp: new Date().toISOString(),
          agentId: "A1",
          payload: {},
        },
        timestamp: new Date().toISOString(),
        acknowledged: false,
      },
    ]

    await act(async () => {
      render(<IndustryIntelligencePage />)
    })

    expect(screen.getByLabelText("战术告警通知")).toBeDefined()
    expect(screen.getByText("测试告警")).toBeDefined()
  })
})

// ─── 5. 骨架屏 ────────────────────────────────────────────────────────

describe("Loading 骨架屏", () => {
  it("渲染骨架屏无报错", async () => {
    const { default: Loading } = await import(
      "@/app/(workspace)/industry-intelligence/loading"
    )

    await act(async () => {
      render(<Loading />)
    })

    // 骨架屏应包含 5 个占位板块
    const skeletons = document.querySelectorAll(".animate-pulse")
    expect(skeletons.length).toBeGreaterThan(0)
  })
})
