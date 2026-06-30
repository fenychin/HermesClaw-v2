# HermesClaw PRD
## 面向中小企业的 AI 数字员工操作系统
## 版本：v2.1
## 日期：2026-06-30

---

# 1. 产品重新定义

## 1.1 一句话定义

HermesClaw 是一个面向中小企业的 AI 数字员工操作系统。  
它不是聊天工具，也不是简单把 Hermes Agent 与 OpenClaw 包装在一起，而是由控制内核、执行运行时与行业插件层组成的企业级 AI 工作系统，通过标准运行时契约对接不同的 AI 内核与执行引擎。

## 1.2 与上游项目的关系

- HermesClaw 参考 **Hermes Agent** 的个人代理能力（长期记忆、自进化、skills 系统与工具扩展），在本项目中将其抽象为 **Hermes Control Kernel**，即组织级控制与治理中枢，而不是简单复用其现有产品形态。  
- HermesClaw 参考 **OpenClaw** 的多通道消息入口与事件驱动执行模型，将其抽象为 **OpenClaw Execution Runtime**，即统一执行与事件总线运行时，可替换为其他符合契约的执行框架。  
- 上游项目在 HermesClaw 中被视为「可插拔内核实现」：  
  - Hermes Agent 提供 agent loop、memory、skills 与工具调用能力。  
  - OpenClaw 提供 Gateway、多通道接入、节点与工具运行时。  
- HermesClaw 则围绕三域架构与 Industry Pack 标准构建企业级 OS，定义：  
  - 控制面与执行面的职责边界。  
  - 行业插件的装载标准与版本策略。  
  - 组织级治理、审计与进化机制。

## 1.3 三域架构（与 AGENTS.md 对齐）

### Hermes Control Kernel（控制内核）

负责：

- 意图理解（Intent Parsing）  
- Workflow 生成与编排（DAG Workflow）  
- Memory 管理（会话级 / 项目级 / 组织级记忆）  
- Model Router（模型与推理策略路由）  
- Agent Policy 治理（策略解释权）  
- Harness 评估、提案、审批、灰度与回滚  
- AuditLog / AgentLog 的写入与汇总

### OpenClaw Execution Runtime（执行运行时）

负责：

- 渠道会话与设备在线状态（Gateway / Channels / Nodes）  
- 连接器动作执行与能力注册（Connectors / Tools）  
- 现场数据采集（Presence / Telemetry）  
- 执行事件回传（ExecutionEvent 流）  
- 本地 / 边缘运行时代码执行与动作缓冲  
- Sandbox 模式与主会话模式切换

### Industry Pack Layer（行业插件层）

负责：

- 行业模板（Industry Templates）  
- 岗位 Agent 模板（Role Agents）  
- Skill 包（技能组与 SOP）  
- 行业工作流模板（Workflow Templates）  
- 行业知识包与字段 schema（Domain Knowledge）  
- 行业指标模型与 Dashboard schema（KPI Models）  
- 行业连接器映射（Connector Mapping）

Industry Pack 是可装载、可停用、可升级、可回滚的行业资产集合，而不是将行业逻辑写死在核心服务中。

---

# 2. 产品愿景

构建一个让中小企业可以像管理团队一样管理 AI 数字员工的操作系统。

企业不再购买「单点 AI 功能」，而是管理：

- 数字员工（Digital Employees）  
- 工作流（Workflows）  
- 组织记忆（Organizational Memory）  
- 行业能力包（Industry Packs）  
- 外部连接器（Connectors）  
- 进化提案与治理策略（Proposals & Policies）

目标是从「一次性问答」升级为「可规划、可执行、可记忆、可治理、可进化」的业务系统。

### 2.1 数字员工服务理念

HermesClaw 的数字员工不是功能工具，而是企业的协作伙伴。以下三条服务理念约束所有产品决策：

