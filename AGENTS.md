# AGENTS.md — HermesClaw-v3 项目最高规则文档

> 版本: V3.42.06-dev  
> 项目: HermesClaw  
> 状态: 生效中  
> 最后更新: 2026-06-25

---

## 第〇层：元规则（Meta-Rules）

1. 本文档是 HermesClaw 的最高行为准则，适用于：  
   - 所有控制内核（Hermes 变体或其他符合规范的控制核）  
   - 所有执行运行时（OpenClaw 变体或其他符合规范的执行核）  
   - 所有 Industry Pack、Workflow、Connector、审批流与自动化策略  

2. 任意以下对象，一旦与本文件冲突，均以本文件为准：  
   - 本仓库内其他文档（含 PRD、CLAUDE.md 等）  
   - 任意 Prompt / Skill / 行业模板 / 连接器适配层 / 运行时配置  
   - 上游 Hermes / OpenClaw 工作区中的本地 AGENTS/SOUL/TOOLS 约定  

3. HermesClaw 允许替换控制核与执行核实现（例如：  
   - 使用 Hermes Agent 作为 Hermes Control Kernel  
   - 使用 OpenClaw 作为 Execution Runtime  
   - 或自研内核），前提是必须完整满足本文件的契约、边界与安全治理要求。

4. 组织级 AGENTS.md 与上游工作区 AGENTS/SOUL/TOOLS 的关系：  
   - 本文件为「组织级 / 多租户级」约束，定义系统级边界。  
   - 上游 runtime 的 `AGENTS.md / SOUL.md / TOOLS.md / SKILL.md` 视为「节点级实现细则」，可在本规则允许的范围内自由扩展，但不得削弱或绕过本规则。  
   - 出现冲突时，必须通过配置与兼容层调整上游行为，而不是直接修改本文件。

---

## 第一章：系统重新定义

### 1.1 一句话定义

HermesClaw 不是「简单把 Hermes Agent 与 OpenClaw 打包」的工程项目。

HermesClaw 是面向中小企业的 AI 数字员工操作系统，由三大运行域组成：

- **Hermes Control Kernel**：控制内核，负责意图理解、规划、记忆、编排、策略、治理与进化。  
- **OpenClaw Execution Runtime**：执行运行时，负责多通道会话、连接器动作、设备协作、现场数据采集与事件回传。  
- **Industry Pack Layer**：行业插件层，负责行业模板、岗位技能、知识包、工作流模板、指标模型与连接器映射。

### 1.2 三域原则

- Hermes 不直接承担具体渠道 / 设备的常驻执行职责。  
- OpenClaw 不拥有最终策略解释权与治理权。  
- Industry Pack 不得侵入 Hermes / OpenClaw 核心代码，仅通过公开 schema 注入资产。  
- 任一行业能力必须可装载、可停用、可升级、可回滚。  
- 所有高风险动作必须经治理门禁，不得因执行便利绕过 Hermes。

### 1.3 AI-First 再定义

HermesClaw 的 AI-First 不是「AI 直接改代码」，而是：

- AI 优先完成：规划 → 执行 → 反馈 → 评估 → 提案。  
- 人类负责：边界设定 → 审批 → 复盘 → 追责。  
- 系统进化优先作用于 Harness Runtime 对象（策略 / 工作流 / 记忆 / 连接器策略等），源码变更必须经过人工工程流程。

---

## 第二章：三域架构与所有权

### 2.1 Hermes Control Kernel

Hermes 是唯一控制内核，拥有以下所有权：

- Intent 解释权（将自然语言目标结构化为 Task / Workflow）  
- Workflow 生成与编排权（DAG Workflow + Node 配置）  
- Memory 管理权（会话 / 项目 / 组织三级记忆）  
- Model Router 策略权（模型与推理参数路由）  
- Harness Evaluation / Proposal / Approval / Rollback 治理权  
- Agent Policy 最终解释权与冲突裁决权  
- Audit 真相源（治理与策略变更的 Source of Truth）

Hermes 不负责：

- 直接托管所有外部渠道会话（交由 Runtime）  
- 直接承担设备常驻代理与在线状态维护  
- 在未注册执行能力的情况下发起盲目动作

### 2.2 OpenClaw Execution Runtime

OpenClaw 是执行运行时，拥有以下所有权：

- Channel / Device / Connector 的在线状态与路由决策  
- 执行动作的现场上下文（设备状态、网络环境、渠道特性）  
- 任务执行过程状态（排队、执行中、重试、退避等）  
- Action Receipt 与 ExecutionEvent 的事实回传  
- 本地 / 移动端代理动作与事件缓冲（例如移动端节点、桌面节点）

OpenClaw 不负责：

- 修改 Agent Policy 或任何 Harness 治理对象  
- 独立变更风险等级与自动化等级设定  
- 决定是否放行高危动作（如资金、删除、对外承诺）  
- 越过 Hermes 直接执行未授权动作

### 2.3 Industry Pack Layer

Industry Pack 是行业插件层，不是业务代码散装集合。

每个 Industry Pack 必须通过标准 manifest 装载，仅能通过公开 runtime schema 注入以下资产：

