# CLAUDE.md — HermesClaw 工程协作与实现约束
## 版本：v3.0
## 日期：2026-06-21

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

## 11.6 优化提交规范

每次性能优化 commit 必须包含：
1. **问题描述**：哪个页面、多慢、复现步骤
2. **根因分析**：具体到哪个文件、哪个函数、哪个查询
3. **实测数据**：优化前/后的 `curl -w "%{time_total}"` 或 React Profiler 截图
4. **影响范围**：是否影响其他页面或 API