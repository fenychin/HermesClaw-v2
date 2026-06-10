# AGENTS.md — HermesClaw-v2 项目最高规则文档

> **版本**: v2.9.0-alpha  
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
- **可插拔 handler**：节点按 `kind`（task | condition | subworkflow | skill | noop）派发到 handler 注册表，task 类节点由调用方注册真实执行器，skill 节点由内置 `executeSkillNode` 处理

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
- **自动化授权等级**：Prisma `Skill` 模型新增 `automationLevel` 字段（默认 `L2`），用于 DAG 工作流执行时的门禁控制（§4.7 / §4.13）。种子脚本 `seed-skills.ts` 默认写入 `L2`，特定技能可手动覆写。
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
- **AgentLog.riskLevel**：AgentLog 模型新增 `riskLevel` 字段（`low` / `medium` / `high`），Skill 节点执行时由 `automationLevel` 映射填充（L1/L2→low，L3→medium，L4→high），供 Harness 评估引擎按风险分级统计

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
- **L4 规范化拒绝体**：所有治理路由对 L4 动作的拒绝，统一返回 `{ success:false, error:'L4_FORBIDDEN', message:'L4 动作禁止系统自动审批，须在源业务系统人工发起' }`（HTTP 403）。该响应体由 `checkAutomationGate` 统一产出，**禁止在路由层旁路复制 L4 判定/自建拒绝体**（避免与共享门禁逻辑分叉）。
- **L3 强制二次确认**：审批 API 缺少显式确认时返回 409，前端弹确认对话框，复用 4.5 高危操作护栏机制。
- **派生规则**：未显式标注 `automationLevel` 的 Harness 提案，按 `riskLevel` 派生（high→L3 / mid→L2 / low→L1）。
- **统一解析**：`resolveAutomationLevel(automationLevel, riskLevel)` 封装了「显式标注优先，否则派生」的逻辑（`src/types/harness.ts`），供 Route Handler / guardrail / harness-eval 等所有调用方复用。
- **统一门禁**：`checkAutomationGate({ automationLevel, riskLevel, confirmed, actionName })`（`src/lib/server/guardrail.ts`）封装了 L4 硬拒绝（403）、L3 二次确认拦截（409）的完整判定链，供 approve / reject / rollback 等治理路由复用，避免在多处重复 L4/L3 检查逻辑。其返回结果（`GuardrailResult`）统一携带解析出的 `level` 字段，调用方据此审计/分支（如对 L4 写 `proposal.approve.l4_blocked` 审计），**无需自行重算 `resolveAutomationLevel`**。
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
| `WorkspaceSettings` | `workspaceId`(PK), `defaultModel`, `taskProviderMap` | 模型路由配置：默认模型 + 各 taskType Provider 偏好（JSON），级联删除 |

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
| `withRBAC(handler, requiredRole)` | 统一 RBAC 包裹器（`src/lib/server/api-handler.ts`） | 构建 ctx → 校验 `requiredRole` → 不满足写 `AuditLog(action='RBAC_DENIED')` 并返回 403 → 满足则把已解析 ctx 注入 handler |

**「审批 L3」语义澄清**（消除角色矩阵与接入约定的歧义）：

- 角色矩阵中「审批 L3」一栏指 **L3 业务动作**（如发送报价单等 `TRADE_ACTIONS`），`MEMBER` 及以上可审批。
- **Harness 升级提案**的审批/拒绝/回滚属于「修改 Harness」，仅 `ADMIN/OWNER` 可执行——以矩阵「修改 Harness」列为准。

**RBAC 接入约定**：

- 所有 POST/PATCH/DELETE API 路由**必须**经 RBAC 门禁。两种等价接入方式（择一，勿混用于同一路由）：
  - **包裹式（推荐新路由）**：`export const POST = withRBAC(async (req, ctx, routeCtx) => {...}, '<最低角色>')`——拒绝时自动写 `RBAC_DENIED` 审计并返回统一 403 体 `{ success:false, error:'RBAC_DENIED', message }`。
  - **内联式（既有路由）**：handler 开头 `const ctx = await buildWorkspaceContext(request)` 后立即 `requireWritable(ctx.role)` / `requireHarnessAdmin(ctx.role)`。
- Harness 审批/拒绝/回滚路由要求 `ADMIN`（`withRBAC(..., 'ADMIN')` 或 `requireHarnessAdmin`）。
- 写操作通用最低角色为 `MEMBER`（即非 VIEWER）。
- Workspace 成员管理路由使用 `guardRole()` 便捷封装（直接返回 403 Response）。
- **禁止**在应用层做 `if (role !== 'VIEWER')` 等裸判断——必须通过上述门禁函数统一校验。
- **审计动作枚举**：RBAC 拒绝写 `RBAC_DENIED`；提案治理写 `proposal.approve` / `proposal.reject` / `proposal.approve.l4_blocked`（L4 硬拦截留痕）；工作流执行写 `workflow.run`；策略路由写 `model.route`；模型路由配置变更写 `update.model-routing`；询盘创建写 `inquiry.create`；报价创建写 `quotation.create`。