**渐进式信息暴露原则**
普通用户默认看到业务语义摘要（「本周成功跟进 12 个询盘，转化率提升 8%」）。技术细节（执行事件流、回执记录、审计链路）仅在用户主动展开时显示。产品设计不得把内部系统状态直接暴露为主界面内容。

**不焦虑原则**
系统向用户发出的任何通知、提案、警告，必须包含「下一步可操作建议」。禁止使用损失厌恶型、倒计时型、危机感型的语言风格。风险提示的目的是帮助用户决策，不是制造压力。

**人工复盘不可替代原则**
提升自动化等级不是 HermesClaw 的目标，让企业主做出更好决策才是。每月 EvaluationReport 必须包含「本月建议人工主导复盘事项」模块。系统自动化能力越强，对人工复盘的提示责任越重。

---

# 3. 核心问题

当前中小企业使用 AI 的核心障碍不是「模型不够强」，而是：

1. 没有稳定执行闭环（问答之后谁来执行、执行结果如何沉淀）。  
2. 没有组织级记忆沉淀（知识散落在微信、文档、邮箱）。  
3. 没有行业模板（每家企业都要从零配置）。  
4. 没有可治理的连接器执行面（风控、安全、回滚能力薄弱）。  
5. 没有基于业务反馈的自进化机制（系统不会从成功与失败中学习）。

HermesClaw 要解决的问题是：  
把 AI 从一次性问答工具，升级为可规划、可执行、可记忆、可治理、可进化、可按行业装配的数字员工系统。

---

# 4. 目标用户

## 4.1 核心用户

- 10～300 人中小企业老板  
- 外贸负责人  
- 运营负责人  
- 销售与交付负责人  
- 企业数字化负责人 / CIO / COO

## 4.2 典型需求

- 希望低成本拥有可持续升级的 AI 工作系统。  
- 需要跨渠道、跨文件、跨项目、跨角色协同。  
- 更关注结果闭环，而不是模型参数。  
- 希望行业能力可快速切换与升级。  
- 能够清晰配置「风险等级 + 自动化等级 + 审批策略」，确保业务安全可控。

---

# 5. 核心能力

## 5.1 控制内核能力（Hermes）

- 对话到任务的结构化转换（目标 → TaskEnvelope）。  
- 自然语言生成 DAG Workflow 与子任务拆解。  
- 多层记忆管理（会话 / 项目 / 组织）。  
- Agent Policy 治理与自动化等级控制（L1-L4）。  
- 模型策略路由（不同场景路由到不同模型与推理策略）。  
- Harness 评估 / Proposal / Approval / Canary / Rollback。  
- 与 OpenClaw Runtime 的契约通信（TaskEnvelope / ExecutionEvent / ExecutionSummary）。  

## 5.2 执行运行时能力（OpenClaw）

- 统一接入渠道与设备（Gateway + Channel Adapters）。  
- 连接器动作执行（Connectors / Tools）。  
- 长连接事件流（WebSocket / SSE / gRPC）。  
- 执行状态可观察（ExecutionEvent 流与 Receipt Store）。  
- 本地与移动端场景适配（Runtime Context / Nodes）。  
- 现场反馈事实回传（ActionReceipt / Telemetry）。  

## 5.3 行业插件能力（Industry Pack）

- 外贸 / 医疗 / 教育 / 金融等行业模板装载。  
- 岗位技能包与 SOP（如「外贸跟单员」「客服专员」）。  
- 行业 KPI 与 dashboard schema（如成交周期、转化率）。  
- 行业连接器映射（如 CRM / ERP / 邮件 / WhatsApp）。  
- 行业知识包与字段 schema（如 HS 编码、报价条款）。

---

# 6. 核心业务闭环