- Agent Template  
- Workflow Template  
- Skill Pack  
- Knowledge Pack  
- Connector Mapping  
- Dashboard Schema  
- Eval Rules  
- Domain KPI Model

禁止行业包直接修改：

- Hermes 核心治理逻辑与执行顺序  
- OpenClaw 核心事件协议与 Gateway 配置结构  
- RBAC 机制与租户 / Workspace 边界  
- 审批门禁规则与高危动作白名单

---

## 第三章：运行时契约（Runtime Contracts）

### 3.1 核心契约对象

Hermes 与 OpenClaw 必须通过标准契约通信，不得以内联函数或私有模块耦合。

最小契约对象包括：

- `TaskEnvelope`（任务封装）  
- `ExecutionEvent`（执行事件）  
- `ActionReceipt`（动作回执）  
- `ExecutionSummary`（执行摘要；工程中增加 `summaryId` 字段用于去重与索引，§3.3 最小清单未列此项）  
- `CapabilityRegistration`（能力注册）  
- `ConnectorLease`（连接器使用租约）  
- `HumanApprovalCheckpoint`（人工审批检查点）

#### 3.1.1 Capability Registry 实现（2026-06-15 v3.04.00-dev）
- **Registry 服务**：`apps/web/src/lib/server/capability-registry.ts`
- **版本管理**：使用 `CapabilityVersion`（prisma schema）实现，支持基于内联 semver 语义化排序的版本解析与运行时发现。
- **健康度刷新**：通过 `apps/web/src/app/api/cron/capability-health/route.ts` 每小时自动调度刷新。
- **能力下线**：支持 `deprecate`（仍可用，写 WARNING 审计日志）和 `yank`（立即不可用，彻底阻断并写入 high 风险审计日志）。
- **审计动作**：支持 `capability.registered` / `capability.yanked` / `capability.health.degraded` 审计留痕溯源。

### 3.2 任务真相与执行真相

- Hermes 是 **Task Truth Source**：任务定义、策略、风险等级、自动化等级、审批状态。  
- OpenClaw 是 **Execution Truth Source**：动作是否执行、执行到哪一步、设备 / 连接器在线状态。  
- 最终任务状态由 Hermes 汇总裁定，但不得篡改 OpenClaw 回传的原始执行回执与事件轨迹。

3.2.1 Industry Pack Loader v2 实现（2026-06-15 v3.06.00-dev）
- **Loader 核心**：`apps/web/src/lib/server/industry-pack-loader.ts`
- **Manifest 契约**：`packages/event-contracts/src/industry-pack-manifest.ts`
- **安装流程**：Manifest 校验（非空/SemVer/重复能力 ID/自循环依赖） → 依赖解析与深度检测（最大深度为 5，防无限循环） → 组件表实体创建/更新 → 敏感词前缀转换（如密码等转为 `'env:PLACEHOLDER'`） → 版本化注册至 Registry（已注册视为幂等跳过） → 更新为 `installed` 状态。
- **异常回滚**：注册失败时，遍历已成功注册的能力列表逐一调用 `deprecateCapability` 进行软标记废弃（禁止 deleteMany 物理删除），更新安装状态为 `failed`。
- **卸载策略**：Graceful Deprecation 策略，逐个废弃所安装能力，更新安装记录状态为 `uninstalled`，禁止物理删除任何 Skill / Workflow / Connector 记录。
- **健康度统计**：基于 Capability Registry 的各能力 24h 调用监控，对包整体状态执行聚合计数。
- **数据模型**：`IndustryPackInstallation`（Prisma Schema）。
- **审计动作**：支持 `pack.install.started` / `pack.installed` / `pack.install.failed` / `pack.uninstalled` 等审计留痕。
- **技能 YAML 契约（2026-06-16 v3.16.00-dev）**：配套定义了 `inquiry-grade`、`dev-letter`、`quote-gen`、`customer-profile`、`project-space` 和 `agent-dispatch` 6 套标准的技能定义资产，通过外贸行业包 `manifest.yaml` 进行静态绑定，用于后端的自演化升级与记忆沉淀。

### 3.3 必备字段（最小集）

所有 `TaskEnvelope` 至少必须包含：

- `taskId`  
- `workflowRunId`  
- `workspaceId`  
- `industryId`  
- `agentId`  
- `actionType`  
- `input`  
- `automationLevel`  
- `riskLevel`  
- `idempotencyKey`  
- `callbackTarget`  
- `policySnapshotVersion`  
- `version`（契约版本）

所有 `ExecutionEvent` 至少必须包含：

- `eventId`  
- `taskId`  
- `workflowRunId`  
- `runtimeId`  
- `eventType`（需映射到标准事件族，如 `run.*` / `session.*` / `tool.*`）  
- `status`  
- `timestamp`  
- `payload`  
- `connectorId`（可选）  
- `deviceId`（可选）  
- `receiptHash`（可选）  
- `version`（事件版本）