**Session 约定**：

- Auth.js v5 JWT 中携带 `workspaceId`（标记当前活跃 workspace），由 JWT callback 注入
- `getWorkspaceId(request)` 解析优先级：`x-workspace-id` 请求头 → session 中的 workspaceId → 默认 `"default"`
- `buildWorkspaceContext()` 内对默认 workspace 做存在性校验，不存在时记录 error 日志

**Middleware（Edge Runtime）**：

- 写操作（POST/PUT/PATCH/DELETE）要求有效 session token，无 token 返回 401
- 系统路由（`/api/maintenance/`、`/api/harness/cron`）免 session 检查
- 粗粒度 VIEWER 角色拦截（从 JWT payload 解码 `role` 字段）
- 细粒度 RBAC 由 Route Handler 层执行（`requireWritable` 等）

### 4.12 策略路由（Model Router）

> 本节定义 Harness 策略路由环境层——依据任务类型、风险等级、估算预算，决定单次 LLM 调用应使用的 Provider 与模型，并将决策留痕至审计日志。

**核心模块**：`src/lib/server/model-router.ts` — 业务逻辑下沉，仅服务端调用（读取环境变量 + 数据库）。

**路由上下文**（`ModelRouteContext`）：

- `taskType`：`chat` | `workflow` | `analysis` | `generation`
- `riskLevel`：`low` | `medium` | `high`（注意：审计日志用 `mid`，函数 `toAuditRiskLevel` 负责映射）
- `estimatedTokens`：预估 token 数（供后续预算扩展）
- `workspaceId`：多租户隔离定位

**路由优先级**（`selectModel(ctx)`）：

1. `riskLevel === 'high'` → 高能力模型（`claude-sonnet-4-6` / anthropic），绕过工作空间配置
2. `taskType === 'workflow'` 且非 high → 成本优化模型（`deepseek-chat` / deepseek）
3. 其余 → 读 `WorkspaceSettings` 的可配置默认模型 + per-taskType Provider 偏好（fallback `deepseek-chat`）

**Provider 可用性降级**（§2.3 失败自动降级）：选中 Provider 的 API Key 缺失时，自动切换到另一可用 Provider（含模型映射），降级原因写入 audit detail。

**约束**：

- **禁止硬编码模型**：所有 LLM 调用方必须经 `selectModel()` 决策，不得自行写死 Provider/模型（§1.2 环境驱动）
- **强制审计留痕**：每次路由决策必须写入 `AuditLog(action='model.route', targetType='model')`，`riskLevel` 继承上下文（§1.2 数据主权；无日志静默执行属违规）
- **配置权限**：`WorkspaceSettings` 的修改仅限 OWNER/ADMIN（API `PATCH /api/workspace/settings` 经 `guardRole(ADMIN)` 门禁）
- **配置读取失败安全降级**：`getWorkspaceModelSettings()` 读取失败不抛异常，降级返回缺省值并 warn

**共享 LLM 工具层扩展**（`src/lib/server/llm-provider.ts`）：

- 新增导出：`DEFAULT_ANTHROPIC_MODEL`、`DEFAULT_DEEPSEEK_MODEL`、`isProviderAvailable(provider)` — 统一 key 可用性判定，供 model-router 等复用
- 新增导出：`openChatStream(options, onDelta)` — 共享流式调用，收敛 DeepSeek SSE 透传与 Anthropic `messages.stream` 为同一接口，供 chat / workflow-generator 等流式端点复用
- 新增导出：`classifyUpstreamError(httpStatus)` — 上游错误码→友好降级信息，DeepSeek + Anthropic 对齐

**管理 API**：`GET/PATCH /api/workspace/settings` — 仅 OWNER/ADMIN 可写，写时记录 `AuditLog(action='update.model-routing')`

**UI**：`/settings?section=model-routing` — 默认模型下拉 + 4× taskType Provider 偏好下拉；非管理员只读（保存按钮禁用 + 警示条）。

### 4.13 DAG Skill 节点执行器

> 本节定义 DAG 工作流中 `kind='skill'` 节点的执行语义——从数据库加载 Skill 并通过 LLM 真实执行（非 noop）。

**核心模块**：`src/lib/server/workflow/dag-runner.ts` — `executeSkillNode()` 函数，作为内置 `skill` handler 注册到 DAG 引擎。

**执行流程**：