1. 用户在 Web 工作台或渠道中发起业务目标（如「本周跟进所有高价值询盘」）。  
2. Hermes 解释意图并选择适合的 Industry Pack 与 Agent Template。  
3. Hermes 生成或选择 WorkflowTemplate 与 Harness Bundle（绑定策略、记忆、风控、评估规则）。  
4. Hermes 下发 TaskEnvelope 给 OpenClaw Runtime。  
5. OpenClaw 调用连接器 / 设备 / 渠道执行动作（发送邮件、创建 CRM 记录、更新表单等）。  
6. OpenClaw 回传 ExecutionEvent / ActionReceipt / ExecutionSummary。  
7. Hermes 写入 AuditLog / AgentLog，更新记忆与项目状态。  
8. Evaluation Engine 定期分析失败率、人工修正、知识缺口与 KPI 偏移。  
9. Proposal Engine 生成 Harness 变更提案（调整 WorkflowTemplate / Policy / EvalRuleSet 等）。  
10. 人工审批后进行 Canary 灰度发布并观察指标。  
11. 达标则正式激活，否则自动回滚到 previous snapshot。

---

# 7. 产品架构

## 7.1 体验层

- Web 工作台（目标配置、任务监控、审批中心）。  
- 移动端执行入口（轻量执行与待办处理）。  
- 审批中心（提案审批、风险动作审批）。  
- 行业工作台（针对某一行业定制的视图）。  
- 项目空间（Project Workspace）。  
- 智慧大脑（企业知识与指标总览）。

## 7.2 控制层（Hermes）

- Workflow Generator（工作流生成与管理）。  
- Memory Engine（多层记忆）。  
- Model Router（模型路由策略）。  
- Policy Engine（策略与自动化等级引擎）。  
- Evaluation Engine（执行与进化评估）。  
- Proposal Engine（自动生成调整提案）。  
- Approval & Rollback Center（审批与回滚中枢）。

## 7.3 执行层（OpenClaw）

- Gateway（长连接核心进程与事件总线）。  
- Channel Adapters（Telegram / WhatsApp / Web / Webhook 等）。  
- Connector Executors（各类业务系统连接器）。  
- Device Runtime（本地与移动设备执行上下文）。  
- Event Stream（ExecutionEvent 流）。  
- Capability Registry（可用能力与连接器注册表）。  

## 7.4 行业层（Industry Pack）

- Agent Templates  
- Skill Packs  
- Workflow Templates  
- Domain Knowledge  
- KPI Schemas  
- Connector Profiles  

## 7.5 治理层

- AGENTS.md（最高规则文档）。  
- RBAC（角色与权限）。  
- AuditLog / AgentLog。  
- Automation Levels（L1-L4）。  
- Guardrails（安全护栏）。  
- Snapshot / Rollback（快照与回滚）。

---

# 8. 产品边界

## 8.1 HermesClaw 不做什么

- 不直接把模型当最终产品（HermesClaw 是 OS，不是单模型）。  
- 不将行业逻辑硬编码在底座核心服务。  
- 不让执行面绕过控制面（OpenClaw 不得绕过 Hermes 执行动作）。  
- 不让 AI 直接无审批修改核心规则与 Guardrail。  
- 不默认把「自动改源码」当作首选进化方式。

## 8.2 HermesClaw 优先做什么

- 稳定任务契约（TaskEnvelope / ExecutionEvent / ExecutionSummary 等）。  
- 稳定事件回传与观察能力。  
- 稳定 Harness Runtime 定义与版本机制。  
- 稳定 Industry Pack 标准与兼容性。  
- 稳定审批 / 灰度 / 回滚机制与审计链路。

---

# 9. MVP 重新定义

## 9.1 MVP 目标

MVP 不追求「全行业覆盖」，而追求「外贸行业的一条可闭环、可治理、可进化主链路」。

## 9.2 MVP 必做