#### 3.3.1 Built-in Email Connector 实现（2026-06-15 v3.05.00-dev）
- **核心服务**：`apps/web/src/lib/server/connectors/email-connector.ts`
- **核心能力**：
  - **SMTP 发送**：使用 Node.js 原生 `net`/`tls` 进行握手与内容组装，非测试/开发环境下使用真实 socket 发送。
  - **速率限制**：小时级额度校验，在 Prisma 事务中悲观锁定 Connector 记录并原子更新已使用额度；超限时抛出 `RateLimitExceededError`。
  - **模板渲染**：基于 Mustache 格式 `{{key}}` 进行动态替换。若渲染时缺少占位变量，保留原占位符并记 `email.template.warning` 审计日志。
  - **退订链接**：支持指定 `unsubscribeUrl` 并在邮件中（正文末尾或占位符处）自动注入退订区块。
  - **重试退避**：遭遇网络或繁忙错误时进行最高 3 次的退避重试，测试环境下延迟自动缩减至 1ms。
- **高危门禁拦截**：
  - 单次收件人数量 `to > 10` 判定为批量高危，必须传入通过 `checkAutomationGate` (L3 / high / confirm=true) 授权发放的 `leaseToken`，否则拒绝发送。
- **隐私与密码防范**：
  - **密码防泄漏**：支持 `env:ENV_NAME` 前缀形式从环境变量加载，库中只存前缀配置，绝不持久化明文。
  - **隐私防泄漏**：`AuditLog` 及 `EmailSendLog` 表中绝对不记录邮件的 `bodyHtml` 及 `bodyText` 字段，防范现场信息及凭据溢出。
- **审计动作**：支持 `email.sent` / `email.failed` / `email.template.warning` 审计动作。

### 3.4 幂等与补偿

- 所有动作必须具备幂等键（`idempotencyKey`）。  
- 所有对外写操作的连接器必须返回清晰的 `receipt` 或错误码。  
- 对外部系统的不可逆写操作必须声明 `compensationStrategy`。  
- 无回执的写操作默认视为高风险，必须走审批流或被禁止。  
- OpenClaw Gateway 如发现事件重放或序列缺口时，必须依靠幂等键保护下游系统。

### 3.5 实现状态与补充约定（2026-06-15 v3.02.00-dev）
- 契约层已实现：`packages/event-contracts/src/`
- 合规版本：`CONTRACT_VERSION = '1.0'`
- 已接入：`harness-eval.ts` / `connectors.ts` / `audit.ts`
- **已接入（v3.07）**：`workflow/runtime-engine.ts` + `orchestrator.ts` 已实现 Workflow Runtime Engine 与 Multi-Agent Orchestration，完整替代原「待接入」状态
- **审批引擎补充约定**：
  - **时效管理**：提案审批默认 72 小时时效，高危动作默认 24 小时时效。审批超时必须提取为顶层常量（如 `PROPOSAL_APPROVAL_EXPIRY_MS`），严禁在函数内硬编码。
  - **状态与审计强关联**：审批检查点（`ApprovalCheckpoint`）生命周期的状态跃迁，必须与 AuditLog 的 `approval.*` 审计链（`requested` / `granted` / `rejected` / `expired`）强关联绑定，做到一客一审，审计与拦截可追溯。
  - **高危租约校验约定**：高危或批量操作的 `leaseToken` 可直接复用以已授权审批检查点 `acp-` 开头的 ID。执行面连接器必须主动查验该 `ApprovalCheckpoint` 的状态为 `approved` 且在有效期内，查验通过后记录 `approval.verified` 审计日志，建立物理发信与审批核验的完整可追溯链条。
- **执行引擎补充约定（v3.11）**：
  - **Serverless 超时机制**：明确声明 Serverless 环境下的超时控制不得使用应用内本地 `Promise.race`，必须统一委托给后台 `Cron` 巡检补偿器（如 `/api/cron/workflow-timeout`）驱动。
  - **快速失败 (Fast-fail) 契约**：所有 `Execution Runtime`（执行引擎）在接收到属于“权限阻断（如 Grant Missing 等策略异常）”或“人工拒绝（Approval Rejected）”等明确的安全拦截与硬错误时，必须立刻跳过常规容错重试机制（Fast-fail），立即终止执行并抛出错误。
- **维护清理约定（v3.12）**：
  - 审计日志（AuditLog）及执行轨迹（AgentLog）禁止物理删除，过期数据只允许归档（软标记）。
  - 短期记忆（Memory type=short, frozen=false）允许物理清理，但清理前后必须写入 AuditLog，记录清理数量与时间窗口，保证清理动作本身可追溯。
  - 所有 Cron 维护脚本的执行结果（含 archived/cleaned 计数）必须写入 AuditLog，action 命名规范：`maintenance.<task>.completed` / `maintenance.<task>.failed`。
