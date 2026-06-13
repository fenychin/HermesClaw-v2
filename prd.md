# HermesClaw PRD
## 面向中小企业的 AI 数字员工操作系统
## 版本：v1.2
## 日期：2026-06-12

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
- OpenClaw 执行接入最小版（单通道 + 单连接器）。  
- 外贸 Industry Pack v1。  
- 审批 / 灰度 / 回滚最小闭环。  
- 基础 Workspace + RBAC。

## Phase 2

- Capability Registry（能力注册与发现）。  
- 多连接器增强。  
- 项目空间中期记忆增强。  
- 更强的评估引擎（包含部分自动提案）。  
- 多角色协同审批与多级门禁。

## Phase 3

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