# CLAUDE.md — HermesClaw 工程协作与实现约束
## 版本：v1.2
## 日期：2026-06-12

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

建议采用 monorepo 目录结构：

- `apps/web`  
- `services/hermes-core`  
- `services/openclaw-runtime`  
- `packages/event-contracts`  
- `packages/harness-schema`  
- `packages/industry-pack-sdk`  
- `packages/shared-types`  
- `infra/docker`  

约束：

- `apps/web` 不得包含核心业务规则，只作为视图层与 API 调用方。  
- `services/hermes-core` 负责控制逻辑与治理，只通过 `packages/*` 访问公共契约，不直接依赖 `services/openclaw-runtime` 的内部模块。  
- `services/openclaw-runtime` 负责执行与事件，只通过 `packages/event-contracts` 与 `packages/shared-types` 与 Hermes 通信，不反向依赖 `services/hermes-core`。  
- `packages/event-contracts` 只放协议 schema（TaskEnvelope / ExecutionEvent / ExecutionSummary / CapabilityRegistration 等）。  
- `packages/harness-schema` 只放 Harness Runtime 对象定义（AgentPolicy / WorkflowTemplate / EvalRuleSet 等）。  
- `packages/industry-pack-sdk` 只放行业包装载与校验逻辑，不写任何具体业务实现。  
- `packages/shared-types` 放通用类型，不放具体服务端依赖。  
- `infra/docker` 仅包含部署脚本与镜像打包配置，不放业务逻辑。

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