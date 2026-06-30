# CLAUDE.md — HermesClaw 工程协作与实现约束
## 版本：v3.5
## 日期：2026-06-30

---

# 1. 文档目的

本文件用于约束 Claude Code / 其他 AI Coding Agent / 人类工程师在 HermesClaw 仓库内的实现方式。  
它不定义产品愿景（以 PRD 为准）；不定义最高治理规则（以 AGENTS.md 为准）。

本文件只解决一个问题：  
**如何把 HermesClaw 正确地实现出来，而不是写成一个耦合失控的大项目。**

---

# 2. 系统实现总原则

## 2.1 三域优先

任何功能开发前，必须先判断它属于哪一个运行域：

- Hermes Control Kernel  
- OpenClaw Execution Runtime  
- Industry Pack Layer

若一个功能同时跨越两个以上运行域，必须先定义契约对象与边界，再开始写代码（通常是 event contracts / harness schema / Industry Pack manifest）。

## 2.2 Contract-First

所有跨域协作先定义 schema，再写 handler。

- 禁止先写页面、后补接口。  
- 禁止先写业务逻辑、后补状态机。  
- 禁止把 runtime contract 混进 UI 组件。  
- 跨域调用必须通过 `packages/event-contracts` / `packages/harness-schema` 等公共契约层完成，而不是直接 import 其他服务内部实现。  
- 与上游 Hermes / OpenClaw 的交互必须通过公开的 CLI / HTTP / WebSocket / MCP 接口完成，不得依赖其内部私有模块与未文档化的结构。

## 2.3 Runtime-First Evolution

自进化优先修改：

- `WorkflowTemplate`  
- `AgentPolicy`  
- `SkillBinding`  
- `ContextPolicy`  
- `MemoryPolicy`  
- `ConnectorPolicy`（非高危部分）  
- `EvalRuleSet`

不要把「自动改源码」作为默认实现路径。  
只有当 runtime 对象无法解决问题时，才生成工程变更建议（包含上下文与失败证据），并进入人工研发流程（PR / Code Review / 回滚机制）。

## 2.4 上游原则继承

- **Hermes Core 必须保持窄核心**：核心只负责会话管理、工具编排、记忆与策略，能力扩展应优先通过 skills、plugins 与外部服务实现。  
- **会话前缀缓存不可破坏**：禁止在单次会话生命周期内随意重写系统 Prompt 或插入不必要的中间消息，避免破坏现有的 prompt cache 与压缩策略。  
- **OpenClaw Runtime 必须保持事件驱动模型**：执行必须通过标准 run / event / artifact / approval 流程进行，而不是通过「一把梭」式阻塞调用。  
- 禁止在 Hermes / OpenClaw 上游仓库中直接加入项目专用分支逻辑；必要修改应以向上游提交通用 PR 为主，本仓库通过配置与兼容层使用。

---

# 3. 仓库结构约定

## 3.1 当前阶段（v3.x）：pnpm monorepo

本仓库采用 **pnpm monorepo** 架构，各 package 已从单 Next.js 应用拆分完毕：

| 物理目录 | 等价角色 | 说明 |
| --- | --- | --- |
| `apps/web/` | apps/web + services/hermes-core + services/openclaw-runtime | 视图层 + Route Handler + 服务端集成层，不得直接持有纯逻辑 |
| `apps/web/src/app/` | apps/web 视图层 | Next.js App Router 页面 & API Route Handler |
| `apps/web/src/lib/server/` | services/hermes-core + services/openclaw-runtime 集成层 | 控制核与执行运行时的 Prisma/HTTP 集成实现 |
| `apps/web/src/lib/server/adapters/hermes/` | hermes adapter | Hermes API 客户端，版本锁定 + Mock 降级 |
| `apps/web/src/lib/server/adapters/openclaw/` | openclaw adapter (legacy) | 旧版 OpenClaw 适配器（已迁移至 `packages/openclaw-adapter`） |
| `packages/hermes-kernel/` | services/hermes-core 纯逻辑 | 控制核纯逻辑层（意图解析 / DAG 引擎 / Harness 生命周期 / 策略 / 记忆） |
| `packages/openclaw-adapter/` | services/openclaw-runtime 纯逻辑 | 执行运行时适配器（Gateway 客户端 / 事件总线 / SSE 发射器 / Mock） |
| `packages/event-contracts/` | packages/event-contracts + packages/harness-schema | 全部契约对象的 Zod 单源定义（TaskEnvelope / ExecutionEvent / HarnessBundle 等） |
| `packages/industry-pack-sdk/` | packages/industry-pack-sdk | 行业包装载、校验、Schema、prompt/DAG/steps 加载 API |
| `industry-packs/<pack-id>/` | 行业包资产 | 每个 pack 自包含 manifest + agents + workflows + prompts + skills + connectors（按 §6.2） |
| `prisma/` | infra/db | 数据库 schema 与 seed 脚本 |
| `.claude/` | infra/skills | Claude Code skills（外贸技能模板） |

## 3.2 目录边界（monorepo 模式）

- `apps/web/src/app/` 不得包含核心业务规则；从 `apps/web/src/lib/server/*` 获取数据，从 `packages/event-contracts/src/*` 获取类型。
- `packages/hermes-kernel/` 和 `packages/openclaw-adapter/` 为纯逻辑层，**零依赖 Prisma / Next.js**；所有外部依赖通过 DI 接口（`*Deps`）注入。
- `apps/web/src/lib/server/` 内部模块通过 `packages/event-contracts` 与 `packages/hermes-kernel` / `packages/openclaw-adapter` 通信，**禁止跨域直接 import 私有实现**。
- `packages/event-contracts/` 只放协议 schema，**不得 import 任何 server/kernel/adapter 代码**（防止反向依赖）。
- `packages/industry-pack-sdk/` 只放行业包装载与校验逻辑，**不写任何具体行业的业务实现**；具体行业逻辑必须落在 `industry-packs/<pack-id>/`。
- `industry-packs/<pack-id>/` 不得侵入 Hermes / OpenClaw 核心代码；与核心通信必须经由 SDK 公开的注入点（manifest + agents + workflows + prompts + skills）。
- 任何在 `packages/hermes-kernel/` 或 `apps/web/src/lib/server/` 中出现的特定 `industryId` 字面量（如 `"foreign-trade"`）都视为 anti-pattern；处理方式：通过参数传入或从 `WorkspaceContext` / `Workflow.industryId` 派生。