- **推理透明化约定（v3.12）**：
  - 推理轨迹（ReasoningTrace）专供向企业用户展示 AI 的思考过程和数据溯源，消除“黑箱感”。
  - 推理轨迹仅属于 Hermes 观察性数据，严禁影响或阻断执行域的核心链路与安全护栏。
  - 推理轨迹内任何输出与展示，必须在入库前和展示前进行脱敏，过滤掉密码、凭据等高危敏感字段。
  - 推理轨迹（ReasoningTrace）不能替代用于合规追责的 AuditLog，二者并行存在各司其职。
  - **Fail-safe 强制约定**：所有 Trace 埋点操作必须通过 `withTraceStep(trace, config, fn)` 高阶函数调用，禁止在业务代码中直接调用 `addTraceStep` / `completeTraceStep`。`withTraceStep` 内部保证：
    (a) trace 代码异常只写 console.warn，绝不向外抛出（不阻断主链路）；
    (b) 业务 fn 抛出异常时，步骤状态自动置为 `error`（不卡 running）；
    (c) 业务 fn 正常返回时，步骤状态自动置为 `passed` 或回调中声明的状态.
    违反此约定（直接调用底层函数）的 PR 不允许合并。
  - **四层日志链顶层关联约定（2026-06-25 v3.28.00-dev）**：为了在海量高危审计日志中保证物理索引性能与证据完整性，`workflowRunId` 必须作为 `writeAuditLog` 及 `createAuditEntry` 的**顶层字段**直接进行参数传递和库字段映射，严禁仅将其隐藏在 `contextSnapshot` JSON 字典中，从而防范多租户证据关联断链。
  - **连接器预执行审计约定（2026-06-25 v3.28.00-dev）**：所有物理写操作连接器（如 HTTP Connector、Gateway、Email Connector 等）在实际发起 IO 发送前，必须预先向系统注册 `connector.execute` 预审计事件，且该审计的顶层字段必须强制关联 `workflowRunId`。
  - **配置与边界变更两阶段审计（2026-06-25 v3.28.00-dev）**：凡是更改系统级治理边界的操作（包括自动化等级变更 `automation.level.change`、行业包生命周期安装激活卸载 `pack.install.*` 等），必须严格采用二阶段审计模式：操作前以 `pending` 状态通过 `createAuditEntry` 预记录审计条目；操作结束（成功或失败拦截）后通过 `updateAuditEntry` 填入操作结果，更新审计为 `success` 或 `failed`，使整个生命周期全轨迹可追溯。
  - **Canary 评估唯一阈值源（2026-06-25 v3.28.00-dev）**：Canary 升级与回滚评估所需的全部指标阈值（如成功率/错误率），必须全部统一继承或推导自 `@hermesclaw/hermes-kernel` 导出的 `DEFAULT_CANARY_THRESHOLDS` 对象，严禁在 apps 业务侧或定时任务 Cron 中私自硬编码。

---

## 第四章：Harness Runtime 定义

### 4.1 Harness 不是 Prompt

HermesClaw 中的 Harness 是可运行时加载的治理对象集合，而不是一段提示词。

Harness Runtime 至少由以下对象组成：

- `AgentPolicy`  
- `WorkflowTemplate`  
- `SkillBinding`  
- `ContextPolicy`  
- `MemoryPolicy`  
- `ConnectorPolicy`  
- `GuardrailPolicy`  
- `EvalRuleSet`  
- `IndustryBinding`  

### 4.2 可进化对象边界

允许被 Level 2/3 评估与提案系统自动修改的对象：

- `WorkflowTemplate`  
- `SkillBinding`  
- `ContextPolicy`  
- `MemoryPolicy`  
- `EvalRuleSet`  
- `ConnectorPolicy`（非高危部分）

默认禁止自动修改的对象：

- 本文件（AGENTS.md）  
- L4 Guardrail 与高危动作策略白名单  
- 核心 RBAC 规则与 Workspace 权限结构  
- 资金 / 删除 / 外部承诺类动作的执行策略  
- OpenClaw / Hermes 源码和上游仓库配置

### 4.3 版本与灰度

每个 Harness Bundle 必须支持如下生命周期状态：

- `draft`  
- `canary`  
- `active`  
- `deprecated`  
- `rolled-back`

任何提案生效流程必须经过：

1. Proposal 生成  
2. Previous Snapshot 记录  
3. 审批（可多级）  
4. Canary 灰度发布  
5. 指标观察窗口  
6. 全量激活或回滚

### 4.3.1 快照实现（2026-06-15 v3.02.01-dev）
- **快照服务**：`apps/web/src/lib/server/harness-snapshot.ts`
- **触发时机**：Approval 通过后、Canary 启动前（由 `apps/web/src/lib/server/approval.ts` `recordProposalSnapshot` 钩子触发）
- **数据模型**：`HarnessSnapshot`（prisma schema）
- **审计动作**：`harness.snapshot.created` / `harness.snapshot.restored`

### 4.4.1 Canary 实现（2026-06-15 v3.02.02-dev）
- **Canary 服务**：`apps/web/src/lib/server/canary.ts`
- **晋级阈值**：`errorRate < 5%`，`successRate > 90%`
- **自动回滚阈值**：`errorRate > 20%`（超出此阈值立即触发 Early Abort 紧急中止）
- **观察窗口**：默认 24h，可在提案中自定义
- **定时评估**：`apps/web/src/app/api/cron/canary-eval/route.ts`（每 5 分钟由 Cron 调度）
- **审计动作**：`canary.started` / `canary.promoted` / `canary.aborted`

