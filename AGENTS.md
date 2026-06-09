# AGENTS.md — HermesClaw-v2 项目最高规则文档

> **版本**: v2.6.0-alpha  
> **项目**: HermesClaw-v2（空间项目）  
> **状态**: 🟢 生效中  
> **最后更新**: 2026-06-10

***

## 第〇层：元规则（Meta-Rules）

> 本文档是 HermesClaw-v2 的最高行为准则。所有 Agent、子系统、工具链均须以本文档为最终裁决依据。
> 任何与本文档冲突的局部配置，以本文档为准。

***

## 第一章：项目哲学 — AI-First 系统工程

### 1.1 核心信条

HermesClaw-v2 是一个 **AI-First 的自演化空间系统工程**，而非传统意义上的"AI 辅助软件"。

- **AI 不是工具，是第一工程主体**：系统的设计、执行、优化均以 AI Agent 为主角，人类工程师扮演策略制定者和最终审批者。
- **代码是输出，不是核心**：系统的真正价值在于 Harness 结构本身的稳定性与进化能力，代码只是它的一种表达形式。
- **环境决定表现**：同一个模型，在优质 Harness 和劣质 Harness 中，表现可能相差巨大。HermesClaw-v2 的核心投资在于 Harness 质量，而非模型选型。

### 1.2 AI-First 三原则

| 原则 | 含义 | 违禁行为 |
|------|------|----------|
| **主体优先** | Agent 拥有完整执行权，人类不干预过程，只审批边界 | 在 Agent 执行中途强行接管、改写中间状态 |
| **环境驱动** | 系统行为由 Harness 环境定义，而非硬编码逻辑 | 绕过 Harness 直接调用底层 API |
| **数据主权** | Agent 的所有决策均须留下可溯源的上下文快照 | 无日志的静默执行 |

***

## 第二章：Harness 核心定义

### 2.1 什么是 HermesClaw-v2 中的 Harness

> **Harness = 驾驭层**
> 它是连接模型能力与真实世界交付物之间的全部工程结构。

**公式**：

```
Agent = Model + Harness
HermesClaw-v2 = ∑(Agent) + 动态进化引擎
```

Harness 不是一段配置文件，不是一套 Prompt 模板。它是一个**有生命的系统**，包含：

- 任务边界定义（Agent 能做什么、不能碰什么）
- 上下文供给链（知识版本化管理）
- 工具接入层（权限受控、可审计）
- 反馈闭环（执行结果回流 → 下次决策）
- 安全护栏（高危操作人工审批）
- 进化调度器（Harness 自身的升级机制）

### 2.2 静态 Harness vs 动态 Harness

HermesClaw-v2 **明确拒绝静态 Harness 设计**。

| 维度 | 静态 Harness（禁止） | 动态 Harness（HermesClaw-v2 标准） |
|------|---------------------|-------------------------------------|
| 配置方式 | 写死在代码或配置文件中 | 运行时可加载、热更新 |
| 知识更新 | 需要人工重新部署 | Agent 可自主触发知识库同步 |
| 规则迭代 | 版本发布才能生效 | 经过审批后实时生效 |
| 失败响应 | 报错后等待人工处理 | 自动触发降级策略 + 上报 |
| 进化机制 | 无 | 内置自我评估 + 升级提案 |

### 2.3 DAG 工作流引擎

HermesClaw-v2 内置轻量级 DAG（有向无环图）任务调度引擎，位于 `src/lib/server/workflow/`，用于编排多步骤工作流。

**设计原则**：
- **纯编排**：引擎仅负责拓扑排序、分层并行调度、条件分支路由和 handler 分派，不直接依赖 Prisma
- **审计注入**：所有状态扭转、审计日志、AgentLog 写入通过 `DagEngineHooks` 回调由 dag-runner 注入，引擎自身不写日志
- **失败不扩散**：节点失败后其直接下游被自动跳过（skipped），非失败分支的独立节点继续执行
- **可插拔 handler**：节点按 `kind`（task | condition | subworkflow | noop）派发到 handler 注册表，task 类节点由调用方注册真实执行器