## 3.3 拆分完成状态（v3.x）

Hermes Core / OpenClaw Runtime 已按以下顺序完成拆分：

1. ✅ `packages/event-contracts`（来源：旧 `src/contracts/`）
2. ✅ `packages/hermes-kernel`（来源：旧 `src/lib/server/` 纯逻辑层）
3. ✅ `packages/openclaw-adapter`（来源：旧 `src/lib/server/adapters/openclaw/`）
4. ✅ `packages/industry-pack-sdk`（来源：旧 `src/lib/industry-pack-sdk/`）
5. ✅ `apps/web/`（来源：旧 `src/app/` + `src/lib/server/` 集成层）
6. ✅ Brain Module Phase 2（智慧大脑模块全量修复与迁移）完成日期：2026-06-26

当前目录结构已稳定为 monorepo：

> `apps/web`、`packages/hermes-kernel`、`packages/openclaw-adapter`、`packages/event-contracts`、`packages/industry-pack-sdk`、`industry-packs/<pack-id>`、`prisma/`

**§3.2 的目录边界对所有代码变更等价生效**，违反任何一条都视为破坏架构完整性。

---

# 4. Hermes Core 实现规则

## 4.1 Hermes 的职责

Hermes 必须实现：

- Intent parsing（意图解析与目标结构化）。  
- Workflow generation（DAG Workflow 生成与节点配置）。  
- Model routing（模型与推理策略路由）。  
- Memory orchestration（多层记忆协同与压缩策略调用）。  
- Policy enforcement（策略与自动化等级执行）。  
- Evaluation engine（执行与进化评估）。  
- Proposal engine（提案生成引擎）。  
- Approval / canary / rollback（审批 / 灰度 / 回滚流程）。  
- Audit trail 记录（以 Hermes 为治理真相源）。

Hermes 不应实现：

- 所有渠道连接（这属于 OpenClaw 与 channel / node 系统）。  
- 所有设备在线状态常驻（presence 由 OpenClaw Gateway 管理）。  
- 连接器底层适配细节（由 openclaw-runtime + connectors 实现）。  
- 行业包内部具体业务逻辑（由 Industry Pack 实现）。

## 4.2 Hermes 的真相源

Hermes 是以下数据的 Source of Truth：

- Task definition（任务定义）。  
- Policy snapshot（策略快照）。  
- Harness bundle version（Harness 版本）。  
- Approval status（审批状态）。  
- Audit trail（审计记录）。  
- Proposal lifecycle（提案生命周期）。  

---

# 5. OpenClaw Runtime 实现规则

## 5.1 OpenClaw 的职责

OpenClaw 必须实现：

- Channel / device presence（通道与设备在线状态）。  
- Connector execution（连接器执行）。  
- Event emission（ExecutionEvent 事件发出）。  
- Action receipts（回执收集与存储）。  
- Runtime capability registration（能力注册）。  
- Local/mobile execution context（本地与移动执行上下文）。  
- Sandbox 运行模式（非主会话的受限执行模式）。

OpenClaw 不得：

- 绕过 Hermes 做策略决策。  
- 修改 Harness 规则。  
- 自行批准高危动作。  
- 直接调用 Hermes 内部模块，只能通过契约事件与 API。  

## 5.2 Runtime 事件设计

所有执行动作都必须至少触发：

- `started`  
- `progress`（可选）  
- `completed` 或 `failed`  
- `summary`

所有事件必须携带：

- `taskId`  
- `workflowRunId`  
- `runtimeId`  
- `timestamp`  
- `status`  
- `payload`  
- `receipt` / `error`（如适用）  
- `version`（事件版本）

对于长流程任务，推荐对齐 OpenClaw 的事件族（如 `run.created` / `run.started` / `tool.call.*` / `approval.requested` / `artifact.created`），再映射为 HermesClaw 内部 `ExecutionEvent` 类型。

---

# 6. Industry Pack 实现规则

## 6.1 行业包原则

行业包是插件，不是业务分支。  
新增行业时，优先新增 pack，不优先修改 Hermes 核心代码或 openclaw-runtime 核心代码。

## 6.2 每个行业包必须提供

- `manifest.yaml`  
- `agents/`  
- `workflows/`  
- `skills/`  
- `knowledge/`  
- `connectors/`  
- `schemas/`  
- `dashboards/`  
- `eval-rules/`  

## 6.3 兼容性

每个行业包必须声明：

- `compatibleHermesApi`  
- `compatibleRuntimeApi`  
- `migrationRules`  

不兼容的行业包禁止装载，必须在装载阶段就被拒绝。

---

# 7. Schema 设计规则

## 7.1 必须使用类型系统

- TypeScript 类型 + zod（或同等）schema 双定义或单源生成。  
- 所有外部输入必须校验。  
- 所有 runtime event 必须版本化（包含 `version` 字段）。  

## 7.2 必须版本化的对象

- TaskEnvelope  
- ExecutionEvent  
- ExecutionSummary  
- CapabilityRegistration  
- HarnessBundle  
- IndustryManifest  
- EvaluationReport  
- EvolutionProposal  

---

# 8. 数据与审计规则

## 8.1 必须留痕

以下行为必须写 AuditLog：

- `workflow.generate`  
- `task.dispatch`  
- `task.cancel`  
- `model.route`  
- `connector.execute`（尤其是写操作）  
- `proposal.create` / `proposal.approve` / `proposal.reject` / `proposal.rollback`  
- `industry.pack.install` / `industry.pack.activate` / `industry.pack.rollback`  
- `automation.level.change`（尤其是 L3/L4）  

## 8.2 日志分层

- **AuditLog**：治理与审计留痕（审批、策略、提案、回滚）。  
- **AgentLog**：执行行为与风险记录。  
- **WorkflowRun / NodeRun**：结构化运行记录。  
- **Receipt Store**：外部动作回执（与 OpenClaw 事件对应）。

---

# 9. 开发顺序约束

建议统一开发顺序（特别是对 AI Coding Agent）：

1. **归类运行域**：先判断需求属于 Hermes / OpenClaw / Industry Pack 哪一层。  
2. **补齐契约**：在 `packages/event-contracts` / `packages/harness-schema` 中定义或修改必要的类型与 schema。  
3. **编写最小用例**：为新契约编写最小 e2e 测试（从 TaskEnvelope 到 ExecutionEvent 的闭环）。  
4. **实现服务端逻辑**：在对应 `services/*` 中实现 handler，保持边界清晰。  
5. **再做前端**：最后补充 `apps/web` 的配置 UI / 监控视图 / 审批界面。  
6. **禁止跳步**：不得在未定义契约与测试的情况下直接堆叠业务逻辑与 UI。

