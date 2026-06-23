# Phase 0 契约设计 — 架构说明

## 文档类型：架构决策记录（ADR）
### 版本：v1.0.0 | 日期：2026-06-22
### 关联：CLAUDE.md §2.2 Contract-First / §3.2 目录边界 / PRD 2.0

---

## 1. 为什么这些契约属于跨域公共层

V2 门户升级涉及三个域的协作：

| 域 | 消费方 | 产出方 | 契约对象 |
|---|---|---|---|
| **Hermes Control Kernel** | 前端 REST API | A1 心跳 Agent → Hermes 缓存层 | `IndustryIntelSnapshot` |
| **Hermes Control Kernel** | A4 推演沙盘 Agent | 前端 P4 表单 → Hermes 任务编排 | `SandboxScenarioRequest` |
| **Hermes Control Kernel** | 前端 P4/P5 视图 | A4/A5 Agent → Hermes WorkflowRun | `ScenarioResult` |
| **OpenClaw Execution Runtime** | 前端 SSE EventSource | A1-A5 Agent → OpenClaw SSE 发射器 | `IntelSSEEvent`（6 种子类型） |

**核心论点**：这些对象同时被两个以上的域消费或产出，因此：
- 不能放在 `apps/web/src/` 中（视图层只能消费，不能定义跨域类型）。
- 不能放在 `packages/hermes-kernel/` 中（OpenClaw 不能反向依赖 Hermes 私有实现）。
- 不能放在 `packages/openclaw-adapter/` 中（Hermes 不能反向依赖 OpenClaw 私有实现）。
- 只能放在 `packages/event-contracts/` 中，作为三域共享的底层。

---

## 2. 域归属声明（domain-boundary.ts）

| 契约 | 归属域 | 可写入方 | 可读取方 |
|---|---|---|---|
| `IndustryIntelSnapshot` | HERMES_OWNED | hermes-kernel | apps/web, industry-packs |
| `SandboxScenarioRequest` | HERMES_OWNED | hermes-kernel | apps/web, industry-packs |
| `ScenarioResult` | HERMES_OWNED | hermes-kernel | apps/web, industry-packs |
| `IntelSSEEvent` (6 子类型) | OPENCLAW_OWNED | openclaw-adapter | apps/web, industry-packs |

---

## 3. 版本化策略

每个契约对象独立版本化（per-object versioning），当前均为 `1.0.0`：

| 契约 | 版本常量 | 版本值 |
|---|---|---|
| `IndustryIntelSnapshot` | `INDUSTRY_INTEL_SNAPSHOT_VERSION` | `1.0.0` |
| `SandboxScenarioRequest` | `SANDBOX_SCENARIO_REQUEST_VERSION` | `1.0.0` |
| `ScenarioResult` | `SCENARIO_RESULT_VERSION` | `1.0.0` |
| `IntelSSEEvent` (all) | `INTEL_SSE_EVENT_VERSION` | `1.0.0` |

升级规则：当新增必填字段或修改字段语义时，递增 MAJOR 版本号，并更新对应 fixture 文件。

---

## 4. AGENTS.md 合规检查

### 4.1 TaskEnvelope 对齐

`SandboxScenarioRequest` 映射到 `TaskEnvelope` 的方式：
- `requestId` → `TaskEnvelope.taskId`
- `workspaceId` → `TaskEnvelope.workspaceId`
- `industryId` → `TaskEnvelope.industryId`
- `automationLevel` → `TaskEnvelope.automationLevel`（硬锁 L1）
- `idempotencyKey` → `TaskEnvelope.idempotencyKey`
- `callbackTarget` → `TaskEnvelope.callbackTarget`
- `scenarioInput` → `TaskEnvelope.input`

### 4.2 ExecutionEvent 对齐

所有 `IntelSSEEvent` 子类型必须携带：
- `version`（semver）✅
- `timestamp` / `heartbeatAt` / `detectedAt` / `triggeredAt`（ISO-8601）✅
- 事件类型通过 `eventType` 字面量区分 ✅

### 4.3 幂等键

- `SandboxScenarioRequest.idempotencyKey` 由前端生成，保证防重复提交。
- `IndustryIntelSnapshot.snapshotId` 作为快照去重键。

### 4.4 版本字段

所有 9 个新增 schema（含子 schema）均携带 `version: VersionSchema`。

---

## 5. 测试覆盖

| 测试类别 | 文件 | 测试数 |
|---|---|---|
| IndustryIntelSnapshot 单元测试 | `industry-intel-snapshot.test.ts` | 13 |
| SandboxScenario 单元测试 | `sandbox-scenario.test.ts` | 13 |
| Intel SSE 事件单元测试 | `intel-sse-events.test.ts` | 19 |
| 版本兼容性（fixture 快照） | `version-compatibility.test.ts` | +10 fixture |
| **合计** | | **55** (新增，不含原有 190) |

所有测试通过（21 文件 / 245 测试）。

---

## 6. 下一 Phase 输入条件

Phase 1（Hermes / OpenClaw 接口补齐）的前置条件：

- [x] `IndustryIntelSnapshot` schema 已定义且测试通过
- [x] `SandboxScenarioRequest` / `ScenarioResult` schema 已定义且测试通过
- [x] `IntelSSEEvent` discriminatedUnion 已定义且测试通过
- [x] 域归属声明完整
- [x] 所有 fixture JSON 可用于版本兼容性回归

Phase 1 将实现：
- REST API route handler（`/api/v1/industry/kpi-snapshot` 等）
- SSE endpoint（`/stream/industry-intel`）
- OpenClaw 适配器事件发射映射