- Web 工作台（目标配置 + 任务视图 + 审批视图）。  
- Hermes 基础控制内核（Intent → Workflow → TaskEnvelope）。  
- OpenClaw 最小执行运行时接入（至少一个异步渠道 + 一个 HTTP 连接器）。  
- 外贸 Industry Pack v1。  
- TaskEnvelope / ExecutionEvent / ExecutionSummary 协议。  
- DAG Workflow 生成与运行。  
- AuditLog / AgentLog / EvaluationReport。  
- HEP Proposal + 审批 + 灰度 + 回滚。  
- Workspace + RBAC。  
- 风险等级 + 自动化等级配置面板（至少支持 L1/L2）。

## 9.3 MVP 暂缓

- 完整多行业市场。  
- 完整移动端 UI。  
- 高级 BI 与可视化报表。  
- 完整多模态编辑器。  
- 自动化财务结算。  
- 全自动源码改写型自进化（只保留提案级工程建议）。

---

# 10. 外贸优先（首个 Industry Pack）

外贸不是一个「页面入口」，而是第一个标准 Industry Pack。

外贸包首批包含：

- 询盘分级与打标签。  
- 开发信生成与多版本 A/B。  
- 客户画像与跟进优先级。  
- 报价生成与版本管理。  
- 样品管理与寄送记录。  
- 跟进提醒与节奏控制。  
- 展会线索整理与导入 CRM。  
- 风险审查（国家风险、信用风险、合规风险）。

同时包含：

- 外贸岗位 Agent 模板（如「外贸跟单员」「展会线索专员」）。  
- 外贸 Skill 包（如「写开发信」「生成报价单」「生成装箱单草稿」）。  
- 外贸连接器映射（CRM / 邮件 / 表格 / 即时通讯）。  
- 外贸 KPI 与 dashboard schema（询盘 → 意向 → 报价 → 成交转化漏斗）。

---

# 11. 关键指标

## 11.1 平台指标

- Workspace 周活企业数。  
- 日均任务数（Task 数量 / 完成率）。  
- 工作流激活数（WorkflowRun 数）。  
- Industry Pack 启用数。  
- 提案通过率。  
- 回滚率。

## 11.2 执行指标

- Task completion rate。  
- Connector success rate。  
- Event return latency。  
- Human intervention rate。  
- Action receipt completeness。

## 11.3 进化指标

- Evaluation trigger 命中率。  
- Proposal adoption rate。  
- Canary success rate。  
- Post-upgrade efficiency gain。  
- Memory hit rate。  
- Knowledge gap reduction。

---

# 12. 路线图

## Phase 1

- Hermes 控制内核最小版。  
  - [x] 评估引擎 ✅ 已实现：
    - 实现文件：[harness-eval.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/harness-eval.ts)
    - 测试文件：[harness-eval.test.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/__tests__/harness-eval.test.ts)
    - 触发升级提案阈值：`connectorSuccessRate < 0.85` / `humanCorrectionRate > 0.15` / `memoryHitRate < 0.70` / `kpiDriftIndex > 0.20` / `overallScore < 60`
- OpenClaw 执行接入最小版（单通道 + 单连接器）。  
- 外贸 Industry Pack v1。  
- 审批 / 灰度 / 回滚最小闭环。  
- 基础 Workspace + RBAC。

## Phase 2

- [x] P0-A Runtime 契约层 ✅ 已实现
  - 实现目录：[contracts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/packages/event-contracts/src/)
  - 覆盖范围：完整覆盖 AGENTS.md 第三章 (Runtime Contracts §3.1～§3.4)
  - 包括 6 大核心契约对象及 3 大实用辅助函数 (`createTaskEnvelope`, `isHighRiskWithoutReceipt`, `isCheckpointExpired`)
