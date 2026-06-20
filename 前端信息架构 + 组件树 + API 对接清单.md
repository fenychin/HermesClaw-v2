# HermesClaw 行业情报中心 v2.0
## 前端信息架构 + 组件树 + API 对接清单
### 版本：v2.0.0 | 日期：2026-06-18

> 适用范围：apps/web/src/views/industry-intelligence/
> apps/web 不含业务规则，只作视图层与 API 调用方（遵循 CLAUDE.md §3）

---

## 第一章：信息架构（IA）

### 1.1 页面层级

/industry-intelligence                 ← 路由入口
  /industry-intelligence/:industryId   ← 具体行业视图
    ?panel=sandbox                     ← 深链接到板块4
    ?panel=evolution                   ← 深链接到板块5
    ?alert=:alertId                    ← 从告警跳入并高亮板块

### 1.2 全局顶栏结构

┌─────────────────────────────────────────────────────────────────┐
│  [系统状态: OPERATIONAL]  [AI置信度: 94.2%]                        │
│  【行业特种作战情报中心 v2.0】                                       │
│  [●A1 ●A2 ●A3 ●A4 ●A5]  [GEN-N]  [行业切换下拉]                   │
└─────────────────────────────────────────────────────────────────┘

### 1.3 五栏布局比例

> 1440px+
┌──────┬──────┬────────────┬──────┬──────┐
│ 16%  │ 20%  │    28%     │ 20%  │ 16%  │
│ P1   │ P2   │    P3      │ P4   │ P5   │
│战略  │数据流│  星云核心  │推演  │进化  │
│态势  │动力学│            │沙盘  │核心  │
└──────┴──────┴────────────┴──────┴──────┘

1280-1440px：P1+P2 合并左侧，P4+P5 合并右侧
< 1280px：单列垂直排列，各板块独立卡片

---

## 第二章：组件树

### 2.0 顶层结构

<IndustryIntelligencePage>
  <IntelTopBar />
  <IntelLayoutGrid>
    <Panel1StrategicAwareness />
    <Panel2DataFlux />
    <Panel3NebulaCoreMap />
    <Panel4SimulationSandbox />
    <Panel5EvolutionCore />
  </IntelLayoutGrid>
  <ThreatAlertModal />       ← 全局告警弹窗（覆盖层）
  <CommandTicker />          ← 底部即时反馈流水线
</IndustryIntelligencePage>

---

### 2.1 IntelTopBar

<IntelTopBar>
  <SystemStatusChip status={systemStatus} />
  <ModelConfidenceChip value={modelConfidence} />
  <PageTitle>行业特种作战情报中心 v2.0</PageTitle>
  <AgentHeartbeatRow>
    <AgentDot agentId="A1" label="态势" />
    <AgentDot agentId="A2" label="数据流" />
    <AgentDot agentId="A3" label="星云" />
    <AgentDot agentId="A4" label="沙盘" />
    <AgentDot agentId="A5" label="进化" />
  </AgentHeartbeatRow>
  <EvolutionGenBadge generation={evolutionGen} />
  <IndustrySelector industries={packs} />
</IntelTopBar>

数据来源：
  GET /api/v1/industry/kpi-snapshot
    → modelConfidence, evolutionGeneration, systemStatus
  SSE intel.agent.heartbeat → AgentDot 在线状态实时更新

---

### 2.2 Panel1StrategicAwareness（战略态势感知 / A1）

<Panel1StrategicAwareness>
  <PanelHeader title="战略态势感知" agent="A1" heartbeatInterval="30s" />

  <RadarCanvas
    dimensions={radarDimensions}     ← IndustryIntelSnapshot.radarSection
    animated={true} />
    规格：HTML5 Canvas + requestAnimationFrame 极坐标绘制
          30s SWR 刷新 + SSE diff 增量

  <PolicyHeatWordMatrix
    words={signalWords}              ← signalFeed 解析
    onWordClick={handleWordDrill} />
    规格：D3 词云布局，字体大小=confidence，颜色=threatLevel
          点击词 → 弹出政策原文摘要 Modal

  <TacticalEventFeed
    events={signalFeed}
    onEscalateToSandbox={handleEscalate} />
    规格：react-virtual 虚拟滚动，最多 50 条
          L1=蓝 L2=橙 L3=红
          点击事件 → 侧滑证据链 Drawer
          一键升级 → 跳转板块4并预填输入

  <ThreatLevelBar level={threatLevel} />

