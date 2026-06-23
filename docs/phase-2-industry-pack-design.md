# Phase 2 — Industry Pack 配置化：把情报中心大屏变成可装载资产

**日期**：2026-06-22
**专项**：V2 门户升级专项
**状态**：已完成

---

## 1. 动机：为什么 Dashboard 是资产而不是页面分支

在 v1 架构中，行业情报中心大屏是硬编码在 `apps/web` 的页面分支——新增一个行业就需要新增一个页面、修改路由、调整布局、绑定数据源。这违反了 Industry Pack 的核心理念（CLAUDE.md §6.1）：

> 行业包是插件，不是业务分支。新增行业时，优先新增 pack，不优先修改核心代码。

Phase 2 将整个 Dashboard 的定义权下放给 Industry Pack：

- **布局**（5 板块 / 响应式断点）→ `dashboards/*.dashboard.yaml`
- **数据依赖**（REST / SSE / Store）→ 每个 Panel 声明自己的 `dataDependencies`
- **Agent 绑定**（A1-A5 心跳 + 自动化等级）→ `manifest.yaml` 的 `agentBindings` + `agents/` 资产
- **SSE 订阅**（事件类型 → 面板映射 + 优先级）→ `manifest.yaml` 的 `sseSubscriptions`
- **深链接参数**（`?panel=sandbox` → P4）→ `manifest.yaml` 的 `routeConfig`

Hermes / OpenClaw 核心代码不需要知道"这个行业有 5 个板块"——它们只知道"有一个 DashboardConfig 被装载了"。

---

## 2. 设计决策

### 2.1 契约层扩展（event-contracts）

**IndustryManifest 新增 5 个 V2 扩展字段**（`packages/event-contracts/src/industry-manifest.ts`）：

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| `dashboards` | `DashboardDeclaration[]` | 声明该 pack 包含的 dashboard 清单 |
| `kpiSchemas` | `KpiSchemaDeclaration[]` | 声明 KPI 指标的计算方式（api/sse/computed） |
| `agentBindings` | `AgentBindingDeclaration[]` | Agent ID → 面板映射 + 心跳频率 |
| `sseSubscriptions` | `SSESubscriptionDeclaration[]` | 事件类型 → 面板 + 优先级（P0-P4） |
| `routeConfig` | `RouteConfigDeclaration` | 基础路径 + 深链接参数映射 |

所有字段均为 `.optional()` 或 `.default([])`，向后兼容。

**DashboardConfig 独立契约**（`packages/event-contracts/src/dashboard-config.ts`）：

- `DashboardConfigSchema`：顶层配置（5 panels + layout + route + agents + performance + compatibility）
- `PanelConfigSchema`：单面板配置（数据依赖 + SSE 订阅 + 刷新策略 + 根组件名）
- `LayoutConfigSchema`：响应式布局（default/medium/small 三个断点）
- `PerformanceThresholdsSchema`：LCP/INP/CLS + 3D FPS + 内存上限

**关键设计约束**：
- `rootComponent` 是字符串（如 `"Panel1StrategicAwareness"`），由前端映射到具体 React 组件——契约层不依赖前端实现
- `dataDependencies[*].type` 区分为 `rest` / `sse` / `store`，前端按类型选择数据获取策略
- `refreshStrategy.swrIntervalMs = 0` 表示不轮询（纯 SSE 驱动）

### 2.2 SDK 装载层（industry-pack-sdk）

**新增 `loadIndustryDashboardConfig()`**：

```
pack manifest → loadIndustryDashboards() → raw YAML → DashboardConfigSchema.parse() → DashboardConfig
```

关键行为：
1. 从 `dashboards/` 目录读取 YAML，经 `DashboardConfigSchema` 强校验
2. 交叉校验：Dashboard 中每个 panel 的 `agentId` 必须在 manifest 的 `agentBindings` 中声明
3. 校验失败 → 触发 `DASHBOARD_REJECTED` 审计事件 → 抛出异常（拒绝装载）
4. 校验通过 → 触发 `DASHBOARD_LOADED` 审计事件 → 缓存 + 返回

**新增 `validateIndustryPackCompatibility()`**：

依据 CLAUDE.md §6.3，三项缺一不可：