---

# 10. 测试与 CI 要求

- 所有新增 runtime 契约必须有单元测试（schema 校验 + 反序列化 + 版本兼容测试）。  
- Hermes ↔ OpenClaw 之间的关键路径必须有 e2e 测试（模拟真实事件与回执）。  
- 所有与高危动作相关的改动，必须在测试中覆盖：拒绝路径、审批路径、回滚路径。  
- CI 流水线必须执行：类型检查 + 单元测试 + e2e 测试 + lint + schema 断言。

---

# 11. 性能优化方法论（v3.0 新增）

## 11.1 性能诊断四层模型

所有页面响应慢的问题，按以下四层自上而下排查。**每层修复后必须实测验证，再进入下一层。**

| 层级 | 诊断点 | 典型瓶颈 | 测量手段 |
| --- | --- | --- | --- |
| **L0 — 编译层** | 开发模式 bundler 冷编译速度 | Webpack 10-15s vs Turbopack 1-2s | `curl -w "%{time_total}"` 测首次 TTFB |
| **L1 — 渲染层** | SSR/RSC 渲染 + JS 传输 + 水合 | main-app.js >10MB、骨架屏编译延迟 | 浏览器 DevTools → Network → JS 体积 |
| **L2 — 数据层** | API 响应时间 + 数据库查询 | N+1 查询、全表扫描、SQLite 锁竞争 | `curl` 测 `/api/*` 路由耗时 |
| **L3 — 组件层** | 客户端水合后渲染效率 | 过多 useEffect 级联触发、Store 重复订阅 | React DevTools Profiler |

## 11.2 诊断流程（必须按顺序执行）

```
1. 先用 curl 测 /api/health → 排除编译层问题（首次 >5s = 编译慢）
2. 再用 curl 测目标页面 TTFB → 排除渲染层问题（首次 >3s = SSR 慢）
3. 再用 curl 测具体 /api/* 路由 → 定位数据层瓶颈
4. 最后用 React Profiler → 定位组件层瓶颈
```

## 11.3 各层优化手段（按效果排序）

### L0 — 编译层

| 手段 | 效果 | 适用场景 |
| --- | --- | --- |
| **Webpack → Turbopack** | 冷编译 5-10x 加速 | 开发模式（生产无影响） |
| `loading.tsx` 零外部依赖 | 骨架屏 <1ms 发送 | 所有页面必须 |
| 删除重复 middleware / layout | 消除 bundler 漂移 | 根目录残留文件 |
| 动态导入重型组件 | main-app.js 体积减小 | `dynamic(() => import(...), { ssr: false })` |

### L1 — 渲染层

| 手段 | 效果 | 适用场景 |
| --- | --- | --- |
| **服务端直取数据（SSR fetch）** | 消除客户端 API 往返 + 加载闪烁 | 页面首次加载 |
| `useQuery` 接 `placeholderData` | 服务端数据无缝衔接客户端缓存 | 已有 TanStack Query 的页面 |
| 懒加载非首屏组件 | 减少首帧渲染组件数 | `CommandPalette`、`NotificationBell` 等 |
| 分级渲染策略 | 页面内容先出现，侧边栏数据后加载 | `AppShell` 级 `useEffect` 延迟 |

### L2 — 数据层

| 手段 | 效果 | 适用场景 |
| --- | --- | --- |
| **内存缓存（Map + TTL）** | 30s 内重复请求 0 次 DB 查询 | 高频聚合查询 |
| **复合索引** | `count()/groupBy()` 80ms→1ms | `AuditLog`、`WorkflowRun`、`StepRun` 等 |
| **批量查询合并** | 16 次 `count()` → 4 次 `groupBy()` | 同表多条件聚合 |
| O(n²)→O(n) 数据结构 | 嵌套循环 → Map/Set 预索引 | JS 端数据处理 |

### L3 — 组件层

| 手段 | 效果 | 适用场景 |
| --- | --- | --- |
| Zustand selector 精准订阅 | 避免无关状态变更触发重渲染 | 所有 `useStore` 调用 |
| `memo` + `useCallback` 稳定引用 | 跳过子树重渲染 | 列表项、导航项 |
| 懒加载重型 UI 库 | 首帧不解析 | `recharts`、`framer-motion`、`cmdk` |

## 11.4 服务端直取数据模式（推荐范式）

```tsx
// page.tsx (Server Component) — 服务端直接查库
import { prisma } from "@/lib/prisma";
import PageClient from "./page-client";

export default async function Page() {
  let initialData;
  try {
    initialData = await prisma.xxx.findMany({ where: {...}, orderBy: {...} });
  } catch {} // 降级为客户端加载

  return <PageClient initialData={initialData} />;
}

// page-client.tsx (Client Component) — 接 placeholderData
export default function PageClient({ initialData }: { initialData?: X[] }) {
  const { data } = useQuery({
    queryKey: ["key"],
    queryFn: () => fetch("/api/xxx").then(r => r.json()),
    placeholderData: initialData,  // ← 服务端数据无缝衔接
  });
}
```

## 11.5 禁止的优化反模式

- ❌ 先优化组件层再优化数据层（治标不治本）
- ❌ 在 `loading.tsx` 中导入任何组件库（`PageHeader`、`lucide-react` 等）
- ❌ 在 `useEffect` 中同步发起 3+ 个 API 调用（应错峰或合并）
- ❌ 使用 `await import()` 在每个请求中动态导入 Prisma（应静态 import）
- ❌ 在渲染函数内创建新对象/数组作为 `useMemo` 依赖
- ❌ 在 `"use client"` 组件中直接调用 `prisma`（会在客户端报错）

## 11.7 L3 深层反模式与修复范式（v3.42.05 实战经验）

以下 6 条均来自 2026-06-24 对【行业情报中心】页面完全卡死问题的二轮诊断与修复。
该页面有 5 个实时面板 + SSE 流 + Three.js 3D 渲染，属于 HermesClaw 中最复杂的客户端页面。

### 反模式 1：多个组件各自创建到同一端点的 SSE 连接