### 4.5.1 回滚实现（2026-06-15 v3.02.03-dev）
- **回滚服务**：`apps/web/src/lib/server/rollback.ts`
- **触发入口**：
  - **自动触发**：由巡检 Cron（`apps/web/src/app/api/cron/canary-eval/route.ts`）检测到健康度恶化自动调用。
  - **手动触发**：通过管理员接口 `POST /api/rollbacks` 与重试接口 `POST /api/rollbacks/[id]/retry`。
- **机制与约束**：
  - **原子事务性**：使用单个 Prisma 事务原子恢复 Agent 状态，将灰度期间新建的关联 Workflow、Skill、Connector 置为 `'deprecated'`。
  - **双向关系解绑**：自动清退灰度期间新增的技能绑定与连接器绑定关系（双向清退 usedByAgents 列表）。
  - **幂等保护**：已处于 `completed` 状态的回滚请求，若再次重试应直接短路返回，防范并发与重复回滚风险。
  - **高危操作二次确认**：手动触发 API（`POST /api/rollbacks` 及 `POST /api/rollbacks/[id]/retry`）属于 `critical` 级高危操作，强制通过 `checkConfirmValue(confirm)` 进行二次确认（要求 `confirm === true`）。
- **审计动作**：`harness.rollback.completed` / `harness.rollback.failed`。

### 4.6.1 Multi-Agent Orchestration + Workflow Runtime 实现（2026-06-15 v3.07.00-dev）
- **Workflow Runtime Engine**：`apps/web/src/lib/server/workflow/runtime-engine.ts`
- **Multi-Agent Orchestrator**：`apps/web/src/lib/server/orchestrator.ts`
- **Contracts**：`packages/event-contracts/src/agent-message.ts` / `packages/event-contracts/src/orchestration-session.ts`
- **Schema 新增模型**：`WorkflowRun`（扩展）/ `StepRun` / `OrchestrationSession` / `SubAgentTask` / `AgentMessage`
- **执行模式**：支持串行（`sequential`）/ 并行（`parallel`）/ 条件分支（`conditional`）/ 人工介入（`human-in-loop`）四种工作流模式
- **Orchestrator 权限门禁**：Orchestrator Agent 必须满足 `automationLevel >= L3`，否则拒绝创建编排会话
- **Sub-Agent 限制**：单 Session 最多支持 `MAX_SUB_AGENTS = 8` 个 Sub-Agent 并发
- **结果合并策略**：内置 `union` / `append` / `first-wins` / `majority` 四种合并模式
- **超时管理**：WorkflowRun 整体 30 分钟、单 Step 60 秒、Session 默认 15 分钟，均提取为顶层可配置常量
- **超时巡检**：`apps/web/src/app/api/cron/workflow-timeout/route.ts`（每 5 分钟由 Cron 调度）
- **API 路由**：`POST /api/workflow-runs`（启动）/ `POST /api/workflow-runs/[id]/execute`（执行）/ `POST /api/workflow-runs/[id]/cancel`（取消）/ `GET /api/workflow-runs/[id]/status`（状态查询）
- **审计动作**：`workflow.run.started` / `workflow.run.completed` / `workflow.run.failed` / `workflow.run.cancelled` / `workflow.run.resumed` / `orchestration.session.started` / `orchestration.session.completed` / `orchestration.session.failed` / `orchestration.subagent.completed` / `orchestration.session.resumed`
- **单元测试**：`apps/web/src/lib/server/workflow/__tests__/runtime-engine.test.ts`（28 个测试用例） / `apps/web/src/lib/server/__tests__/orchestrator.test.ts`（14 个测试用例）
- **Workflow 节点执行器（v3.12.00-dev）**：
  - `skill-executor.ts`：Skill 节点 LLM 编排执行器，通过 `selectModel()` 路由，
    L3 强制人工确认，使用 `ctx.industryId` 消除 N+1 查询。
  - `data-write-executor.ts`：Data-Write 节点 Prisma 写入执行器，
    从上游节点输出取值，写入目标模型。
  - `subworkflow-executor.ts`：子工作流节点执行器，通过依赖注入
    `createSubworkflowHandler(runWorkflow)` 规避循环导入，
    最大嵌套深度由 `maxDepth`（默认 5）控制。
  - `utils/topo-sort.ts`：统一拓扑排序工具，同时导出 `topoSortFlat`（runtime-engine 用）
    和 `topoSortLayers`（dag-engine 用），消除原各文件内联实现。
- **Legacy 引擎**：`dag-engine.ts` + `dag-runner.ts` 为历史遗留并行实现，
  已标记 `@deprecated`，操作 `WorkflowNodeRun` 表，不接受新功能对接。
  所有新工作流逻辑必须使用 `runtime-engine.ts`。

---

## 第五章：动态进化机制

### 5.1 进化闭环

进化闭环固定为：

> 执行 → 反馈 → 评估 → 提案 → 审批 → 灰度 → 生效 → 复盘

### 5.2 Level 与 Automation 分离

- **Level 0–3**：描述系统在某一领域的进化阶段与成熟度（会不会根据数据提出合理提案）。  
- **L1–L4**：描述单个动作的自动化授权等级（能不能自动执行）。

两者严禁混用。