```text
1. 从节点 config.skillId 加载 DB Skill 记录（含 workspaceId 数据隔离校验）
     ↓
2. automationLevel 门禁
   ├── L4 → 直接拒绝（L4_FORBIDDEN）
   ├── L3 → 查当前 workspace 内已审批 HarnessProposal（targetComponent=skillId 或 skill:<id>），缺则拒绝
   └── L1/L2 → 放行
     ↓
3. 读取 .claude/skills/<skill.name>/SKILL.md（缺失时回退为 DB 元数据 + 通用约束）
     ↓
4. 注入 AGENTS.md 治理规则（loadAgentsMd()）→ 拼入 system prompt
     ↓
5. selectModel({ taskType:'workflow', ... }) 策略路由 → Provider/Model（§4.12）
     ↓
6. 调用 LLM（Anthropic / DeepSeek）执行技能
     ↓
7. 校验 confidence 阈值（§4.5：< 0.7 时升格 riskLevel 为 high 并标记待人工确认）
     ↓
8. 返回 NodeExecutionResult（含 riskLevel），由 onNodeFinish 钩子统一写入 AgentLog + AuditLog
```

**共享映射函数**（`src/types/harness.ts`，供 dag-runner / guardrail / 所有 Skill 调用方复用）：

| 函数 | 用途 |
|------|------|
| `mapAutomationToLogRisk(level)` | AutomationLevel → AgentLog riskLevel（L1/L2→low, L3→medium, L4→high） |
| `mapAutomationToAuditRisk(level)` | AutomationLevel → AuditLog riskLevel（L1/L2→low, L3→mid, L4→high） |
| `mapAutomationToRouteRisk(level)` | AutomationLevel → selectModel() RouteRiskLevel（L1/L2→low, L3→medium, L4→high） |
| `resolveAutomationLevel(level, risk)` | 显式标注优先，否则由 riskLevel 派生（已有，§4.7） |

**约束**：

- **禁止硬编码模型**：Skill 节点必须经 `selectModel()` 路由，不得写死 Provider/模型（§1.2 环境驱动 / §4.12）
- **禁止双写日志**：AgentLog / AuditLog 统一由 `onNodeFinish` 生命周期钩子写入，`executeSkillNode` 自身不写日志（避免与钩子重复）
- **输出校验单次执行**：`guardOutput()` 仅在 `onNodeFinish` 钩子中执行一次，handler 内不重复校验（Skill 节点输出为结构化对象，非纯文本时由钩子跳过）
- **数据隔离**：Skill 查询和 HarnessProposal 查询必须带 `workspaceId` 过滤（§4.11），Skill 不属于当前 workspace 时拒绝并标记 `riskLevel='high'`
- **L4 不可绕过**：与 §4.7 一致，L4 技能的自动执行被绝对禁止，错误消息含 `L4_FORBIDDEN`
- **L3 审批范围**：L3 技能的执行审批限于当前 workspace 内的 HarnessProposal（`status='approved'`，`targetComponent` 为 `skillId` 或 `skill:<id>`）
- **置信度阈值**：LLM 输出 `confidence < 0.7` 时自动升格 riskLevel 为 `high` 并注入警示信息到输出 `_meta.warnings`，不阻断执行但要求下游/操作者进行人工审核（§4.5）
- **AgentLog 风险标签**：Skill 节点执行结果通过 `NodeExecutionResult.riskLevel` 传递给 `onNodeFinish`，钩子据此写入 AgentLog 和 AuditLog 的 riskLevel

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
| v2.7.0-alpha | 2026-06-10 | RBAC 统一守卫 + L4/L3 治理加固：§4.11 新增 `withRBAC` 统一包裹器（`RBAC_DENIED` 审计）+ 审批角色澄清；§4.7 新增 L4 规范化拒绝体 `L4_FORBIDDEN` + `checkAutomationGate` 携带 `level` + 消除双重 L4 判定；§4.3 注册新审计动作 `proposal.approve`/`reject`/`l4_blocked`/`workflow.run`；新增 `AlertDialog` 组件；审批中心 L3 高风险接真实 approve API |
| v2.8.0-alpha | 2026-06-10 | 新增 §4.12 策略路由（Model Router）：`selectModel()` 按 risk/taskType/WorkspaceSettings 路由 Provider 与模型，强制审计留痕，Provider 不可用自动降级；共享 LLM 层新增 `openChatStream`/`isProviderAvailable`/`classifyUpstreamError` 导出；新增 `WorkspaceSettings` + `/api/workspace/settings`；chat API 移除硬编 DeepSeek，全面接入策略路由；generator output 对齐至 `prisma-new` |
| v2.9.0-alpha | 2026-06-10 | 新增 §4.13 DAG Skill 节点执行器：`executeSkillNode()` 将 `kind='skill'` 节点通过 `selectModel()` 调用 LLM 真实执行（非 noop）；Skill 模型新增 `automationLevel` 字段（L1-L4 门禁）；AgentLog 新增 `riskLevel` 字段；L3 审批门禁查询含 workspaceId 隔离；置信度 < 0.7 自动升格 riskLevel；提取 `mapAutomationToLogRisk`/`mapAutomationToAuditRisk`/`mapAutomationToRouteRisk` 共享映射函数至 `src/types/harness.ts` |

***

*本文档由 HermesClaw-v2 项目组制定，依据 AI-First 系统工程原则与动态 Harness 架构理念构建。*