**现象**：6 个组件/Hook（页面入口、useKnowledgeGraph、useEvolutionProposals、Panel1、Panel2、CommandTicker）各自调用 `useIntelStream()` → 6 个独立的 SSE fetch 连接到 `/api/v1/stream/industry-intel`。

**后果**：每个 flow tick 事件触发 6 次 `setState` → 渲染风暴 → 主线程阻塞。

**修复范式**：

```text
✅ 创建页面级 Context Provider（如 IntelStreamProvider）管理唯一 SSE 连接
✅ 所有子组件/Hook 通过 useContext 消费数据，不自行创建连接
✅ Provider 使用订阅者模式（subscribeTopology / subscribeEvolution）分发给关心特定事件的 Hook
✅ 页面组件外层 wrap <Provider packId={packId}><PageInner /></Provider>
```

**参考文件**：[intel-stream-context.tsx](apps/web/src/contexts/intel-stream-context.tsx)、[industry-intelligence-page.tsx](apps/web/src/views/industry-intelligence/industry-intelligence-page.tsx)

### 反模式 2：useEffect 依赖数组中包含不稳定引用的函数

**现象**：`useEffect` 的依赖数组包含了 `useCallback` 返回的函数，而该 `useCallback` 自身依赖了频繁变化的值（如 `nodes.length`、`edges.length`）。每次数据变更 → 函数引用变化 → `useEffect` 重新执行 → 昂贵资源（WebGL 上下文）被销毁并重建。

**具体案例**（`useNebulaRender`）：
```ts
// ❌ 错误：recordFrame 依赖 [nodes.length, edges.length]，每次图谱更新都变
const recordFrame = useCallback(() => { ... }, [nodes.length, edges.length])

useEffect(() => {
  // 创建 WebGL 场景（昂贵！）
  const renderer = new THREE.WebGLRenderer(...)
  return () => { renderer.dispose() }  // 销毁 WebGL 上下文
}, [..., recordFrame])  // ← recordFrame 变化 → 整个场景重建！
```

**修复范式**：

```text
✅ 使用 ref 持有回调函数：const fnRef = useRef(fn); useEffect(() => { fnRef.current = fn }, [fn])
✅ 效应内部通过 fnRef.current() 调用最新版本，但效应本身不依赖它
✅ 拆分"创建效应"和"更新效应"：
   - 创建效应依赖：[renderMode, containerSize]（仅模式/尺寸变化时重建）
   - 更新效应依赖：[layout, selectedNodeId, hoveredNodeId]（数据变化时仅更新节点位置/颜色）
✅ 更新效应通过 updateSceneRef.current() 调用创建效应暴露的更新函数
```

**参考文件**：[use-nebula-render.ts](apps/web/src/hooks/use-nebula-render.ts)（拆分后的两个效应 + recordFrameRef / selectNodeRef / onNodeHoverRef）

### 反模式 3：Zustand selector 进入 useEffect 依赖导致 interval/连接 反复重建

**现象**：`useEffect` 依赖了从 Zustand store 解构出的 action 函数（如 `updateAgentHeartbeat`），该引用在每次 store 变更时可能变化 → effect 清理并重建定时器/连接。

**修复范式**：

```text
✅ 效应内部使用 useStore.getState() 直接获取当前状态和 actions
✅ 不在效应依赖数组中放入任何 store selector 的返回值
✅ const store = useStore.getState(); store.updateXxx(...)  // 在 setInterval 内
```

**参考文件**：[use-agent-heartbeat.ts](apps/web/src/hooks/use-agent-heartbeat.ts)、[use-intel-stream.ts](apps/web/src/hooks/use-intel-stream.ts)

### 反模式 4：高优先级数据流更新阻塞用户交互

**现象**：SSE 流事件到达后直接调用 `setState`，React 同步调度重渲染。当事件频率较高（如初始补偿 30 条 flow tick + 每 3s 一条），连续的同步渲染阻塞点击、输入等用户交互。

**修复范式**：

```text
✅ import { startTransition } from "react"
✅ 在 SSE 事件处理器中用 startTransition(() => setState(...)) 包裹
✅ startTransition 将此次更新标记为低优先级，React 可中断它以处理用户输入
```

**参考文件**：[intel-stream-context.tsx](apps/web/src/contexts/intel-stream-context.tsx)（onFlowTick / onSignalDetected 中的 startTransition）

### 反模式 5：SSE 连接/重连逻辑中重复内联事件处理器

**现象**：`useEffect`（首次连接）和 `reconnect` 回调中各自内联了完整的事件处理器对象（~80 行），代码重复且优化改动（如加 `startTransition`）容易遗漏一处。

**修复范式**：

```text
✅ 使用 useCallback(() => ({ onConnect, onFlowTick, ... }), []) 创建工厂函数
✅ useEffect 和 reconnect 都调用 createHandlers() 获取处理器
✅ 确保所有优化（startTransition、getState 等）在一处生效
```

**参考文件**：[intel-stream-context.tsx](apps/web/src/contexts/intel-stream-context.tsx)（`createHandlers` 工厂函数）

### 反模式 6：在组件渲染函数内定义不变的配置数组

**现象**：KPI 指标定义数组（`platformKpis`、`executionKpis` 等）写在组件函数体内，每次渲染都创建新的数组引用。

**修复范式**：

```text
✅ 将纯配置数据提取到组件外部（模块顶层 const）
✅ 确保配置不依赖任何 props/state，可以在模块加载时一次性创建
✅ 如果配置需要引用图标组件（如 lucide-react 的 Activity），这是允许的——图标引用是稳定的
```

**参考文件**：[dashboard-client.tsx](apps/web/src/app/(workspace)/dashboard/dashboard-client.tsx)（`platformKpis` / `executionKpis` / `evolutionKpis` 提取到组件外）

### 诊断决策树（卡死问题专用）

当页面出现"完全卡死、点击无响应"时，按以下顺序排查：

```text
1. 检查是否有多个组件/Hook 创建到同一端点的 SSE/WS 连接
   → grep "subscribeXxx\|useXxxStream\|new EventSource" 统计调用次数
   → 修复：创建 Context Provider 统一管理

2. 检查 useEffect 依赖数组是否包含不稳定引用
   → 在效应中加 console.count('effect-run') 快速验证是否频繁执行
   → 修复：用 ref 持有回调，移除出依赖数组

3. 检查是否有昂贵的资源（WebGL context、大 DOM 树）在效应中被反复创建/销毁
   → 搜索 new WebGLRenderer / new Worker / new ResizeObserver
   → 修复：拆分创建/更新效应

4. 检查 Zustand store 更新是否触发全组件树重渲染
   → React DevTools Profiler 查看 commit 频率和范围
   → 修复：精准 selector + useShallow + getState() 替代 selector hooks
```