</Panel1StrategicAwareness>

---

### 2.3 Panel2DataFlux（数据流量与动力学 / A2）

<Panel2DataFlux>
  <PanelHeader title="数据流量与动力学" agent="A2" heartbeatInterval="3s" />

  <CapitalFlowCurve
    data={capitalFlowBuffer}         ← SSE intel.flow.tick 本地缓冲 300 条
    animated={true} />
    规格：Chart.js Line + requestAnimationFrame 节流，最高 30fps
          circular buffer 保留约 15min 历史

  <MarketTrendMultiCurve
    tracks={trendTracks}             ← 价格指数/成交量/搜索热度
    zoomable={true} />
    规格：Chart.js 多数据集折线
          双指缩放（移动端）/ 滚轮缩放（桌面端）

  <CompetitorActivityChart
    competitors={competitorData}     ← IndustryIntelSnapshot 批次数据
    refreshInterval={30000} />
    规格：Chart.js 横向条形，30s SWR 刷新

  <DataSourceHealthRow
    sources={dataSources} />         ← GET /api/v1/runtime/connector-health
    规格：绿/黄/红状态点 + 延迟数字，10s 轮询

</Panel2DataFlux>

---

### 2.4 Panel3NebulaCoreMap（行业生态星云 / A3）

<Panel3NebulaCoreMap>
  <PanelHeader title="行业生态全景星云" agent="A3" heartbeatInterval="5min" />

  <NebulaCoreCanvas
    renderMode={renderMode}          ← "3d" | "2d-fallback"
    onNodeHover={handleNodeHover}
    onNodeClick={handleNodeClick}>

    <ThreeJsForceGraph               ← 桌面默认
      nodes={graphNodes}
      edges={graphEdges}
      layout="force-3d"
      rotationSpeed={0.002}
      onDeltaUpdate={applyDelta} />  ← SSE 差量更新，不重绘全图

    <D3ForceFallback                 ← 移动/低配自动降级
      nodes={graphNodes}
      edges={graphEdges}
      layout="force-2d" />

  </NebulaCoreCanvas>

  <NodeDetailPopover
    node={hoveredNode}
    recentEvents={nodeEvents} />     ← 节点关联 ExecutionEvent 摘要

  <GraphLegend categories={nodeCategories} />
  <GraphFilterBar onFilter={handleFilter} />

</Panel3NebulaCoreMap>

性能规范：
  初始化：GET /api/v1/industry/knowledge-graph（最大 500 节点）
  增量：SSE intel.topology.updated（只处理 diff）
  Three.js 目标：60fps 桌面，30fps 移动，< 30fps 自动降级 D3
  Web Worker：图谱布局计算放入 Worker，不阻塞主线程

---

### 2.5 Panel4SimulationSandbox（决策推演沙盘 / A4）

<Panel4SimulationSandbox>
  <PanelHeader title="决策推演沙盘" agent="A4" heartbeatInterval="按需" />

  <ScenarioInputForm
    onSubmit={handleSandboxSubmit}   ← POST /api/v1/sandbox/submit
    automationLevelFixed="L1"        ← 前端硬锁 L1，不可修改
    disclaimerLabel="AI 建议 / 仅供参考" />
    字段：hypothesisLabel + scenarioInput(键值对编辑器) + timeWindow

  <SandboxProgressTracker
    runId={activeRunId}
    events={sandboxRunEvents}        ← SSE run.started / run.progress / run.completed
    onComplete={handleSandboxDone} />

  <PredictionPathChart
    paths={predictionPaths}          ← 路径A/B/C + 胜率
    highlightBestPath={true} />
    规格：Chart.js 3 条折线，不同颜色+线型
          悬浮高亮单条，其他路径置灰
          右端显示胜率 Badge

  <ScenarioResultCard
    result={scenarioResult}
    winRates={pathWinRates}
    recommendations={actionRecs}
    onApprove={() => navigate('/approval-center')} />
    注意：所有建议标注「AI 建议 / 仅供参考」
          审批动作必须跳转审批中心，不在此页完成

  <SimulationHistoryList
    history={sandboxHistory}
    limit={10} />