**约束**：
- **无日志禁止静默执行**：每个节点的 start / finish 至少写入一条 `AgentLog(source='workflow')` + 一条 `AuditLog`
- **条件分支安全**：仅支持 `ctx.variables.<key> === <value>` 字符串字面比对，**禁止 eval 任意表达式**
- **子流程嵌套上限**：默认 `maxDepth = 5`，防无限递归
- **环路检测**：Kahn 拓扑排序阶段检测循环依赖，拒绝执行并记录审计
- **输出校验**：节点输出经 `guardOutput()` 拦截敏感声明（如「已发送邮件」），拦截不阻断但记录审计
- **Harness 降级**：任一节点 failed 自动异步触发 `runHarnessEvaluation('auto')`，纳入 72h 评估窗口
- **节点状态机**：`pending → running → completed | failed | skipped`；失败节点的下游自动划为 skipped

**存储模型**（Prisma）：
- `Workflow`：工作流定义，`nodes` / `edges` 以 JSON 字符串列存图
- `WorkflowRun`：一次运行的整体状态（pending → running → completed | failed）
- `WorkflowNodeRun`：单节点运行记录，承载结构化输入/输出/错误

***

## 第三章：动态 Harness — 自演化架构

这是 HermesClaw-v2 区别于一切传统 Agent 框架的核心能力。

### 3.1 自演化的四个层次

```
Level 0 — 执行层：Agent 按 Harness 规则完成当前任务
Level 1 — 反馈层：执行结果回流，更新上下文记忆
Level 2 — 评估层：系统定期自评，识别 Harness 瓶颈
Level 3 — 进化层：提交 Harness 升级提案，经审批后部署
```

- **Level 0-1** 完全自主，无需人工介入。
- **Level 2** 自主运行，产生评估报告，推送给项目维护者。
- **Level 3** 必须经由人类审批（Harness 变更不可绕过审批门禁）。

### 3.2 进化触发条件

以下任一条件满足，系统自动进入 Level 2 评估：

- 连续 3 次任务失败（同类型任务）
- 工具调用成功率低于 85%
- 上下文供给缺口导致任务中断超过 2 次/天
- 新工具/新模型接入后首次全量运行完成
- 人类维护者手动触发（`/harness evaluate`）

### 3.3 进化提案格式（Evolution Proposal）

每一份 Harness 升级提案须包含：

```yaml
proposal_id: HEP-{timestamp}
triggered_by: [自动评估 | 手动触发]
problem_statement: |
  描述当前 Harness 瓶颈
evidence:
  - 失败日志引用
  - 性能数据
proposed_change:
  target_component: [任务边界 | 上下文供给 | 工具接入 | 反馈闭环 | 安全护栏]
  description: |
    具体变更内容
  risk_level: [低 | 中 | 高]
requires_human_approval: true  # 永远为 true
estimated_impact: |
  预期效果描述
```

***

## 第四章：六大核心组件规范

### 4.0 技能规范（Claude Code Skills 标准）