## 11.8 L4 服务端阻塞反模式（v3.42.05 实战经验）

以下经验来自 2026-06-24 对【行业情报中心】Agent 工作流执行导致全站卡死的三轮诊断。

### 反模式 7：同步文件 I/O 在热路径上无缓存

**现象**：页面完全卡死后，不仅是当前页面，**整个站点所有 API 都无响应**（curl /api/health 也超时）。表明问题不在前端，而在 Node.js 事件循环被阻塞。

**根因链路**：
```
heartbeat-scheduler 每 10s 检查 → A2 Agent 每 3s 触发 → runAgent()
  → loadIndustryManifest(packId)   ← 无缓存！每次都 readFileSync()
  → readFileSync("manifest.yaml")  ← 同步阻塞事件循环 ~10-50ms
  → yaml.parse(rawText)            ← 同步 CPU 密集解析 ~5-20ms
  → 期间 NO OTHER requests processed（SSE、API、Page 全部卡住）
```

**为什么之前没发现**：readFileSync 单次耗时 10-50ms，在低频场景下可忽略。但 A2 Agent 每 3 秒触发一次，加上 A1/A3/A5 启动时并发执行，同步 I/O 频繁阻塞事件循环，导致 SSE 断流、API 超时、页面无响应。

**诊断方法**：
```
1. 确认是服务端阻塞：curl /api/health 是否也超时？是 → 服务端问题
2. grep "readFileSync\|existsSync\|readdirSync" 找到同步 I/O 调用
3. 检查这些调用是否在热路径上（定时器、高频回调、请求处理）
4. 在调用处加 console.time/timeEnd 测量耗时
```

**修复范式**：

```text
✅ SDK 内部函数添加进程级缓存（Map），首次加载后永久缓存
✅ 热路径函数在逻辑开头检查缓存，命中则直接返回
✅ 缓存 key = packId（单进程内 pack 不会变）
✅ 若需支持热更新，用 fs.watch + 缓存失效，而不是去掉缓存
```

**参考修复**：[loader.ts](packages/industry-pack-sdk/src/loader.ts) — `loadIndustryManifest` 添加 `manifestCache.has(packId)` 检查

### 反模式 8：async 函数内调用同步 I/O ≠ 异步

**认知纠正**：`async function` 内部调用 `readFileSync` **仍然阻塞事件循环**。`async` 只是让函数返回 Promise，不改变内部代码的同步/异步性质。

```ts
// ❌ 错误认知："函数是 async 的，所以不会阻塞"
async function loadManifest(id: string) {
  const raw = readFileSync("manifest.yaml")  // ← 同步阻塞！整个事件循环卡住
  return parse(raw)
}

// ✅ 正确做法 1：使用异步 I/O
async function loadManifest(id: string) {
  const raw = await fs.readFile("manifest.yaml", "utf-8")
  return parse(raw)
}

// ✅ 正确做法 2：添加缓存（次优但有效）
const cache = new Map<string, Manifest>()
function loadManifest(id: string) {
  if (cache.has(id)) return cache.get(id)!  // ← 缓存命中，零 I/O
  const raw = readFileSync("manifest.yaml")
  const m = parse(raw)
  cache.set(id, m)
  return m
}
```

## 11.6 优化提交规范

每次性能优化 commit 必须包含：
1. **问题描述**：哪个页面、多慢、复现步骤
2. **根因分析**：具体到哪个文件、哪个函数、哪个查询
3. **实测数据**：优化前/后的 `curl -w "%{time_total}"` 或 React Profiler 截图
4. **影响范围**：是否影响其他页面或 API

---

# 12. Intel 沙盒架构（v3.42.05 新增）

## 12.1 背景

行业情报中心的 Agent 执行引擎（heartbeat-scheduler / agent-runner / skill-executor）存在
同步 I/O（readFileSync / yaml.parse）、外部 API 调用（Tavily / DeepSeek）、数据库写入
等阻塞操作。v3.42.04 之前这些操作与 Next.js Web 服务运行在同一进程中，导致事件循环
周期性阻塞，使 SSE 断流、API 超时、页面卡死。

## 12.2 架构决策

按 **方案 B（独立子进程）** 将 Agent 执行引擎分离到沙盒进程中：

```
apps/web/                       # Next.js — 纯展示层
  ├── SSE 代理 → localhost:3001  # 代理沙盒 SSE 流
  ├── API 路由                   # 只读查询（getKpiSnapshot / getKnowledgeGraph）
  └── sandbox/server.ts          # 沙盒 HTTP 服务器入口

通信方式：
  Web → Sandbox:  HTTP GET /stream（SSE 代理）
  Sandbox → Web:   SSE 事件流（Web 反向代理到客户端）
  共享状态:        Prisma SQLite（双方独立连接，WAL 模式并发读写）
```

## 12.3 沙盒端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `localhost:3001/health` | GET | 健康检查，返回 uptime + Agent 状态 + 内存使用 |
| `localhost:3001/stream` | GET | SSE 事件流（与旧 /api/v1/stream/industry-intel 协议兼容） |

## 12.4 Web 代理层

`apps/web/src/app/api/v1/stream/industry-intel/route.ts`：
1. 请求到达 → 先检查沙盒可用性（fetch `localhost:3001/health`，2s 超时）
2. 沙盒在线 → 代理模式：fetch 沙盒 SSE 流，pipe 到客户端（响应头 `X-Intel-Sandbox: proxied`）
3. 沙盒离线 → 降级模式：启动内联调度器（响应头 `X-Intel-Sandbox: fallback`）

降级响应头允许前端面板判断数据源状态并展示相应 UI。

## 12.5 启动方式

```bash
# 方式 1：独立终端
pnpm dev:sandbox    # 启动沙盒（端口 3001）
pnpm dev            # 启动 Next.js（端口 3000）

# 方式 2：双进程
pnpm dev:all        # concurrently 启动两者
```

根 `package.json` 脚本：
- `dev:sandbox` — `cd apps/web && tsx src/lib/server/sandbox/server.ts`
- `dev:all` — `concurrently -n web,sandbox "pnpm dev" "pnpm dev:sandbox"`

## 12.6 文件清单