</Panel4SimulationSandbox>

---

### 2.6 Panel5EvolutionCore（人机进化核心 / A5）

<Panel5EvolutionCore>
  <PanelHeader title="人机进化核心" agent="A5" heartbeatInterval="1hr" />

  <EvolutionDnaViz
    generation={evolutionGen}        ← IndustryIntelSnapshot.evolutionGeneration
    proposalCount={draftCount} />    ← 待审批数量影响动画强度

  <DecisionAlignmentChart
    data={alignmentHistory}          ← EvaluationReport 近 30 次 WorkflowRun
    target={0.85} />                 ← 85% 目标线

  <ModelWeightAdjustmentLog
    logs={weightLogs}                ← EvolutionProposalView[].deltaDescription
    limit={5} />

  <ProposalPendingBadge
    count={draftProposals.length}
    onClick={() => navigate('/approval-center')} />

  <EvolutionProposalList
    proposals={recentProposals}
    onViewDetail={handleViewProposal}
    onApprove={() => navigate('/approval-center')} />
    注意：不在此页完成审批，必须跳转审批中心

  <CommandAuthorizationFooter
    lastApprover={lastApprover}      ← AuditLog 最近 proposal.approve 真实审批人
    approvedAt={lastApprovedAt}
    onSign={() => navigate('/approval-center')} />

</Panel5EvolutionCore>

---

### 2.7 全局浮层

<ThreatAlertModal>
  触发：SSE intel.alert.tactical
  内容：告警标题 + 描述 + 影响分析 + 战术建议
  操作：[忽略] [记录] [升级到沙盘推演]
  动效：从顶部滑入，红色边框 + 扫描线动画

<CommandTicker>
  位置：页面底部固定栏（32px 高）
  内容：intel.flow.tick + intel.signal.detected 文本
  动效：从右向左滚动，新消息从右侧进入
  点击：单条消息展开详情 Popover

---

## 第三章：自定义 Hooks

```typescript
// hooks/useIntelStream.ts
// 订阅 OpenClaw SSE intel.* 事件流
function useIntelStream(workspaceId: string, industryId: string): {
  latestFlowTick: FlowTick | null
  latestSignal: SignalItem | null
  latestTopologyDelta: TopologyDelta | null
  latestAlert: TacticalAlert | null
  connectionStatus: 'connected' | 'reconnecting' | 'error'
}

// hooks/useIntelSnapshot.ts
// SWR 轮询 IndustryIntelSnapshot
function useIntelSnapshot(industryId: string): {
  snapshot: IndustryIntelSnapshot | null
  isLoading: boolean
  error: Error | null
  mutate: () => void
}

// hooks/useSandboxSubmit.ts
// 封装沙盘推演提交与结果轮询
function useSandboxSubmit(): {
  submit: (request: SandboxScenarioRequest) => Promise<string>  // 返回 runId
  isSubmitting: boolean
  activeRunId: string | null
  runEvents: ExecutionEvent[]
  result: ScenarioResult | null
  reset: () => void
}

// hooks/useEvolutionProposals.ts
function useEvolutionProposals(workspaceId: string): {
  proposals: EvolutionProposalView[]
  draftCount: number
  isLoading: boolean
  mutate: () => void
}

// hooks/useAgentHeartbeat.ts
// 消费 intel.agent.heartbeat，追踪五个 Agent 在线状态
function useAgentHeartbeat(): {
  agentStatuses: Record<AgentId, 'running' | 'degraded' | 'error' | 'idle'>
  lastHeartbeatAt: Record<AgentId, string>
}
```

---

## 第四章：API 对接清单

### 4.1 REST API（Hermes 侧）