授权等级示例（建议）：

- **L1**：仅建议级，AI 生成方案，人类手工执行。  
- **L2**：半自动，AI 生成，人工点按触发执行。  
- **L3**：自动执行低风险动作，高风险动作需审批。  
- **L4**：全部动作自动执行，仅在异常时告警（默认禁止，仅在极少数可证明安全的场景启用）。

### 5.3 评估输入

评估引擎至少读取以下数据：

- `WorkflowRun / WorkflowNodeRun`  
- `AgentLog / AuditLog`  
- `Connector success rate`  
- `Human correction events`  
- `Memory miss events`  
- `Knowledge gap records`  
- `Industry KPI drift`  
- Canary / Rollback 结果与原因

### 5.4 提案输出

评估引擎可以输出以下类型提案：

- 调整 WorkflowTemplate（拆解方式 / 节点并发 / 超时与重试）  
- 调整 SkillBinding（优先使用哪类技能 / 工具组合）  
- 调整 MemoryPolicy（哪些事实需要持久化 / 哪些应被压缩）  
- 调整 ConnectorPolicy（但不得调整高危白名单）  
- 调整 EvalRuleSet（触发阈值、观察窗口、告警策略）  

所有提案都必须通过 Hermes 的审批与灰度机制才能生效。

**提案生成降级规则（v3.12）**：
- 当大模型调用不可用（网络异常 / 无 API 密钥 / 响应超时）时，proposal-engine 启用硬编码规则分流引擎作为保底降级策略（Fallback Rule Engine）。
- 降级路径必须向 AuditLog 写入 `proposal.generation.fallback` 事件，记录降级原因，避免系统在无感知状态下运行备用逻辑。
- 降级提案的 automationLevel 上限为 L2（不允许降级路径产生 L3/L4 自动化提案）。
- 此降级机制为系统自愈能力的核心组成部分，禁止删除或绕过。
---

## 第六章：治理、安全与审计

### 6.1 RBAC 与租户边界

- 所有 Workspace 和 Industry Pack 的管理操作必须在 RBAC 体系下完成。  
- 不允许通过行业包或连接器绕过 Workspace 边界修改他人数据。  
- 多租户部署必须在配置层显式声明租户隔离策略。

### 6.2 审计必备

以下行为必须记录在 AuditLog 中：

- `workflow.generate`  
- `task.dispatch` / `task.cancel`  
- `model.route` / 高危模型变更  
- `connector.execute`（高危写操作）  
- `proposal.create / approve / reject / rollback`  
- `approval.requested / granted / rejected / expired`（审批检查点创建/通过/驳回/超时）  
- `industry.pack.install / activate / rollback`  
- `automation.level.change`（尤其是 L3/L4）  

### 6.3 主会话与 Sandbox

- 主会话（通常为系统管理员 / Owner）可在本机拥有完整工具权限，但仍须遵守高危动作审批与审计要求。  
- 非主会话默认运行于 sandbox（容器、远程节点或受限环境），只能使用经过 allowlist 的工具。  
- 不允许通过 OpenClaw 的 channel 配置直接为第三方用户开启与主会话等价的权限。

### 6.4 安全事件与处置历史

- **事件时间**: 2026-06-15
- **泄露文件名**: `dev.db.bak-20260611-215642`
- **泄露数据类型**: 测试环境用户账户数据（包含用户名、邮箱 `admin@hermesclaw.ai` 及 BCrypt 密码 Hash）
- **处置方案**: 
  1. 使用 `git filter-branch` 工具彻底清除所有 Git 历史分支中的该文件。
  2. 强制推送更新所有分支与 tags，并进行仓库强力垃圾回收（GC）。
  3. 在 `.gitignore` 中追加全局数据库文件（如 `*.db.bak-*` 等）忽略策略。
  4. 建议所有团队成员与部署环境轮换此前泄露的用户凭据，避免使用包含该 Hash 的旧密码。

### 6.5 审批防线与跨人防御（2026-06-25 v3.42.06-dev）
- 普通成员（`MEMBER`）进行人工决策操作时，必须强限制其只能操作本人所发起的审批检查点工单。
- API 层在处理决定时，应主动比对 `requestedBy`（通过检索 `approval.requested` 审计日志的 actor 获得）与当前的登录用户 ID，如果两者不一致则直接予以拦截并返回 `403 Forbidden`。仅 `ADMIN` 与 `OWNER` 豁免此规则。
- 审计日志查询该发起人时，必须带上租户 `workspaceId` 条件做精确隔离过滤，防止多租户场景下数据越权。

### 6.6 物理写连接器租约回校验（2026-06-25 v3.42.06-dev）
- 执行面的所有物理写操作连接器（如 `http-connector.ts`、`email-connector.ts`），当接收到以 `acp-` 开头的 `leaseToken` 时，必须在调用发送网络 IO 前，通过数据库物理反向查验 `ApprovalCheckpoint` 的 `decision` 状态是否为 `approved` 且仍处于有效期内。
- 查验成功后须立刻生成 `approval.verified` 对账审计日志，校验不通过必须立即以 `LeaseTokenValidationError` 拦截并阻断，实现“审批-租约-物理执行”的物理安全可追溯链条。