- [x] P0-B Approval 服务端引擎 ✅ 已实现
  - 实现文件：[approval.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/approval.ts)
  - 覆盖接口：`createApprovalCheckpoint`, `decideApprovalCheckpoint`, `expireStaleCheckpoints`, `getApprovalCheckpoint`, `listPendingCheckpoints`
  - 接入链路：已完整打通高危动作安全护栏拦截（`guardrail.ts`）与自演化高危提案（`proposal-engine.ts`）的检查点自动生成与审批门禁，进化闭环状态已实现完整闭环：`执行→反馈→评估→提案→审批→快照(P1-A)→灰度(P1-B)→回滚/生效(P1-C)` 已全面贯通。
- [x] P1-A Harness Snapshot 快照机制 ✅ 已实现
  - 实现文件：[harness-snapshot.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/harness-snapshot.ts)
  - 核心功能：提案批准后、Canary 启动前，自动捕获 Agent 配置、Workflow 模板、Skill 与 Connector 绑定关系等运行时快照，作为唯一回滚数据基础。
- [x] P1-B Canary 灰度发布状态机 ✅ 已实现
  - 实现文件：[canary.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/canary.ts)
  - 核心功能：支持多生命周期状态流转、流量比例控制与巡检 Cron 定时评估，在指标恶化时触发 Early Abort 自动回滚。
- [x] P1-C Harness Rollback 回滚引擎 ✅ 已实现
  - 实现文件：[rollback.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/rollback.ts)
  - 核心功能：支持单个事务内原子恢复与解绑、幂等重试、以及 `critical` 级二次确认防护的手动回滚/重试管理员 API。
- [x] P2-A Capability Registry ✅ 已实现
  - 实现文件：[capability-registry.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/capability-registry.ts)
  - 核心功能：统一能力注册、版本化管理、语义化版本（SemVer）发现与滚动健康度重算。
- [x] P2-B Built-in Email Connector ✅ 已实现
  - 实现文件：[email-connector.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/connectors/email-connector.ts)
  - 核心功能：支持原生 SMTP 发送、事务速率限制、Mustache 模板渲染、退订链接注入、退避重试与高危门禁。
- [x] P2-C Industry Pack Loader v2 ✅ 已实现
  - 实现文件：[industry-pack-loader.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/industry-pack-loader.ts)
  - 核心功能：Manifest 契约校验、递归依赖分析与深度拦截、组件实体更新、自动事务注册及非物理删除的回滚/卸载（Graceful Deprecation）逻辑。
- [x] 项目空间中期记忆增强 ⚠️ 部分实现
  - 实现文件：[memory-service.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/memory-service.ts)
  - 核心功能：实现了基于修订快照 `MemoryRevision` 与 `projectId` 隔离底层存储事务，保障企业跟进时记忆不丢失，上线后将迭代跨项目自动摘要引擎。
- [x] 更强的评估引擎（包含部分自动提案） ⚠️ 部分实现
  - 实现文件：[proposal-engine.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/proposal-engine.ts)
  - 核心功能：实现了基于评估报告失败率指标分流自动生成提案，已打通自演化闭环，上线后将迭代 LLM 语义推理提案模块。
- [x] 多角色协同审批与多级门禁 ⚠️ 部分实现
  - 实现文件：[validators.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/validators.ts) / [api-handler.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/api-handler.ts)
  - 核心功能：已打通三级 RBAC 拦截与 Guardrail 二次确认防线，支持管理员（工作区 ADMIN）一键审批，复杂多角色串联审批将作为上线后演化。

## Phase 3


- [x] P3-A Workflow Runtime Engine ✅ 已实现
  - 实现目录：[workflow/](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/workflow/)
  - 核心功能：支持串行（sequential）、并行（parallel）、条件分支（conditional）、人工介入（human-in-loop）四种工作流执行模式，以及对应的 30 分钟整点/60 秒节点超时巡检。
- [x] P3-B Multi-Agent Orchestrator ✅ 已实现
  - 实现文件：[orchestrator.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/orchestrator.ts)
  - 核心功能：多智能体编排会话管理，对 L3 门禁、全局 15 分钟超时控制、任务分发与并发 `allSettled` 退避重试、以及 `union/append/first-wins/majority` 结果合并进行了完整覆盖。