| 方法 | 路径 | 用途 | 调用组件 | 刷新频率 |
|---|---|---|---|---|
| GET | /api/v1/industry/kpi-snapshot | 行业情报总快照 | TopBar/P1/P5 | SWR 30s |
| GET | /api/v1/industry/knowledge-graph | 星云初始全量图谱 | P3 初始化 | 页面加载一次 |
| GET | /api/v1/harness/evolution-proposals | 进化提案列表 | P5 | SWR 60s |
| GET | /api/v1/harness/evaluation-report | 评估报告/对齐度 | P5 | SWR 5min |
| POST | /api/v1/sandbox/submit | 提交沙盘推演 | P4 表单 | 按需 |
| GET | /api/v1/sandbox/scenario-results/:id | 拉取推演结果 | P4 结果展示 | 推演完成后 |
| GET | /api/v1/runtime/connector-health | 数据源健康度 | P2 | 轮询 10s |
| GET | /api/v1/audit/latest-approval | 最近提案审批记录 | P5 签名区 | SWR 60s |

### 4.2 SSE 事件流（OpenClaw 侧）

端点：GET /stream/industry-intel?workspaceId=&industryId=
协议：text/event-stream（标准 EventSource）
鉴权：Authorization: Bearer <token>

| 事件类型 | 推送频率 | 消费组件 | 核心字段 |
|---|---|---|---|
| intel.flow.tick | 3s | P2 CapitalFlowCurve | timestamp, capitalFlowIndex, volumeIndex |
| intel.signal.detected | 异步 | P1 EventFeed, Ticker | signalId, title, threatLevel, confidence |
| intel.topology.updated | 5min 批次 | P3 星云图 | added:Node[], removed:string[], updated:Edge[] |
| intel.alert.tactical | 异步 | ThreatAlertModal | alertId, title, description, suggestedAction |
| intel.evolution.proposal-created | 异步 | P5 ProposalList | proposalId, proposalType, confidence |
| intel.agent.heartbeat | 30s | TopBar AgentDot | agentId, status, lastRunAt, nextRunAt |
| run.started | 按需 | P4 ProgressTracker | runId, taskId, startedAt |
| run.progress | 按需 | P4 ProgressTracker | runId, progress, currentSkill |
| run.completed | 按需 | P4 结果展示 | runId, summaryId |

### 4.3 核心 Schema

```typescript
// GET /api/v1/industry/kpi-snapshot 响应
interface IndustryIntelSnapshot {
  snapshotId: string
  industryId: string
  workspaceId: string
  generatedAt: string
  modelConfidence: number           // 0-100
  evolutionGeneration: number       // GEN-N
  threatLevel: 'LOW' | 'MED' | 'HIGH' | 'CRITICAL'
  radarSection: {
    dimensions: RadarDimension[]    // 8 个维度，各含 value(0-100) + label
  }
  signalFeed: SignalItem[]          // 最新 20 条信号
  systemStatus: 'OPERATIONAL' | 'DEGRADED' | 'OFFLINE'
  version: string
}

// POST /api/v1/sandbox/submit 请求体
interface SandboxScenarioRequest {
  requestId: string
  workspaceId: string
  industryId: string
  automationLevel: 'L1'             // 前端固定传 L1，不可覆盖
  scenarioInput: Record<string, unknown>
  hypothesisLabel: string
  callbackTarget: string
  idempotencyKey: string            // 前端生成，防重复提交
  version: '1.0'
}

// GET /api/v1/sandbox/scenario-results/:id 响应
interface ScenarioResult {
  runId: string
  paths: PredictionPath[]
  recommendations: ActionRecommendation[]
  disclaimer: string                // 固定：「AI 建议 / 仅供参考」
  generatedAt: string
}

interface PredictionPath {
  label: 'PATH_A' | 'PATH_B' | 'PATH_C'
  description: string
  winRate: number                   // 0-1
  data: { t: string; value: number }[]
  isRecommended: boolean
}
```

---

## 第五章：状态管理

### 5.1 分层原则

全局状态（Zustand）：
  - industryId（当前行业）
  - workspaceId
  - agentStatuses（来自 useAgentHeartbeat）
  - activeThreatAlerts（未处理告警队列）