| 文件 | 角色 |
|------|------|
| `apps/web/src/lib/server/sandbox/server.ts` | 沙盒 HTTP 服务器入口 |
| `apps/web/src/lib/server/agent-runtime/*.ts` | Agent 执行引擎（沙盒和 Web 共享） |
| `apps/web/src/app/api/v1/stream/industry-intel/route.ts` | Web SSE 代理端点 |
| `packages/industry-pack-sdk/src/loader.ts` | manifestCache 缓存修复 |

## 12.7 路径导入规范（沙盒兼容）

沙盒进程使用 `tsx` 直接运行 TypeScript，不支持 `@/` 路径别名。
所有被沙盒直接或间接导入的模块必须使用**相对路径导入**。

已从 `@/` 改为相对路径的文件：
- `src/lib/prisma.ts` — `@/generated/prisma-v2/client` → `../generated/prisma-v2/client`
- `src/lib/server/agent-log.ts` — `@/lib/prisma` → `../prisma`
- `src/lib/server/llm-provider.ts` — 3 处 `@/` → 相对路径
- `src/lib/server/harness-llm.ts` — 3 处 `@/` → 相对路径
- `src/lib/server/agent-runtime/heartbeat-scheduler.ts` — 2 处 `@/` → 相对路径
- `src/lib/server/agent-runtime/agent-runner.ts` — 3 处 `@/` → 相对路径
- `src/lib/server/agent-runtime/skill-executor.ts` — 2 处 `@/` → 相对路径

**规则**：新增文件如需被沙盒导入，禁止使用 `@/` 别名，一律使用相对路径。

---

# 13. 性能优化实战复盘（v3.42.05 五轮诊断）

## 13.1 事件经过

2026-06-24，【行业情报中心】和【行业动态】页面反复卡死，历时 6 小时、5 轮诊断、
14 个文件修改，最终通过**切换 PostgreSQL**彻底解决。以下是完整复盘。

## 13.2 五轮诊断时间线

| 轮次 | 怀疑目标 | 实际发现 | 修复 | 效果 |
|------|----------|----------|------|------|
| 1 | 客户端渲染 | 6 重 SSE 连接导致渲染风暴 | IntelStreamContext 去重 | 好转但仍卡 |
| 2 | useEffect 依赖 | recordFrame 导致 WebGL 场景反复重建 + GPU 内存泄漏 | 拆分效应 + dispose | 好转但仍卡 |
| 3 | 服务端 I/O | loadIndustryManifest 无缓存，每 3s readFileSync 阻塞事件循环 | manifestCache | 好转但仍卡 |
| 4 | 架构耦合 | 沙盒和 Web 双调度器并发写 DB | 沙盒上线自动停内联调度器 | 好转但仍卡 |
| 5 | **数据库驱动** | **BetterSqlite3 是同步驱动，所有查询串行阻塞事件循环** | **切换 PostgreSQL (Neon)** | **彻底解决** |

## 13.3 为什么前四轮没彻底解决

```
每一轮都修复了一个真实存在的性能问题，但都不是最底层根因：

第 1 轮：减少了 83% 的 SSE 连接 → 渲染压力降了，但主线程仍被 DB 阻塞
第 2 轮：消除了 GPU 泄漏 → 长期使用不崩了，但首次加载仍慢
第 3 轮：消除了 sync I/O → Agent 执行不阻塞了，但 Prisma 查询仍阻塞
第 4 轮：停止了双调度器 → DB 写入压力降了，但单次查询仍阻塞事件循环
第 5 轮：切换异步驱动 → 查询不再阻塞事件循环 → 一劳永逸
```

**核心教训**：性能问题的真正根因往往不在你第一眼看到的地方。
前四轮修复的都是**症状**（SSE 连接数、GPU 泄漏、sync I/O、调度器并发），
而非**病因**（同步数据库驱动）。

## 13.4 关键洞察

### 洞察 1：`async function` ≠ 不阻塞

```ts
// ❌ 常见误区
async function getData() {
  return prisma.xxx.findMany()  // BetterSqlite3 适配器 → 同步执行！
}
// 虽然函数返回 Promise，但内部同步阻塞了事件循环
```

**判断方法**：`curl /api/health` 是否也超时？是 → 服务端事件循环被阻塞。

### 洞察 2："卡死"≠"慢"

- **慢**：页面加载 3-5 秒，但期间可以切换标签页、滚动
- **卡死**：整个浏览器/页面无响应，点击任何按钮无效

卡死 = 主线程被同步操作长时间占用。排查方向：
1. 先确认是客户端还是服务端：`curl /api/health` 超时 = 服务端
2. 服务端卡死 → 检查同步 I/O / 同步 DB 驱动
3. 客户端卡死 → 检查无限渲染循环 / WebGL 泄漏 / 大 JS 解析

### 洞察 3：环境变量是无声杀手

Next.js 在 monorepo 中只加载 `apps/web/.env*`，**不加载**根目录 `.env`。
`DATABASE_URL` 写了根 `.env` 但 Next.js 读不到 → Prisma 连接 `localhost:5432`
（fallback）→ 查询挂起 30s 超时 → 页面卡死。

**教训**：改环境变量后必须验证是否生效。`curl /api/health` 不一定测到 DB 连接。

### 洞察 4：Prisma 7 的破坏性变更

Prisma 7 移除了 schema 中的 `url`、`datasourceUrl` 构造函数参数，
改用 `adapter` 模式。但 `prisma.config.ts` 在 v7.8.0 存在解析 bug，
只能用 Prisma 6 CLI 做 `db push`，Prisma 7 做运行时。

**教训**：大版本升级先读 changelog，不要在调试中同时处理多个变更。

## 13.5 优化效果排序（按实际收益）

| 排名 | 优化 | 收益 | 成本 |
|------|------|------|------|
| **1** | **SQLite → PostgreSQL** | 事件循环彻底解放 | 高（需外部 DB） |
| 2 | SSE 连接去重（6→1） | 渲染频率降 83% | 低 |
| 3 | WebGL 资源 dispose | 长期内存稳定 | 低 |
| 4 | manifestCache 缓存 | sync I/O 消除 | 低 |
| 5 | 沙盒进程分离 | Agent 隔离 | 中 |

## 13.6 新增反模式清单（§11.7 + §11.8 汇总）