- 多行业 Industry Pack 市场。  
- 企业级策略模板库。  
- 更强的半自动自进化（依赖真实业务指标）。  
- 经营分析与行业智能增强。

---

# 13. 成功标准

HermesClaw 成功的标志不是「集成了多少模型」，而是：

- 企业能否稳定运行数字员工（执行可观测、可诊断）。  
- 行业包能否低成本切换（不改核心代码即可切换行业场景）。  
- 执行面能否持续回传事实（Receipt 与 ExecutionEvent 完整）。  
- 控制面能否持续评估与治理（有审计、有提案、有审批）。  
- 升级是否可灰度、可回滚、可追责（每次变更可解释、有证据链）。

---

# 14. PRD-源码对齐矩阵 (附件)

本附件记录了 PRD 及 `AGENTS.md` 中各项功能声明与当前代码库（`v3.16.00-dev`）的映射关系。

## 14.1 Hermes Control Kernel (控制内核)

| # | PRD 功能声明 | 来源章节 | 实现文件 | 关键函数/类名 | 测试文件 | 状态 |
|---|---|---|---|---|---|---|
| HK-01 | 意图理解 (Intent Parsing) | §5.1 | [intent-service.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/intent-service.ts) | `parseIntentToTaskEnvelope` | [intent-service.test.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/__tests__/intent-service.test.ts) | ✅ |
| HK-02 | DAG Workflow 生成与编排 | §5.1 | [runtime-engine.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/workflow/runtime-engine.ts) | `executeWorkflowRun` | [runtime-engine.test.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/workflow/__tests__/runtime-engine.test.ts) | ✅ |
| HK-03 | 多层记忆管理（会话/项目/组织） | §5.1 | [memory-service.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/memory-service.ts) | `MemoryService` (`createMemory`, `updateMemory`) | [memory-service.test.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/test/memory-service.test.ts) | ⚠️ |
| HK-04 | Agent Policy 治理 (L1-L4) | §5.1 | [boundary.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/boundary.ts) \| [guardrail.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/guardrail.ts) | `assertWithinBoundary`, `checkAutomationGate` | [boundary.test.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/test/boundary.test.ts) | ✅ |
| HK-05 | 模型策略路由 | §5.1 | [model-router.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/model-router.ts) | `routeModel` | [model-router.test.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/__tests__/model-router.test.ts) | ✅ |
| HK-06 | Harness 评估 | §5.1 | [harness-eval.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/harness-eval.ts) | `evaluateHarness` | [harness-eval.test.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/__tests__/harness-eval.test.ts) | ✅ |
| HK-07 | Proposal 生成 | §5.1 | [proposal-engine.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/proposal-engine.ts) | `generateProposal` | [approval.test.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/__tests__/approval.test.ts) (集成) | ⚠️ |
| HK-08 | 审批流程 | §5.1 | [approval.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/approval.ts) | `createApprovalCheckpoint`, `decideApprovalCheckpoint` | [approval.test.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/__tests__/approval.test.ts) | ✅ |
| HK-09 | 灰度发布 (Canary) | §5.1 | [canary.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/canary.ts) | `startCanary`, `abortCanary` | [canary.test.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/__tests__/canary.test.ts) | ✅ |
| HK-10 | 回滚引擎 | §5.1 | [rollback.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/rollback.ts) | `executeRollback` | [rollback.test.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/__tests__/rollback.test.ts) | ✅ |
| HK-11 | Multi-Agent 编排 | §7.2 | [orchestrator.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/orchestrator.ts) | `runOrchestration`, `createOrchestrationSession` | [orchestrator.test.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/__tests__/orchestrator.test.ts) | ✅ |
| HK-12 | AuditLog / AgentLog 写入 | §7.2 | [audit.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/audit.ts) \| [agent-log.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/agent-log.ts) | `writeAuditLog`, `writeAgentLog` | [route.test.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/app/api/audit/__tests__/route.test.ts) (API集成) | ✅ |