组件本地状态：
  - 各板块图表数据缓冲（useRef + circular buffer，不放全局）
  - 沙盘表单输入状态
  - 星云节点 hover 状态

SSE 数据流（不经 Redux/Zustand，直接消费）：
  - intel.flow.tick → P2 本地 circular buffer
  - intel.topology.updated → P3 图谱差量队列

### 5.2 更新优先级

P0（立即，不节流）：intel.alert.tactical → ThreatAlertModal
P1（≤ 100ms）：intel.flow.tick → CapitalFlowCurve
P2（≤ 1s）：intel.signal.detected → TacticalEventFeed
P3（SWR 30s）：IndustryIntelSnapshot → RadarCanvas, TopBar
P4（SWR 5min）：EvaluationReport → DecisionAlignmentChart

---

## 第六章：可访问性与性能

### 6.1 可访问性

- 所有图表必须有 aria-label 或 role="img" + 文字描述。
- 键盘导航：Tab 切换图表焦点，Enter 展开详情。
- 颜色不作为唯一区分手段（同时使用颜色+图标+文字）。
- prefers-reduced-motion：停用扫描线/DNA动画/星云旋转，仅保留数据更新。

### 6.2 性能目标

| 指标 | 目标 | 降级策略 |
|---|---|---|
| LCP | < 1.5s | 服务端渲染快照数据 |
| INP | < 150ms | Web Worker 处理星云布局 |
| CLS | < 0.05 | 固定面板高度，骨架屏占位 |
| SSE 重连 | < 2s | OpenClaw 补偿最近 30 条事件 |
| Three.js 帧率 | 目标 60fps | < 30fps 自动降级 D3 |
| 内存 | < 300MB | 页面隐藏时暂停 3D 渲染 |

---

## 第七章：文件结构

apps/web/src/views/industry-intelligence/
├── index.tsx                          # 路由入口 + 五栏布局
├── panels/
│   ├── Panel1StrategicAwareness/
│   │   ├── index.tsx
│   │   ├── RadarCanvas.tsx
│   │   ├── TacticalEventFeed.tsx
│   │   └── PolicyHeatWordMatrix.tsx
│   ├── Panel2DataFlux/
│   │   ├── index.tsx
│   │   ├── CapitalFlowCurve.tsx
│   │   ├── MarketTrendMultiCurve.tsx
│   │   └── DataSourceHealthRow.tsx
│   ├── Panel3NebulaCoreMap/
│   │   ├── index.tsx
│   │   ├── ThreeJsForceGraph.tsx
│   │   ├── D3ForceFallback.tsx
│   │   ├── NodeDetailPopover.tsx
│   │   └── nebula.worker.ts           # Web Worker 布局计算
│   ├── Panel4SimulationSandbox/
│   │   ├── index.tsx
│   │   ├── ScenarioInputForm.tsx
│   │   ├── SandboxProgressTracker.tsx
│   │   ├── PredictionPathChart.tsx
│   │   └── ScenarioResultCard.tsx
│   └── Panel5EvolutionCore/
│       ├── index.tsx
│       ├── EvolutionDnaViz.tsx
│       ├── DecisionAlignmentChart.tsx
│       ├── ModelWeightAdjustmentLog.tsx
│       └── CommandAuthorizationFooter.tsx
├── global/
│   ├── IntelTopBar.tsx
│   ├── ThreatAlertModal.tsx
│   └── CommandTicker.tsx
├── hooks/
│   ├── useIntelStream.ts
│   ├── useIntelSnapshot.ts
│   ├── useSandboxSubmit.ts
│   ├── useEvolutionProposals.ts
│   └── useAgentHeartbeat.ts
├── store/
│   └── intelStore.ts                  # industryId / agentStatuses / alerts
└── types/
    └── intel.types.ts                 # 本地类型（从 packages/event-contracts 导入）

---
本文档遵循 AGENTS.md v3.0.0 + CLAUDE.md v1.2。
apps/web 仅作视图层，所有数据通过 REST/SSE 从 Hermes/OpenClaw 获取。