| # | 反模式 | 诊断信号 | 修复 |
|---|--------|----------|------|
| 1 | 多组件各自创建 SSE/WS | 同一 endpoint 被连接 N 次 | Context Provider |
| 2 | useEffect 依赖不稳定函数引用 | effect 频繁执行 | ref 持有回调 |
| 3 | Store selector 进入 effect deps | interval/连接反复重建 | getState() |
| 4 | 数据流更新阻塞交互 | 页面操作无响应 | startTransition |
| 5 | SSE 连接/重连逻辑重复 | 优化改动遗漏 | 工厂函数 |
| 6 | 渲染函数内定义配置数组 | 每帧重建引用 | 提取到组件外 |
| 7 | sync I/O 无缓存（热路径） | 每 3s 读盘阻塞 | 进程级缓存 |
| 8 | async 内调用 sync I/O | 误以为不阻塞 | 缓存或用真异步 |
| 9 | **同步 DB 驱动** | **curl /api/health 超时** | **切换 PostgreSQL** |
| 10 | env 放错目录 | DB 连接 fallback 到 localhost | `apps/web/.env.local` |
| 11 | Prisma 大版本升级未测试 CLI | db push 失败 | 降级 CLI 或 migrate |
| **12** | **SSE/WS 在编译完成前连接** | **全站 Failed to fetch 死亡螺旋** | **dev 模式禁用或延迟连接** |
| 13 | SSE 推送频率过高触发全面板重渲染 | 单页面停留时主线程卡死 | 限流渲染更新间隔（3s→15s） |

---

# 14. 死亡螺旋：SSE 编译触发全站雪崩（v3.42.05 终局根因）

## 14.1 现象

所有页面间歇性 `Failed to fetch RSC payload`，点击任意链接无响应，
持续 30-60 秒后恢复，然后再次触发。日志显示 `○ Compiling /api/...` 每次
伴随一轮全站不可用。

## 14.2 根因链路

```
浏览器加载页面
  → React 渲染 AppShell
    → OpenClawStreamBridge 挂载
      → useOpenClawStream() 建立 SSE 连接
        → fetch("/api/openclaw/events")
          → 该端点首次访问 → Turbopack 冷编译（5-15 秒）
            → 编译期间 fetch 挂起 → 超时 → "network error"
              → useOpenClawStream 触发重连
                → 新的 fetch → 再次命中编译（或其他页面的编译）
                  → 又一次超时 → 指数退避重试
                    → 3-5 次重试后服务器被请求淹没
                      → 所有 RSC payload 返回 Failed to fetch
                        → 用户感觉"卡死"
```

**关键**：不是"一个连接失败"，是**编译→超时→重连→编译→…正反馈循环**。
每个重试请求都可能在触发另一个页面的冷编译，形成永不停歇的雪崩。

## 14.3 为什么前 11 条反模式都没抓到它

前 11 条都是**单点故障**——一个组件出问题，修复它就好了。
第 12 条是**系统性正反馈**——一个组件的问题会传染给所有其他组件。

诊断时每轮观察到的症状不同（有时是 SSE 报错、有时是 RSC 失败、
有时是数据库查询慢），因为雪崩的表现取决于哪个请求先超时。

## 14.4 修复

```tsx
// app-shell.tsx — dev 模式禁用 OpenClawStreamBridge
const OpenClawStreamBridge =
  process.env.NODE_ENV === "production"
    ? dynamic(() => import("./openclaw-stream-bridge")...)
    : () => null;  // ← dev 模式零开销
```

## 14.5 诊断方法

当遇到"所有页面间歇性 Failed to fetch"时：

```text
1. 查看 Next.js dev log: tail -f .next/dev/logs/next-development.log
2. 搜索 ○ Compiling 出现时机是否与用户报错时间重合
3. 如果每次 Failed to fetch 前都有 ○ Compiling → 就是 SSE/WS 在编译完成前连接
4. 修复：dev 模式禁用非必要 SSE/WS 连接，或延迟到页面 fully loaded 后再连接
```

## 14.6 SSE 推送频率导致客户端主线程卡死（反模式 13）

### 现象

OpenClawStream 死亡螺旋修复后，全站导航恢复。但单独停留在【行业情报中心】
页面一段时间后，点击其他板块再次无响应。服务器日志完全静默——浏览器根本没发请求。

### 根因

IntelStreamProvider 每收到一个 SSE flow tick（沙盒 mock 每 3s 推送一次），
就更新 context value → 触发全部 8 个消费者重渲染：

```
flow tick (每 3s)
  → setFlowTickVersion(v => v + 1)
    → Context value 变化
      → IntelTopBar 重渲染
      → Panel1 重渲染
      → Panel2 重渲染
      → Panel3 (Three.js) 重渲染 ← 最重，每次渲染都要 diff 500 节点
      → Panel4 重渲染
      → Panel5 重渲染
      → CommandTicker 重渲染
      → ThreatAlertModal 重渲染
```

8 个组件 × 每 3 秒 = 持续的渲染压力。Panel3 的 Three.js 场景每次
重渲染虽不重建 GPU 资源（之前已修复），但 React diff + useMemo 重新计算
仍消耗主线程。浏览器主线程饱和后无法处理点击事件→"卡死"。

### 修复

```tsx
// IntelStreamContext — 数据照收（写入 ref），渲染限流到 15s
const MIN_UPDATE_INTERVAL_MS = 15_000;
const lastRenderTriggerRef = useRef(0);

onFlowTick: (event) => {
  // 数据始终实时写入 ref
  flowTicksRef.current.push(tick);
  // 渲染更新限流
  const now = Date.now();
  if (now - lastRenderTriggerRef.current >= MIN_UPDATE_INTERVAL_MS) {
    lastRenderTriggerRef.current = now;
    startTransition(() => setFlowTickVersion(v => v + 1));
  }
}
```

### 效果

- SSE 数据实时写入缓冲区（不丢数据）
- React 重渲染从 20 次/分钟降到 4 次/分钟
- 主线程压力降到 1/5，不再饱和

## 14.7 教训

| 教训 | 说明 |
|------|------|
| **正反馈 > 单点故障** | 系统性正反馈循环比任何单个 bug 都危险，破坏力指数级放大 |
| **dev 模式不是生产** | 生产环境无冷编译，dev 模式的编译延迟会暴露生产不存在的 race condition |
| **日志是唯一真相源** | curl 测试看不到问题因为请求不经过浏览器→AppShell→SSE 链路 |
| **先看时间线再看代码** | 按时间戳排列日志事件比读源码更快定位根因 |
| **静默日志 = 客户端卡死** | 服务器零日志活动 + 用户说卡死 = 主线程被 JS 阻塞 |
| **并发订阅 = 连接洪水** | 6 面板同时订阅 → 6 条 SSE 连接 → 淹没服务器 | Promise 锁确保单例连接 |
| **生产模式 > dev 模式** | dev 模式冷编译是物理天花板 | `next build && next start` 根治 |

