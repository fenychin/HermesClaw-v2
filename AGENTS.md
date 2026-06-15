# AGENTS.md — HermesClaw-v3 项目最高规则文档

> 版本: v3.0.0  
> 项目: HermesClaw  
> 状态: 生效中  
> 最后更新: 2026-06-12

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
- **Registry 服务**：[capability-registry.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/src/lib/server/capability-registry.ts)
- **版本管理**：使用 `CapabilityVersion`（prisma schema）实现，支持基于内联 semver 语义化排序的版本解析与运行时发现。
- **健康度刷新**：通过 [/api/cron/capability-health](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/src/app/api/cron/capability-health/route.ts) 每小时自动调度刷新。
- **能力下线**：支持 `deprecate`（仍可用，写 WARNING 审计日志）和 `yank`（立即不可用，彻底阻断并写入 high 风险审计日志）。
- **审计动作**：支持 `capability.registered` / `capability.yanked` / `capability.health.degraded` 审计留痕溯源。

### 3.2 任务真相与执行真相

- Hermes 是 **Task Truth Source**：任务定义、策略、风险等级、自动化等级、审批状态。  
- OpenClaw 是 **Execution Truth Source**：动作是否执行、执行到哪一步、设备 / 连接器在线状态。  
- 最终任务状态由 Hermes 汇总裁定，但不得篡改 OpenClaw 回传的原始执行回执与事件轨迹。

3.2.1 Industry Pack Loader v2 实现（2026-06-15 v3.06.00-dev）
- **Loader 核心**：[industry-pack-loader.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/src/lib/server/industry-pack-loader.ts)
- **Manifest 契约**：[industry-pack-manifest.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/src/lib/server/contracts/industry-pack-manifest.ts)
- **安装流程**：Manifest 校验（非空/SemVer/重复能力 ID/自循环依赖） → 依赖解析与深度检测（最大深度为 5，防无限循环） → 组件表实体创建/更新 → 敏感词前缀转换（如密码等转为 `'env:PLACEHOLDER'`） → 版本化注册至 Registry（已注册视为幂等跳过） → 更新为 `installed` 状态。
- **异常回滚**：注册失败时，遍历已成功注册的能力列表逐一调用 `deprecateCapability` 进行软标记废弃（禁止 deleteMany 物理删除），更新安装状态为 `failed`。
- **卸载策略**：Graceful Deprecation 策略，逐个废弃所安装能力，更新安装记录状态为 `uninstalled`，禁止物理删除任何 Skill / Workflow / Connector 记录。
- **健康度统计**：基于 Capability Registry 的各能力 24h 调用监控，对包整体状态执行聚合计数。
- **数据模型**：`IndustryPackInstallation`（Prisma Schema）。
- **审计动作**：支持 `pack.install.started` / `pack.installed` / `pack.install.failed` / `pack.uninstalled` 等审计留痕。

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
- **核心服务**：[email-connector.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/src/lib/server/connectors/email-connector.ts)
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
- 契约层已实现：[contracts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/src/lib/server/contracts/)
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
- **快照服务**：[harness-snapshot.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/src/lib/server/harness-snapshot.ts)
- **触发时机**：Approval 通过后、Canary 启动前（由 [approval.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/src/lib/server/approval.ts) `recordProposalSnapshot` 钩子触发）
- **数据模型**：`HarnessSnapshot`（prisma schema）
- **审计动作**：`harness.snapshot.created` / `harness.snapshot.restored`

### 4.4.1 Canary 实现（2026-06-15 v3.02.02-dev）
- **Canary 服务**：[canary.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/src/lib/server/canary.ts)
- **晋级阈值**：`errorRate < 5%`，`successRate > 90%`
- **自动回滚阈值**：`errorRate > 20%`（超出此阈值立即触发 Early Abort 紧急中止）
- **观察窗口**：默认 24h，可在提案中自定义
- **定时评估**：[/api/cron/canary-eval](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/src/app/api/cron/canary-eval/route.ts)（每 5 分钟由 Cron 调度）
- **审计动作**：`canary.started` / `canary.promoted` / `canary.aborted`