## 14.2 OpenClaw Execution Runtime (执行运行时)

| # | PRD 功能声明 | 来源章节 | 实现文件 | 关键函数/类名 | 测试文件 | 状态 |
|---|---|---|---|---|---|---|
| OC-01 | Connector 动作执行 | §5.2 | [email-connector.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/connectors/email-connector.ts) \| [http-connector.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/connectors/http-connector.ts) | `sendEmail`, `executeHttpConnector` | [email-connector.test.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/__tests__/email-connector.test.ts) | ✅ |
| OC-02 | 执行状态可观察 (ExecutionEvent) | §5.2 | [execution-event.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/packages/event-contracts/src/execution-event.ts) | `ExecutionEventSchema` | [contracts.test.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/__tests__/contracts.test.ts) | ✅ |
| OC-03 | ActionReceipt 回传 | §5.2 | [action-receipt.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/packages/event-contracts/src/action-receipt.ts) | `ActionReceiptSchema` | [contracts.test.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/__tests__/contracts.test.ts) | ✅ |
| OC-04 | 能力注册 (Capability Registry) | §5.2 | [capability-registry.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/capability-registry.ts) | `registerCapability` | [capability-registry.test.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/__tests__/capability-registry.test.ts) | ✅ |
| OC-05 | Workflow 4 种执行模式 | §5.2 | [runtime-engine.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/workflow/runtime-engine.ts) | `executeWorkflowRun` (按模式分流) | [runtime-engine.test.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/workflow/__tests__/runtime-engine.test.ts) | ✅ |

## 14.3 Industry Pack Layer (行业插件层)

| # | PRD 功能声明 | 来源章节 | 实现文件 | 关键函数/结构 | 测试文件 | 状态 |
|---|---|---|---|---|---|---|
| IP-01 | 行业包装载/停用/升级/回滚 | §5.3 | [industry-pack-loader.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/industry-pack-loader.ts) | `installPack`, `uninstallPack` | [industry-pack-loader.test.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/__tests__/industry-pack-loader.test.ts) | ✅ |
| IP-02 | 外贸 Industry Pack v1 | §10 | [foreign-trade/](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/industry-packs/foreign-trade/) | `manifest.yaml` | [foreign-trade-health.test.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/test/foreign-trade-health.test.ts) | ✅ |
| IP-03 | 行业 KPI Schema | §5.3 | [kpi.yaml](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/industry-packs/foreign-trade/dashboards/kpi.yaml) | `steps` (KPI Funnel) | [foreign-trade-health.test.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/test/foreign-trade-health.test.ts) | ✅ |
| IP-04 | 行业连接器映射 | §5.3 | [mapping.yaml](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/industry-packs/foreign-trade/connectors/mapping.yaml) | mapping 规则声明 | [foreign-trade-health.test.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/test/foreign-trade-health.test.ts) | ✅ |
| IP-05 | 行业健康度 | §7.4 | [industry-health.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/industry-health.ts) | `getIndustryHealthData` | [foreign-trade-health.test.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/test/foreign-trade-health.test.ts) | ✅ |

## 14.4 治理层 (Governance)