---

# 15. 最终架构决策与速度优化总纲（v3.42.05 终版）

## 15.1 核心认知

经过 7 小时、14 轮诊断、20+ 文件修改，得出一个根本结论：

> **"卡死"不是单一 bug，是系统性正反馈循环。修复必须从架构层面切断循环链路。**

## 15.2 三条正反馈循环（全部已修复）

### 循环 1：SSE 编译死亡螺旋
```
OpenClawStream 连接 → /api/openclaw/events 冷编译 → 超时
  → 重连 → 再次编译 → 全站 Failed to fetch
```
**修复**：dev 模式禁用 OpenClawStreamBridge（`() => null`）

### 循环 2：Context 推送渲染风暴
```
SSE flow tick (每 3s) → Context value 变化 → 8 面板全重渲染
  → Panel3 Three.js 阻塞主线程 → 点击无响应
```
**修复**：IntelEventBus 事件总线替代 Context，每面板独立订阅

### 循环 3：并发订阅连接洪水
```
6 面板同时 mount → 6 次 ensureSSE() → 6 条并发 fetch
  → 服务器被淹没 → 新一轮超时重连
```
**修复**：Promise 锁确保全局唯一 SSE 连接

## 15.3 最终技术栈

| 层 | 决策 | 原因 |
|------|------|------|
| 数据库 | **本地 PostgreSQL** | 0ms 延迟，真正异步，不阻塞事件循环 |
| 开发运行 | **`next build && next start`** | 零冷编译，根治 dev 模式物理天花板 |
| SSE 架构 | **IntelEventBus（单例 + Promise 锁）** | 每面板独立订阅，互不触发重渲染 |
| SSE 沙盒 | **独立进程 localhost:3001** | Agent 执行隔离，崩溃不影响主站 |
| 客户端渲染 | **事件总线 + 本地 state** | 替代 Context 推送，精确订阅 |

## 15.4 速度优化检查清单

以后遇到"页面卡死"，按此清单排查：

```text
□ 1. 先看日志：tail .next/dev/logs/next-development.log
□ 2. 搜索 ○ Compiling — 是否在故障时间出现？
□ 3. 搜索 SSE/WS 连接日志 — 是否有重复连接？
□ 4. curl /api/health — 服务端是否响应？
□ 5. 服务端正常 + 浏览器卡死 = 主线程阻塞 → 查 Three.js/重渲染
□ 6. 全站 Failed to fetch = 死亡螺旋 → 查 SSE/WS 连接时机
□ 7. 最终手段：next build && next start（生产模式消除所有编译延迟）
```

## 15.5 禁止事项

- ❌ 在 dev 模式下用 Webpack（冷编译 45s vs Turbopack 5s）
- ❌ 在 Context 中推送高频数据（每秒 >1 次的更新用事件总线）
- ❌ 创建多条到同一端点的 SSE 连接（用单例 + Promise 锁）
- ❌ 页面首次渲染时同步加载 Three.js（用 setTimeout 延迟）
- ❌ 在 SSR 中对空 DB 执行聚合查询（先检查 Workspace 存在性）
- ❌ 把 DATABASE_URL 放在 monorepo 根 .env（Next.js 不加载）
# 14. AI 输出格式工程约束

## 14.1 最小格式化原则

所有 Hermes 生成的面向用户文本，默认使用自然段落。仅当内容满足以下条件之一时，才允许使用列表、表格或标题：

- 需要并列比较 3 个或以上不同维度的对象
- 步骤之间有明确先后顺序依赖
- 用户明确请求列表或报告格式
- 内容包含代码、配置或技术规范

禁止为了让响应「看起来更专业」或「更完整」而添加不必要的结构化格式。

## 14.2 业务语言翻译强制规则

所有将系统内部状态展示给用户的代码实现，必须经过业务语言翻译层处理。以下反模式禁止出现在任何面向用户的 UI 组件或 API 响应中：

```ts
// ❌ 禁止：直接暴露技术状态
{ message: "kpiDriftIndex > 0.20, proposal.create triggered, connectorSuccessRate: 0.82" }

// ✅ 正确：业务语言翻译后输出
{ message: "AI 检测到本月询盘跟进成功率下降，已生成工作流优化提案，等待您审批" }

// ❌ 禁止：直接暴露内部 ID 作为主标识
{ title: `任务 ${taskId} 已完成` }

// ✅ 正确：使用业务名称
{ title: `「本周高价值询盘跟进」工作流已完成` }
```

## 14.3 信息分级展示实现规范

所有任务结果展示组件必须实现两个信息层：

- **摘要层（默认显示）**：业务语义结果，无技术术语，用户无需理解系统内部即可读懂
- **详情层（用户展开后显示）**：ExecutionEvent 流、ActionReceipt、AuditLog 链接、taskId 等技术细节

实现方式：使用可折叠面板（Collapsible）或「查看详情」展开交互，不得将两层信息混排在同一视图。

## 14.4 错误与拒绝信息规范

所有面向用户的错误提示和操作拒绝信息，必须包含三段结构：

1. **发生了什么**（用业务语言描述，不用错误码）
2. **为什么**（简短解释根本原因）
3. **下一步可以做什么**（至少一个可操作建议）

```ts
// ❌ 禁止
{ error: "AutomationGateError: L3 requires approval checkpoint" }

// ✅ 正确
{ 
  message: "这个操作需要您的审批授权才能执行",
  reason: "批量发送邮件属于高风险操作，系统需要确认您已审阅收件人列表",
  nextStep: "审批请求已发送至您的审批中心，点击「查看审批」即可处理"
}
```

## 14.5 禁止的输出反模式

- ❌ 在用户未请求的情况下输出完整的技术调用链路
- ❌ 在业务摘要中使用 `taskId`、`workflowRunId`、`connectorId` 等内部字段名
- ❌ 将 AuditLog 条目直接作为用户通知推送
- ❌ 在对话回应中使用超过二级的标题层级（`###` 以上）
- ❌ 在拒绝或错误信息中使用列表枚举禁止原因
