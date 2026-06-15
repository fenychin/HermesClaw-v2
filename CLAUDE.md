# CLAUDE.md — HermesClaw 工程协作与实现约束
## 版本：v1.3
## 日期：2026-06-14

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

## 3.1 当前阶段（v0.x）：单 Next.js 应用 + 内部分层

为降低 MVP 阶段的工程复杂度，本仓库当前**不采用 pnpm monorepo**，而是用单 Next.js 应用配合明确的目录边界来近似 monorepo 各 package / service 的角色：

| 物理目录 | 等价角色 | 说明 |
| --- | --- | --- |
| `src/app` | apps/web | 视图层 + Route Handler，不得直接持有核心业务规则 |
| `src/contracts` | packages/event-contracts + packages/harness-schema | 全部契约对象（TaskEnvelope / ExecutionEvent / HarnessBundle / IndustryManifest 等）的 zod 单源定义 |
| `src/lib/server` | services/hermes-core + services/openclaw-runtime | 控制核与执行运行时的内部实现，只通过 `src/contracts` 与 `src/lib/server/adapters/*` 互通 |
| `src/lib/server/adapters/hermes` | hermes adapter | Hermes API 客户端，版本锁定 + Mock 降级 |
| `src/lib/server/adapters/openclaw` | openclaw adapter | OpenClaw API 客户端 + ExecutionEvent 总线 |
| `src/lib/industry-pack-sdk` | packages/industry-pack-sdk | 行业包装载、校验、Schema、prompt/DAG/steps 加载 API |
| `industry-packs/<pack-id>/` | 行业包资产 | 每个 pack 自包含 manifest + agents + workflows + prompts + skills + connectors（按 §6.2） |
| `prisma/` | infra/db | 数据库 schema 与 seed 脚本 |
| `.claude/` | infra/skills | Claude Code skills（外贸技能模板） |

## 3.2 目录边界（无论是否拆 monorepo 都必须遵守）

- `src/app/` 不得包含核心业务规则；从 `src/lib/server/*` 获取数据，从 `src/contracts/*` 获取类型。
- `src/lib/server/` 内部模块只通过 `src/contracts` 与 `src/lib/server/adapters/*` 跨域通信，**禁止跨 service 直接 import 私有实现**（例：未来若 hermes/ 与 openclaw/ 拆分，二者只能通过契约对象互相访问）。
- `src/contracts/` 只放协议 schema，**不得 import `src/lib/server/*`**（防止反向依赖）。
- `src/lib/industry-pack-sdk/` 只放行业包装载与校验逻辑，**不写任何具体行业的业务实现**；具体行业逻辑必须落在 `industry-packs/<pack-id>/`。
- `industry-packs/<pack-id>/` 不得侵入 Hermes / OpenClaw 核心代码；与核心通信必须经由 SDK 公开的注入点（manifest + agents + workflows + prompts + skills）。
- 任何在 `src/lib/server/` 中出现的特定 `industryId` 字面量（如 `"foreign-trade"`）都视为 anti-pattern；处理方式：通过参数传入或从 `WorkspaceContext` / `Workflow.industryId` 派生。

## 3.3 演进路线（v0.13+）

当 Hermes Core / OpenClaw Runtime 需要独立部署或被替换内核时，按以下顺序正式拆分为 pnpm workspace：

1. 抽 `packages/event-contracts`（来源：`src/contracts/`）
2. 抽 `packages/harness-schema`（来源：`src/contracts/harness-*.ts`、`industry-manifest.ts`）
3. 抽 `packages/industry-pack-sdk`（来源：`src/lib/industry-pack-sdk/`）
4. 拆 `services/hermes-core` 与 `services/openclaw-runtime`（来源：`src/lib/server/` 中的对应模块）
5. 把 `src/app/` 重命名为 `apps/web/`

届时本节升级为：

> 采用 monorepo 目录结构：`apps/web`、`services/hermes-core`、`services/openclaw-runtime`、`packages/event-contracts`、`packages/harness-schema`、`packages/industry-pack-sdk`、`packages/shared-types`、`infra/docker`。
> 目录边界与 §3.2 保持一致。

在拆分完成前，**§3.2 的目录边界等价生效**，违反任何一条都视为破坏未来的可拆分性。

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
- CI 必须断言生产环境下不存在 dev 旁路开关：
  - `NODE_ENV === "production"` 时 `DEV_BYPASS_AUTH` 与 `E2E_BYPASS_RBAC` 均不得为 `"true"`；任一为真则构建失败。
- CI 必须运行 `check:middleware` 脚本，断言 `middleware.ts` 与 `src/middleware.ts` 去除注释后完全一致。

---

# 11. 开发环境旁路开关

## 11.1 DEV_BYPASS_AUTH 与 E2E_BYPASS_RBAC

以下两个环境变量 **仅** 用于本地开发与 CI 冒烟测试，**生产部署必须不配（或显式置空）**：

- `DEV_BYPASS_AUTH=true` —— 在 middleware 层放行无 cookie 调用特定 API 路由（`/api/openclaw/events`、`/api/openclaw/checkin`、`/api/harness/evaluate-event`、`/api/task` 系列）。
  该变量**无** production 守卫（历史既有），运维须在部署配置中确保不设。
- `E2E_BYPASS_RBAC=true` —— 在 `/api/task/dispatch` route handler 内跳过 `withRBAC("MEMBER")`，但仍走 `buildWorkspaceContext` 保留 workspace 隔离与审计。
  该变量**有** `NODE_ENV !== "production"` 守卫，生产即使误配也会被忽略。

## 11.2 INTERNAL_TASK_CALLBACK_TOKEN

M2M 端点（dispatch、evaluate-event）的内部 token 校验：
- 生产：必须配 `INTERNAL_TASK_CALLBACK_TOKEN`，请求必须带 `x-internal-token` 头且值相等。
- dev/CI：可不配，由 `NODE_ENV !== "production"` 守卫默认放行。
- 校验逻辑统一使用 `src/lib/server/shared/internal-auth.ts` 中的 `checkInternalToken` / `buildInternalCallbackHeaders`。

## 11.3 middleware 双文件同步

当前项目保留 `middleware.ts` 与 `src/middleware.ts` 两份文件（Next.js 16 turbopack/Webpack 加载顺序未文档化）。两份文件必须保持**运行时行为完全一致**（允许文件头注释不同）。改其中一份必须改另一份。CI 通过 `pnpm check:middleware` 脚本去注释比对。

---

# 12. OpenClaw → Hermes 终态回调

- 当 `ExecutionEvent.status ∈ {completed, failed}` 时，`/api/openclaw/events` 的 POST handler **必须** 同步回调 `/api/harness/evaluate-event`。
- `workspaceId` 由 Hermes 侧通过 `taskId` 反查 `IdempotencyKey` 表得到（`src/lib/server/shared/task-lookup.ts`），OpenClaw 不持有 workspace 上下文。
- 反查不到 workspaceId 时，`/api/harness/evaluate-event` **必须** 返回 422（`TASK_WORKSPACE_NOT_FOUND`），不得降级到默认 workspace（防止跨租户指标污染）。
- 任务派发时若 `clampAutomationLevel` 实际降低客户端请求的等级，**必须** 写一条 `automation.level.change` 审计（`targetType=task`）。