---

## 第七章：与上游项目的兼容性

1. HermesClaw 必须尊重并集成上游 Hermes Agent 与 OpenClaw 的既有机制：  
   - Hermes 的 memory / skills / session / compression 等机制只能通过公开 API 与配置扩展，不能直接改私有实现。  
   - OpenClaw Gateway 的事件协议与安全配置必须按其官方文档使用，仅通过配置与扩展点集成。

2. HermesClaw 的任何实现，如需修改上游仓库源代码，必须满足：  
   - 改动最小化且兼容上游发展路线。  
   - 在本仓库 CLAUDE.md 中显式记录，并通过 Harness 层尽量吸收差异。  

3. HermesClaw 不以「修改上游源码」作为首选路径，而是：  
   - 优先通过配置、Industry Pack、Harness、Connector 等扩展点实现业务目标。  
   - 仅在证明无法通过扩展层实现时，采用「上游贡献 PR + 本地兼容层」方案。

---

## 第八章：前端架构与三域 Store 隔离防线约定

### 8.1 前端状态机划分
- **会话态 Store (`sessionStore`)**：负责流式聊天、历史列表、WebSocket 推送等与特定会话强关联的状态。
- **配置态 Store (`agentConfigStore`)**：负责智能体选用列表、用户临时挂载的技能 patches，禁止与会话消息和状态混用。
- **桥接 Store (`sessionContextStore`)**：连接两者的轻量通道，在 context 中只传 `agentId` 和 `workspaceId` 等 ID 字符串，绝对禁止传入 `AgentPolicy` 或敏感策略对象。

### 8.2 脑中枢 `/brain` 边界隔离
- `/brain` 页面及其全部子页面（`/brain/memory`、`/brain/kpi`、`/brain/knowledge` 等）绝对禁止 `import` 任何工作空间 Store（`sessionStore`，`agentConfigStore`）。
- 脑中枢的所有数据必须通过独立的 `api/brain/*` 管道获取，不复用 `workspace.ts` 等会话专属接口。
- `/brain` 页面中不得展示任何 `ExecutionEvent` 任务轨迹或 WebSocket 会话流，保障三域边界的只读演化属性。
- 必须通过专门的自动化测试 `store-boundaries.test.ts` 进行集成守卫，检测违反 store 导入或 payload 携带受限字段的行为。
- **备注**：语音、图像、视频已迁至 `/knowledge/media/`，Brain 边界保持纯 Harness 治理（记忆体/技能/连接器）。

---

## 第九章：行业情报中心实现约定（2026-06-23 v3.42.00-dev）

### 9.1 Agent 心跳调度器

- **调度器服务**：`apps/web/src/lib/server/agent-runtime/heartbeat-scheduler.ts`
- **调度模式**：基于 `setInterval` 的主动定时调度（替代被动 Cron 轮询），每 10s 检查一次各 Agent 的 `heartbeatIntervalSec`。
- **首次执行**：启动时立即执行所有非 A4 Agent（A4 的 `heartbeatIntervalSec=0` 表示仅用户触发）。
- **packId 注入**：调度器不再硬编码 `PACK_ID`，通过 `startHeartbeatScheduler(packId, enableMock)` 参数传入。调用方负责从上下文或 URL 参数派生 packId，禁止模块级常量的行业包硬编码（参见 CLAUDE.md §3.2）。
- **Mock 解耦**：Mock SSE 事件发生器的启动不再由调度器隐式推断（基于 `NODE_ENV`），改为通过 `enableMock` 参数显式声明。调用方在开发/测试环境传入 `true`，生产环境传 `false`。
- **心跳事件**：通过 `emitAgentHeartbeat()` 发射 `IntelAgentHeartbeat` SSE 事件。
- **后端数据源**：9 个 Skill 均为 DB 驱动的真实数据计算（通过 Prisma 读取 `HarnessProposal`、`AuditLog`、`AgentLog`、`WorkflowRun`、`Connector` 等表）。

### 9.2 开发环境 Mock 数据约定

- **Mock 服务**：`packages/openclaw-adapter/src/intel-mock-generator.ts`
- **触发时机**：仅当 `startHeartbeatScheduler(packId, enableMock=true)` 时触发。
- **事件模拟**：`flowTick`（3s）、`signal`（15s）、`heartbeat`（10s）、`alert`（120s, 40%概率）。
- **发射通道**：通过 `emitIntelEvent()` 标准通道发射，对 SSE 订阅者透明。
- **三域归属**：Mock 发生器位于 `packages/openclaw-adapter/`（OpenClaw 层），仅负责模拟事件发射，不触及 Hermes 策略或业务逻辑。

### 9.3 图谱渲染双轨架构