| # | PRD 功能声明 | 来源章节 | 实现文件 | 关键函数 | 测试文件 | 状态 |
|---|---|---|---|---|---|---|
| GOV-01 | RBAC 权限控制 | §7.5 | [validators.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/validators.ts) \| [api-handler.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/api-handler.ts) | `checkPermission`, `withRBAC` | [validators.test.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/test/validators.test.ts) | ⚠️ |
| GOV-02 | Guardrail 安全护栏 | §7.5 | [guardrail.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/guardrail.ts) | `checkConfirmQuery`, `checkConfirmValue` | [rollback.test.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/__tests__/rollback.test.ts) (集成) | ✅ |
| GOV-03 | Snapshot 快照 | §7.5 | [harness-snapshot.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/harness-snapshot.ts) | `captureSnapshot`, `getLatestSnapshot` | [harness-snapshot.test.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/__tests__/harness-snapshot.test.ts) | ✅ |
| GOV-04 | 自动化等级 L1-L4 控制 | §7.5 | [boundary.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/boundary.ts) \| [guardrail.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/lib/server/guardrail.ts) | `assertWithinBoundary`, `checkAutomationGate` | [boundary.test.ts](file:///d:/Users/frankfeny/Desktop/HermesClaw-v3/apps/web/src/test/boundary.test.ts) | ✅ |

---

# 15. 统计汇总与缺口收敛建议

## 15.1 功能实现统计

| 运行域 (Domain) | 总功能数 | ✅ 已实现 | ⚠️ 部分实现 | ❌ 未实现 | 实现率 (Completion Rate) |
|---|---|---|---|---|---|
| Hermes Control Kernel | 12 | 10 | 2 | 0 | 83.3% |
| OpenClaw Execution Runtime | 5 | 5 | 0 | 0 | 100.0% |
| Industry Pack Layer | 5 | 5 | 0 | 0 | 100.0% |
| 治理层 (Governance) | 4 | 3 | 1 | 0 | 75.0% |
| **总计 (Total)** | **26** | **23** | **3** | **0** | **88.5%** |

## 15.2 ⚠️ (部分实现) 项缺口分析与上线收敛建议

### 1. 多层记忆管理（HK-03）
- **缺口描述**：底层已通过 `MemoryService` 强制数据库事务与 `MemoryRevision` 修订版本链，保障了修改的防丢失和 workspaceId 的多租户物理隔离。但在与 Hermes 大模型交互的对话上下文层，尚未完成面向长期/组织记忆的自动摘要合并与跨项目记忆去重引擎。
- **上线风险**：**极低**。当前的项目级和会话级记忆足以支撑外贸包日常跟进和询盘上下文，不阻塞 MVP 流程。
- **最小收敛方案**：上线后在 `memory-service.ts` 中接入定时记忆压缩 Cron，通过 LLM 异步压缩 mid 记忆至 long 记忆。

### 2. Proposal 提案生成（HK-07）
- **缺口描述**：已实现了 `harness-eval.ts` 读取系统错误率、人工干预率等数值，并通过 `proposal-engine.ts` 的规则分流模块自动产生 Harness 升级提案（落库并写入审计），实现了自演化闭环。但目前该提案的分流完全基于静态错误率阈值分流，还不是由大语言模型（LLM）语义分析直接推理出针对 Workflow 拓扑的深度优化建议。
- **上线风险**：**极低**。当前的静态规则流已经能针对不同错误率正确路由“任务边界/上下文供给/工具接入”三类提案，并可被人工安全审核与灰度。
- **最小收敛方案**：上线后在 `proposal-engine.ts` 中引入 LLM，将评估报告的 Markdown 文本作为 context 灌入，自动让大模型输出微调后的 Harness 参数建议。

### 3. RBAC 权限控制（GOV-01）
- **缺口描述**：完成了 API 请求层 `withRBAC` 三级权限角色校验拦截、Prisma 层工作区物理隔离，以及在页面层对 VIEWER/MEMBER/ADMIN 菜单操作的校验。但在多智能体进化等高风险业务场景下，尚不支持指定多个 ADMIN 依次按序签字的多人串联审批工作流。
- **上线风险**：**无**。当前单审批人（工作区 ADMIN / 拥有者）的一键“批准/拒绝”机制能完美覆盖企业治理风控，不影响上线。
- **最小收敛方案**：在 `ApprovalCheckpoint` 结构中追加 `requiredSigners` 数组与已签字列表，实现轻量级链式审批流程。