| 检查项 | 数据来源 | 失败处理 |
| --- | --- | --- |
| `compatibleHermesApi` | manifest vs 当前 Hermes API 版本 | `hermesCompatible: false` |
| `compatibleRuntimeApi` | manifest vs 当前 Runtime API 版本 | `runtimeCompatible: false` |
| `migrationRules` | 至少一条 + 覆盖当前 `toVersion` | `missingMigrationRules` 列表 |

返回 `CompatibilityCheckResult`（含 `passed`、`failures`、`checkedAt`），并触发对应的审计事件。

### 2.3 Sample Pack 资产结构（industry-intelligence-v2）

```
industry-packs/industry-intelligence-v2/
├── manifest.yaml                              # 行业包清单（含 V2 扩展字段）
├── dashboards/
│   └── industry-intelligence-v2.dashboard.yaml # 5 面板 + 布局 + 路由
├── agents/
│   ├── agent-a1-strategic-awareness.yaml       # P1 战略态势感知
│   ├── agent-a2-data-flux.yaml                 # P2 数据流量动力学
│   ├── agent-a3-nebula-core.yaml               # P3 行业生态星云
│   ├── agent-a4-simulation-sandbox.yaml        # P4 决策推演沙盘
│   └── agent-a5-evolution-core.yaml            # P5 人机进化核心
├── workflows/
│   ├── wf-strategic-awareness-heartbeat/       # A1 心跳 DAG
│   ├── wf-data-flux-stream-heartbeat/          # A2 心跳 DAG
│   ├── wf-nebula-topology-heartbeat/           # A3 心跳 DAG
│   └── wf-evolution-heartbeat/                 # A5 心跳 DAG
├── skills/                                     # 9 个技能定义
├── schemas/                                    # 行业包自定义 Schema
├── knowledge/                                   # 领域知识索引
├── eval-rules/                                  # 6 条评估规则
├── connectors/                                  # 2 个连接器定义
└── prompts/                                     # 系统级 Prompt 模板
```

### 2.4 审计事件扩展

新增 4 个审计事件类型（`IndustryPackAuditEvent.type`）：

- `DASHBOARD_LOADED`：Dashboard 配置校验通过
- `DASHBOARD_REJECTED`：Dashboard 配置校验失败
- `COMPATIBILITY_CHECK_PASSED`：兼容性检查通过
- `COMPATIBILITY_CHECK_FAILED`：兼容性检查失败

---

## 3. 与核心域的边界

**Industry Pack 只能注入公开资产，不可修改**：
- RBAC 配置
- Guardrail 规则
- 审批门禁（HumanApprovalCheckpoint 的参数）
- Hermes PolicySnapshot
- OpenClaw ConnectorPolicy（高危部分）

验证方式：`IndustryPackLoader.assertDomainBoundary()` 在装载阶段检查 pack 是否试图越权。

---

## 4. 后续 Phase 的依赖关系

Phase 2 产出物是 Phase 3（前端基础）的直接输入：

- Phase 3 的页面组件从 `DashboardConfig` 读取布局与数据依赖
- Phase 3 的 SSE hooks 从 `sseSubscriptions` 读取订阅映射
- Phase 3 的路由从 `routeConfig.deepLinks` 读取深链接参数

---

## 5. 测试覆盖

| 测试集 | 文件 | 数量 |
| --- | --- | --- |
| event-contracts 全量 | 22 个测试文件 | 260 tests |
| industry-pack-sdk | loader.test.ts | 4 tests |
| SDK TypeScript 类型检查 | `tsc --noEmit` | 零错误 |

---

## 6. 变更文件清单

| 文件 | 操作 | 说明 |
| --- | --- | --- |
| `packages/event-contracts/src/industry-manifest.ts` | 修改 | 新增 5 个 V2 扩展字段 |
| `packages/event-contracts/src/dashboard-config.ts` | 新建 | DashboardConfig 完整契约 |
| `packages/event-contracts/src/index.ts` | 修改 | 导出 DashboardConfig 相关 |
| `packages/industry-pack-sdk/src/loader.ts` | 修改 | 新增 loadIndustryDashboardConfig + validateIndustryPackCompatibility |
| `packages/industry-pack-sdk/src/types.ts` | 修改 | 新增审计事件类型 + CompatibilityCheckResult |
| `packages/industry-pack-sdk/src/index.ts` | 修改 | 导出新函数 + 类型 |
| `industry-packs/industry-intelligence-v2/` | 新建 20 个文件 | 完整 sample pack 资产 |