- **3D 渲染**：Three.js + OrbitControls（桌面端默认），通过动态 `import("three")` 降低首帧 JS 体积。
- **2D 降级**：D3 Canvas 自定义渲染器 `D3CanvasRenderer`，支持拖拽平移（window 级事件绑定）、滚轮缩放（光标居中）、点击高亮。
- **降级触发**：FPS < 30、移动端、WebGL 不可用、Three.js 动态导入失败。
- **Worker 布局**：`apps/web/src/workers/nebula-layout.worker.ts`，O(n²) 斥力 + O(e) 引力 + 中心引力 + 阻尼衰减迭代。
- **居中策略**：Worker 内计算包围盒，平移簇中心至原点；Three.js 端根据包围盒自适应相机 `position.z` 距离（FOV 计算，留 30% 边距）。
- **增量更新**：SSE `intel.topology.updated` 事件 → `GraphDiff` 格式 → 2s 批处理合并 → 请求 Worker 重新布局。
- **性能约束**：最多 500 节点，超限截断；页面隐藏时暂停渲染循环；`prefers-reduced-motion` 媒体查询关闭自动旋转。
- **公共 Hook**：`useContainerSize(containerRef)` 为公共 Hook（`apps/web/src/hooks/use-container-size.ts`），消除 `use-knowledge-graph` 与 `use-nebula-render` 中重复的 `ResizeObserver` 逻辑。

### 9.4 Phase 2 真实数据接入（v3.42.04-dev）

- **Tavily Web Search 适配器**：`packages/openclaw-adapter/src/web-search.ts`
  - 提供 `searchWeb()` / `searchWebBatch()` / `isTavilyAvailable()` / `classifyTavilyError()`。
  - 三域归属：OpenClaw 层，仅做外部 HTTP 封装与错误归一化；不做策略决策与 LLM 推理（属 Hermes / Industry Pack 职责）。
  - API Key 通过 `TAVILY_API_KEY` 环境变量注入，禁止写入版本库。
- **DeepSeek LLM 接入**：复用 `apps/web/src/lib/server/llm-provider.ts` 既有 `callDeepSeekJson()` / `callLlmText()`，5 Agent 的 Skill Executor **不允许**新建独立的 LLM HTTP 客户端。
- **Skill 真实数据接入状态**：
  - ✅ `skill-radar-score-compute` — Tavily 8 维度新闻搜索 + DeepSeek JSON 评分（Phase 2 首条 demo skill）
  - 🚧 其余 8 个 skill 仍为 Phase 1 计算桩，待逐步迁移
- **降级路径强制约定**：所有接入 Tavily / LLM 的 skill 必须实现 fallback 路径：
  - Key 未配置 / 上游失败 / 超时 → 自动降级到 DB 统计模式，不允许抛出未捕获错误中断 Agent 心跳。
  - 降级时输出对象必须显式标记 `mode: "db-fallback"`，便于前端区分数据可信度。
  - 降级路径应记录 `logger.warn` / `logger.error` 用于运维定位，**禁止**写入 AuditLog 高风险日志（避免 Key 缺失这类配置问题污染审计链）。

### 9.5 dev-only 验证端点

- **路由**：`POST /api/intel/skill-test/[skillId]`
- **用途**：手动触发任一 skill 查看其真实输出（含 envCheck 健康度），用于 Phase 2 接入完成后的端到端验证。
- **安全约束**：路由头部强制检查 `process.env.NODE_ENV === "production"` 时拒绝返回 403。
- **白名单**：路径前缀 `/api/intel/skill-test` 已加入 `middleware.ts` 的 `DEV_BYPASS_ROUTES`，仅开发环境免认证。
- **禁止**：任何 dev-only 测试端点（路由模式如 `/api/*/test`、`/api/debug/*`）必须遵循同样的 NODE_ENV 强制门禁，禁止直接暴露在生产环境。

---

## 第十章：Monorepo 包构建与依赖更新约定（v3.42.04-dev）

### 10.1 包导出变更必须重新构建

- `packages/*/` 下的代码以 **预构建产物**形式被 `apps/web` 消费（package.json `exports` 指向 `dist/index.{mjs,js,d.ts}`）。
- 在 `packages/<pkg>/src/` 中**新增、修改或重命名**任何 `export` 后，**必须**执行：

  ```bash
  pnpm -F @hermesclaw/<pkg> build
  ```

- 仅修改函数体内部逻辑（不改变导出签名）时，理论上也需要构建——但 dev 环境为减少摩擦，可临时容忍未构建状态（仅 dev 端有效，PR 提交前必须 build 一次）。
- **CI 必须执行**：所有 PR 在 lint/test 之前先跑 `pnpm -r build` 确保所有 `dist/` 与 `src/` 同步。

### 10.2 包构建后必须重启 dev server

- `next dev`（含 Turbopack）会**缓存包模块解析结果**，仅修改 `dist/` 不会触发 HMR 重新解析 export 列表。
- 在执行 `pnpm -F @hermesclaw/<pkg> build` 后，必须**重启** `pnpm dev`，否则 Turbopack 会持续报 `Export X doesn't exist in target module`。

### 10.3 包消费方禁止跨越 dist 反向引用

- `apps/web` 与其他 packages **只能** import `@hermesclaw/<pkg>`（走 package.json exports）。
- **严禁**任何 `import "@hermesclaw/<pkg>/src/..."` 或相对路径 `../../packages/<pkg>/src/...` 跨包源码引用。
- 仅允许 `packages/<pkg>` 内部子模块（同包内）通过相对路径互相引用。