> ⚠️ **重要声明**：本项目中所有"技能（Skill）"均指 **Claude Code Skills**（遵循 [Agent Skills](https://agentskills.io) 开放标准），
> **不是**传统意义上的"功能模块"或"微服务"。每个 Skill 都是一个可通过 `/skill-name` 调用的 Claude Code 扩展，
> 其格式为 YAML frontmatter + Markdown 正文。

- **规范文档**：<https://code.claude.com/docs/zh-CN/skills>
- **文件格式**：`SKILL.md` = YAML frontmatter（`---` 包裹）+ Markdown 正文
- **存放位置**：`.claude/skills/<skill-name>/SKILL.md`
- **命令名称**：目录名即为 `/` 后的调用名（如 `.claude/skills/ft-inquiry-sorter/SKILL.md` → `/ft-inquiry-sorter`）
- **必选字段**：`description`（Claude 据此自动判定何时加载该 Skill）
- **任务边界映射**：
  - Skill 正文 `## 能力清单 (can_do)` → Agent 的 `can_do` 列表
  - Skill 正文 `## 约束条件 (cannot_do)` → Agent 的 `cannot_do` 列表
  - Skill 正文 `## 所需工具 / 连接器` → 工具需求声明
- **数据库镜像**：Prisma `Skill` 表为 Claude Code Skills 的数据库投影：
  - `inputSchema` 存储 `{ role, capabilities, commandName, allowedTools }`
  - `outputSchema` 存储 `{ constraints, disableModelInvocation }`
  - `scenarios` 存储所需工具/连接器列表
  - `category` 存储 `foreign-trade:{角色名}`
- **种子脚本**：`prisma/seed-skills.ts` 负责扫描 `.claude/skills/ft-*/SKILL.md`，解析 YAML frontmatter 与 Markdown 正文，幂等同步至 Prisma `Skill` 表
- **命名约定**：
  - 外贸行业技能模板统一以 `ft-` 前缀命名，位于 `.claude/skills/ft-*/` 目录下
  - 未来新增行业须先在本文档登记前缀（如 `fin-` 金融、`med-` 医疗），未经登记的前缀不会被 `seed-skills.ts` 识别
- **allowed-tools 与 ToolRegistry 的关系**：SKILL.md frontmatter 中的 `allowed-tools` 声明的是 **Claude Code 原生工具**（如 `Read`、`Grep`、`WebFetch`），由 IDE 层管理权限；业务连接器（如 Gmail、CRM）走 Prisma `ToolRegistry` + `ToolGrant` 管理体系（§4.3）。两者是**不同层次的工具体系**，不可混用
- **数据库映射函数**：`toSkillDbRecord(tmpl)`（`prisma/seed-skills.ts`）是 Claude Code Skills 文件 ↔ Prisma `Skill` 表的**唯一映射桥梁**，`seed-skills.ts` 和 `seed.ts` 均通过此函数写入，禁止在调用方重复序列化逻辑
- **种子脚本审计豁免**：`prisma/seed-*.ts` 作为开发工具，**豁免 §4.3 审计日志（AuditLog）写入要求**。种子数据填充不视为"系统运行操作"，无需记录审计轨迹。此豁免仅适用于本地开发环境，生产环境的数据变更仍须通过受控 API 执行并记录审计日志

### 4.1 任务边界（Task Boundary）

- **必须声明**：每个 Agent 的 `can_do` 和 `cannot_do` 列表
- **边界冲突处理**：优先拒绝执行，记录冲突日志，上报维护者
- **边界热更新**：边界变更须附带 HEP 提案编号

```yaml
# 示例：空间数据 Agent 的任务边界
agent_id: spatial-data-agent-v2
can_do:
  - 读取空间坐标数据
  - 执行几何计算
  - 生成可视化报告（草稿）
cannot_do:
  - 直接写入生产数据库
  - 修改其他 Agent 的配置
  - 调用未注册工具
```

### 4.2 上下文供给链（Context Supply Chain）

- 所有知识文档须版本化（`knowledge-base/v{N}/`）
- Agent 只能引用**当前激活版本**的知识
- 知识更新须通过 `知识变更日志（KCL）` 记录，不允许静默替换
- 禁止将关键上下文散落在 Slack、注释、口头约定中

### 4.3 受控工具接入（Controlled Tool Access）

- 所有工具须在 `tools/registry.yaml` 中注册
- 生产环境工具调用使用**短期 Token**（≤ 1小时有效期）
- 高危工具（删除、写入生产环境、外部 API 调用）须双重审批
- 工具调用全程记录至审计日志

### 4.4 闭环反馈（Closed-Loop Feedback）

- Agent 必须接收每次执行的结果快照（日志、状态码、输出摘要）
- 禁止"盲飞执行"（Agent 发出指令后不检查结果）
- 反馈数据须结构化存储，供 Level 2 评估使用

### 4.5 安全护栏（Safety Guardrails）

- **人机切换阈值**：置信度 < 0.7 时，自动暂停并请求人工确认
- **高危操作门禁**：以下操作永远需要人工审批：
  - 删除任何持久化数据
  - 修改 AGENTS.md 本身
  - 变更另一个 Agent 的任务边界
  - 外部资金或资源调度
- 护栏规则本身的变更须经 Level 3 进化流程

### 4.6 进化调度器（Evolution Scheduler）

- 每 72 小时自动运行一次 Level 2 全系统评估
- 评估报告推送至项目维护者（Markdown 格式）
- 历史进化记录存档于 `harness/evolution-log/`

### 4.7 自动化授权分级（L1–L4 Automation Levels）

> 本节细化 4.5 安全护栏，为每一个 Agent **业务动作**与每一份 **Harness 升级提案** 标注自动化授权等级。
> 与第三章「Level 0-3 自演化层次」是**两个不同维度**：Level 0-3 描述 Harness *演化阶段*；L1-L4 描述单次*动作*能否自动执行。两者不可混用。

| 等级 | 含义 | 执行约束 |
|------|------|----------|
| **L1** | 全自动执行 | 无需审批，直接执行 |
| **L2** | 建议执行（默认） | 可自动执行，但系统留痕，事后可审查 |
| **L3** | 需人工确认 | 高风险操作，必须人工二次确认后才执行，确认后立即生效且不可撤销 |
| **L4** | 绝对禁止自动 | 系统永不自动执行；必须由人工在源业务系统发起，审批通道亦不得放行 |

- **L4 不可绕过**：任何带密码、带 Token、带二次确认的「自动批准 L4」均属违规——L4 的语义是*禁止自动*，而非*提高自动门槛*。审批 API 对 L4 动作的 `approve` 必须硬拒绝（403）。
- **L3 强制二次确认**：审批 API 缺少显式确认时返回 409，前端弹确认对话框，复用 4.5 高危操作护栏机制。
- **派生规则**：未显式标注 `automationLevel` 的 Harness 提案，按 `riskLevel` 派生（high→L3 / mid→L2 / low→L1）。
- **统一解析**：`resolveAutomationLevel(automationLevel, riskLevel)` 封装了「显式标注优先，否则派生」的逻辑（`src/types/harness.ts`），供 Route Handler / guardrail / harness-eval 等所有调用方复用。
- **统一门禁**：`checkAutomationGate({ automationLevel, riskLevel, confirmed, actionName })`（`src/lib/server/guardrail.ts`）封装了 L4 硬拒绝（403）、L3 二次确认拦截（409）的完整判定链，供 approve / reject / rollback 等治理路由复用，避免在多处重复 L4/L3 检查逻辑。
- 授权分级本身的变更须经 HEP 流程（见第七章）。

### 4.8 OpenClaw SSE 实时事件管道

> 本节定义 OpenClaw 执行层与 Web 工作台之间的实时事件回传机制，基于 Server-Sent Events（SSE）。

**架构**：

```
OpenClaw 执行层（mock / 真实 API）
  ↓ emitOpenClawEvent(agentId, event)
event-emitter.ts（全局 pub/sub — 单进程内存广播）
  ↓ enqueue SSE frame → 匹配的 subscriber
/api/openclaw/events（ReadableStream + text/event-stream）
  ↓ 客户端 fetch → parseSSEStream()
useOpenClawStream Hook → Zustand ui-store.agentExecutionStates
  ↓ 响应式订阅（selector）
UI 组件（状态指示色）
```

**事件类型规范**（`OpenClawEvent.type`）：

| 事件 | 含义 | 状态映射 |
|------|------|----------|
| `task:started` | 任务开始执行 | `executing` |
| `task:progress` | 任务执行中（含进度） | `executing` |
| `task:completed` | 任务执行成功 | `succeeded` |
| `task:failed` | 任务执行失败 | `failed` |
| `task:cancelled` | 任务被取消 | `cancelled` |
| `connector:connected` / `connector:disconnected` / `connector:error` | 连接器状态变更 | — |
| `heartbeat` | 连接保活（30s 间隔） | — |

**事件广播**：
- 服务端通过 `emitOpenClawEvent(agentId, event)` 推送至所有匹配的 SSE 订阅者，位于 `src/lib/server/adapters/openclaw/event-emitter.ts`
- 支持按 `agentId` / `workflowRunId` 过滤订阅

**客户端订阅**：
- `useOpenClawStream({ agentId })` Hook（`src/hooks/use-openclaw-stream.ts`）自动连接 `/api/openclaw/events` 并更新 Zustand `agentExecutionStates`
- 断开自动重连（默认 3s 间隔）
- 通用 SSE 流解析器 `parseSSEStream()` 位于 `src/lib/sse-parser.ts`，供所有 SSE 端点复用

**状态指示色**（遵守 CLAUDE.md 颜色系统）：

| 状态 | CSS 工具类 | 颜色 token |
|------|-----------|------------|
| `executing` | `text-warning` | `--warning` (#F0A43B) |
| `succeeded` | `text-success` | `--success` (#37C99A) |
| `failed` | `text-danger` | `--danger` (#FF6B6B) |
| `idle` / `cancelled` | `text-muted-foreground` | `--muted-foreground` (#A1A1AA) |

**约束**：
- 任何任务执行（含 Mock 模式）必须在 `task:started` / `task:completed`（或 `task:failed`）事件前后写入 `writeAgentLog`，不得形成无日志的执行路径（§5 #3）
- SSE 端点须接入频率限制（`rateLimit`），单 IP 每分钟最多 5 个连接
- 事件 payload 不得包含敏感操作细节（L4 动作的执行参数不应直接推送到浏览器）
- 全局 pub/sub 基于内存 Map，适用于单进程开发环境；生产环境须替换为 Redis Pub/Sub 或等价的分布式方案

### 4.9 Harness 提案一键回滚机制

> 本节定义已批准提案的回滚流程，遵循 §4.5 安全护栏 + §4.7 授权分级。

**回滚触发条件**：

- 人工手动发起（`POST /api/harness/proposals/[id]/rollback`）
- 必须携带有效的 `x-approval-token` 请求头

**回滚快照（`previousSnapshot`）**：

- 存储在 `HarnessProposal` 模型的 `previousSnapshot` 字段（JSON 字符串）
- 包含变更前 Agent 的完整任务边界与工具访问状态：

  ```json
  { "agentId", "canDo", "cannotDo", "bindConnectors", "bindSkills", "harnessVersion", "snapshotAt" }
  ```

- 提案被批准时写入快照（由 approve 流程负责）；回滚时从快照恢复

**回滚执行流程**：

1. 校验 `x-approval-token` → 401
2. 频率限制（单提案 60s 冷却 + 全局每分钟 ≤ 3 次）→ 429
3. 自动化授权门禁（`checkAutomationGate`：L4 → 403，L3 缺确认 → 409）
4. L3 `confirmationToken` 须与预期值匹配（环境变量 `HARNESS_L3_CONFIRMATION_TOKEN`，默认 `"确认回滚"`）
5. Prisma 事务：Agent 字段恢复 + 提案状态更新为 `rolled-back` + AuditLog（riskLevel=high）
6. 事务成功后：写入 AgentLog + 异步触发 Harness 降级评估

**约束**：

- 仅 `status === 'approved'` 的提案可回滚
- 回滚全程在 Prisma 事务中完成，任一步骤失败即整体回滚
- 审计日志在事务内写入（高风险操作的审计绝不可丢失，事务失败则回滚整体操作）
- 回滚后自动异步触发 `runHarnessEvaluation('auto')`，将变更纳入 72h 评估窗口

**核心实现**：

- 回滚逻辑：`src/lib/server/harness/harness-rollback.ts`（`rollbackHarnessProposal`）
- API 端点：`src/app/api/harness/proposals/[id]/rollback/route.ts`

***

## 第五章：禁止行为清单（Anti-Patterns）

以下行为在 HermesClaw-v2 中被视为**严重违规**，触发自动回滚并告警：

1. ❌ 静默绕过 Harness 直接调用底层能力
2. ❌ 未注册工具的调用
3. ❌ 无日志的执行（任何执行必须留下可溯源记录）
4. ❌ 上下文知识的静默替换（未经 KCL 记录）
5. ❌ Harness 规则的单方面修改（未经 HEP 流程）
6. ❌ 模型输出直接进入生产环境（未经校验层）
7. ❌ 忽略置信度阈值强行执行高风险任务

***

## 第六章：工程师角色定义

在 AI-First 体系下，人类工程师的角色**从"写代码"转向"设计系统"**。

| 角色 | 职责 | 不应做的事 |
|------|------|------------|
| **Harness 架构师** | 设计组件结构、进化机制、审批流 | 微观干预 Agent 执行过程 |
| **知识策展人** | 维护知识库版本、确保上下文质量 | 让知识散落在非结构化介质中 |
| **审批者** | 审核 Level 3 进化提案 | 无条件拒绝或无条件批准 |
| **监控员** | 阅读 Level 2 评估报告，识别趋势 | 忽略系统上报的瓶颈信号 |

***

## 第七章：文档维护规则

- **本文档（AGENTS.md）是最高规则**，优先级高于所有子系统配置
- 任何对本文档的修改，须提交 HEP 提案并经人工审批
- 每次版本更新须在文档顶部更新版本号和日期
- 本文档须对所有 Agent 可读，是 Agent 启动时加载的第一份上下文

### 4.10 WorkflowGenerator Agent（AI 驱动 DAG 生成）

> 本节定义首个内置 AI Agent —— WorkflowGenerator —— 的模块约定与约束。

**目录**：`src/lib/server/agents/` — AI 驱动的业务 Agent 模块目录，每个 Agent 为独立文件（如 `workflow-generator.ts`）。

**WorkflowGenerator 职责**：
- 接收用户**自然语言意图** + **行业上下文**，调用 LLM 将意图解析为结构化 DAG 工作流
- 输出 Schema：`{ nodes: WorkflowNode[], edges: WorkflowEdge[], metadata: { industry, generatedBy, version } }`
- 生成结果写入 `Workflow` 表，状态为 `draft`（不可直接执行）

**约束**：
- **不可直接执行**：生成的工作流 `status = 'draft'`，需人工 Review 节点配置和自动化授权等级后，手动激活为 `active` 方可执行（符合 §4.7 L3 约束）
- **DAG 结构校验**：生成阶段即执行 Kahn 环路检测、孤立节点检测，在入库前拦截非法 DAG（与 §2.3 运行时检测互补）
- **输出安全扫描**：LLM 生成的节点名称/描述经 `guardOutput()` 扫描（§5 #6），敏感声明不阻断但记录审计
- **审计日志**：每次生成写入 `AuditLog(action='workflow.generate')`，记录 Provider、节点数、敏感声明告警等溯源信息（§5 #3）
- **Provider 复用**：LLM 调用走 `src/lib/server/llm-provider.ts` 共享工具层，不自行实现 Provider 选择逻辑

**API 端点**：`POST /api/workflows/generate`（见 CLAUDE.md 或 API 文档）

**Workflow 状态流转**：
```
draft（AI 生成，待审核）→ active（人工激活，可执行）→ archived（归档）
```

**共享 LLM 工具层**：`src/lib/server/llm-provider.ts`
- 提供 `resolveLlmProvider()` — 统一的 Provider 选择（HARNESS_LLM_PROVIDER → Anthropic → DeepSeek 回退）
- 提供 `callAnthropicText()` / `callDeepSeekJson()` — 标准化的 LLM 调用模板
- JSON 解析复用 `parseJsonLoose`（`src/lib/harness-llm.ts`，已 export）
- 新 Agent 应优先使用此共享层，避免重复实现

### 4.11 多租户 Workspace 与 RBAC

> 本节定义多租户工作空间模型、细粒度 RBAC 权限体系及数据隔离约定。

**数据模型**（Prisma）：

| 模型 | 关键字段 | 说明 |
|------|---------|------|
| `Workspace` | `id`, `name`, `plan` | 工作空间（租户），`plan` 取值 `free` / `pro` / `enterprise` |
| `WorkspaceMember` | `workspaceId`, `userId`, `role` | 成员关系，复合主键 `(workspaceId, userId)`，级联删除 |

**角色体系**（`WorkspaceRole`，TEXT 列存）：

| 角色 | 优先级 | 写权限 | 审批 L3 | 修改 Harness | 管理成员 |
|------|--------|--------|---------|-------------|---------|
| `OWNER` | 4 | ✅ | ✅ | ✅ | ✅ |
| `ADMIN` | 3 | ✅ | ✅ | ✅ | ✅ |
| `MEMBER` | 2 | ✅ | ✅ | ❌ | ❌ |
| `VIEWER` | 1 | ❌ | ❌ | ❌ | ❌ |

**数据隔离规则**：

- **Prisma 查询层强制隔离**：所有 `findMany` / `findFirst` / `create` / `count` 必须带 `workspaceId` 过滤，**禁止依赖应用层过滤**
- **向后兼容**：系统初始化时创建 `id='default'` 的默认 Workspace，所有现有数据自动归属，现有用户自动授予 `OWNER` 角色
- **AuditLog 强制 workspaceId**：`WriteAuditLogInput.workspaceId` 为**必填字段**（TypeScript 编译期强制），禁止绕过 `writeAuditLog()` 直接调用 `prisma.auditLog.create()`
- **审计日志直接写入事务的场景**（如 `harness-rollback.ts`）也必须显式写入 `workspaceId` 字段，从事务上下文中的 proposal 记录派生

**RBAC 门禁体系**（`src/lib/workspace.ts`）：

| 函数 | 用途 | 行为 |
|------|------|------|
| `buildWorkspaceContext(request)` | 构建请求上下文 | 返回 `{ workspaceId, role, userId }`，仅调用 `auth()` 一次 |
| `requireWritable(role)` | 写保护 | VIEWER 抛出 `ForbiddenError` |
| `requireRole(role, minRole)` | 最低角色检查 | 不满足抛出 `ForbiddenError` |
| `requireHarnessAdmin(role)` | Harness 修改保护 | 非 ADMIN/OWNER 抛出 `ForbiddenError` |
| `guardRole(role, minRole, msg?)` | RBAC 门禁便捷封装 | 不满足返回 `Response(403)`，满足返回 `null` |

**RBAC 接入约定**：

- 所有 POST/PATCH/DELETE API 路由**必须**在 handler 开头调用 `const ctx = await buildWorkspaceContext(request)` 后立即执行 `requireWritable(ctx.role)`
- Harness 审批/回滚路由使用 `requireHarnessAdmin(ctx.role)`（仅 ADMIN/OWNER）
- Workspace 成员管理路由使用 `guardRole()` 便捷封装（直接返回 403 Response）
- **禁止**在应用层做 `if (role !== 'VIEWER')` 等裸判断——必须通过上述门禁函数统一校验

**Session 约定**：

- Auth.js v5 JWT 中携带 `workspaceId`（标记当前活跃 workspace），由 JWT callback 注入
- `getWorkspaceId(request)` 解析优先级：`x-workspace-id` 请求头 → session 中的 workspaceId → 默认 `"default"`
- `buildWorkspaceContext()` 内对默认 workspace 做存在性校验，不存在时记录 error 日志

**Middleware（Edge Runtime）**：

- 写操作（POST/PUT/PATCH/DELETE）要求有效 session token，无 token 返回 401
- 系统路由（`/api/maintenance/`、`/api/harness/cron`）免 session 检查
- 粗粒度 VIEWER 角色拦截（从 JWT payload 解码 `role` 字段）
- 细粒度 RBAC 由 Route Handler 层执行（`requireWritable` 等）

***

## 附录：版本历史

| 版本 | 日期 | 变更摘要 |
|------|------|----------|
| v2.0.0-alpha | 2026-06-06 | 初始版本，确立动态 Harness 自演化架构与 AI-First 最高规则 |
| v2.1.0-alpha | 2026-06-07 | HEP-004：新增 §4.7 L1-L4 自动化授权分级，L4 绝对禁止自动、L3 强制人工确认 |
| v2.2.0-alpha | 2026-06-09 | 新增 §2.3 DAG 工作流引擎：轻量级拓扑分层并行调度、条件分支安全约束、子流程嵌套上限、输出校验层集成、Harness 降级自触发
| v2.3.0-alpha | 2026-06-09 | 新增 §4.8 OpenClaw SSE 实时事件管道：事件发射器、SSE 端点、客户端 Hook、共享 SSE 解析器，替换 mock 轮询模式为事件驱动架构 |
| v2.4.0-alpha | 2026-06-09 | 新增 §4.9 Harness 提案一键回滚机制；§4.7 补充 `resolveAutomationLevel` 与 `checkAutomationGate` 共享门禁函数；新增 `previousSnapshot` 字段契约与 `rolled-back` 状态 |
| v2.5.0-alpha | 2026-06-09 | 新增 §4.10 WorkflowGenerator Agent（AI 驱动 DAG 生成引擎）；新增 `src/lib/server/agents/` 目录约定；新增 `src/lib/server/llm-provider.ts` 共享 LLM 工具层；Workflow 模型新增 `draft` 状态；新增 `/api/workflows/generate` 端点 |
| v2.6.0-alpha | 2026-06-10 | 新增 §4.11 多租户 Workspace 与 RBAC：Workspace / WorkspaceMember 模型，OWNER/ADMIN/MEMBER/VIEWER 四级角色，Prisma 查询层强制数据隔离，`buildWorkspaceContext` + RBAC 门禁函数，Edge Middleware 写保护，`guardRole` 便捷封装，默认 Workspace 向后兼容策略 |

***

*本文档由 HermesClaw-v2 项目组制定，依据 AI-First 系统工程原则与动态 Harness 架构理念构建。*