### 4.5.1 回滚实现（2026-06-15 v3.02.03-dev）
- **回滚服务**：[rollback.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/src/lib/server/rollback.ts)
- **触发入口**：
  - **自动触发**：由巡检 Cron（[/api/cron/canary-eval](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/src/app/api/cron/canary-eval/route.ts)）检测到健康度恶化自动调用。
  - **手动触发**：通过管理员接口 `POST /api/rollbacks` 与重试接口 `POST /api/rollbacks/[id]/retry`。
- **机制与约束**：
  - **原子事务性**：使用单个 Prisma 事务原子恢复 Agent 状态，将灰度期间新建的关联 Workflow、Skill、Connector 置为 `'deprecated'`。
  - **双向关系解绑**：自动清退灰度期间新增的技能绑定与连接器绑定关系（双向清退 usedByAgents 列表）。
  - **幂等保护**：已处于 `completed` 状态的回滚请求，若再次重试应直接短路返回，防范并发与重复回滚风险。
  - **高危操作二次确认**：手动触发 API（`POST /api/rollbacks` 及 `POST /api/rollbacks/[id]/retry`）属于 `critical` 级高危操作，强制通过 `checkConfirmValue(confirm)` 进行二次确认（要求 `confirm === true`）。
- **审计动作**：`harness.rollback.completed` / `harness.rollback.failed`。

### 4.6.1 Multi-Agent Orchestration + Workflow Runtime 实现（2026-06-15 v3.07.00-dev）
- **Workflow Runtime Engine**：[runtime-engine.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/src/lib/server/workflow/runtime-engine.ts)
- **Multi-Agent Orchestrator**：[orchestrator.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/src/lib/server/orchestrator.ts)
- **Contracts**：[agent-message.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/src/lib/server/contracts/agent-message.ts) / [orchestration-session.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/src/lib/server/contracts/orchestration-session.ts)
- **Schema 新增模型**：`WorkflowRun`（扩展）/ `StepRun` / `OrchestrationSession` / `SubAgentTask` / `AgentMessage`
- **执行模式**：支持串行（`sequential`）/ 并行（`parallel`）/ 条件分支（`conditional`）/ 人工介入（`human-in-loop`）四种工作流模式
- **Orchestrator 权限门禁**：Orchestrator Agent 必须满足 `automationLevel >= L3`，否则拒绝创建编排会话
- **Sub-Agent 限制**：单 Session 最多支持 `MAX_SUB_AGENTS = 8` 个 Sub-Agent 并发
- **结果合并策略**：内置 `union` / `append` / `first-wins` / `majority` 四种合并模式
- **超时管理**：WorkflowRun 整体 30 分钟、单 Step 60 秒、Session 默认 15 分钟，均提取为顶层可配置常量
- **超时巡检**：[/api/cron/workflow-timeout](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/src/app/api/cron/workflow-timeout/route.ts)（每 5 分钟由 Cron 调度）
- **API 路由**：`POST /api/workflow-runs`（启动）/ `POST /api/workflow-runs/[id]/execute`（执行）/ `POST /api/workflow-runs/[id]/cancel`（取消）/ `GET /api/workflow-runs/[id]/status`（状态查询）
- **审计动作**：`workflow.run.started` / `workflow.run.completed` / `workflow.run.failed` / `workflow.run.cancelled` / `workflow.run.resumed` / `orchestration.session.started` / `orchestration.session.completed` / `orchestration.session.failed` / `orchestration.subagent.completed` / `orchestration.session.resumed`
- **单元测试**：[runtime-engine.test.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/src/lib/server/workflow/__tests__/runtime-engine.test.ts)（28 个测试用例） / [orchestrator.test.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/src/lib/server/__tests__/orchestrator.test.ts)（14 个测试用例）
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