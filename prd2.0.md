# HermesClaw 行业情报中心 v2.0
## PRD 增补稿 — 行业大盘 Agent 心跳架构
### 文档类型：Industry Pack PRD 增补
### 版本：v2.0.0 | 日期：2026-06-18
### 父文档：HermesClaw PRD v1.2 / AGENTS.md v3.0.0

---

> 增补声明
> 本稿为 HermesClaw PRD v1.2 的行业层扩展，聚焦「行业情报中心 v2.0」的
> Agent 心跳任务架构、五大板块 Agent 映射与 Harness 治理规范。
> 所有 Agent 均运行在 Industry Pack Layer，通过标准 TaskEnvelope 与
> Hermes Control Kernel 通信，不得侵入 Hermes 或 OpenClaw 内核逻辑。

---

## 第一章：产品背景与目标

### 1.1 升级动因

行业用户对现有「行业大盘」板块的核心诉求：
- 数据必须实时，不能靠人工刷新。
- 判断必须有依据，不能只有数字。
- 系统必须会学习，每次推演结果要被记录。
- 决策建议必须可以追责，谁建议、谁审批要留痕。

现有行业大盘缺少驱动数据刷新的后台执行机制，所有指标均为一次性拉取。
本次升级引入「定时心跳 Agent」体系，使每个展示板块背后均有对应的
Agent 持续采集、分析与推送，形成真正的实时情报中枢。

### 1.2 升级目标

| 目标 | 度量标准 |
|---|---|
| 数据实时性 | 核心指标刷新延迟 ≤ 3s（流式）/ ≤ 30s（批次） |
| Agent 覆盖率 | 五大板块各有至少 1 个专属 Agent 心跳任务 |
| 进化可见性 | 板块5能展示真实 Proposal 生命周期，非装饰动画 |
| 审计完整性 | 所有 Agent 执行均写入 AgentLog，关键决策写 AuditLog |
| 可回滚性 | 所有 AgentPolicy 变更均通过 Harness 灰度机制发布 |

### 1.3 核心约束（不可覆盖）

- 所有心跳 Agent 属于 Industry Pack Layer，不修改 Hermes / OpenClaw 核心。
- 心跳任务通过 WorkflowTemplate 定义调度频率，不使用外部 cron 服务绑架核心。
- Agent 只能向 Hermes 发起 TaskEnvelope（L1/L2 授权），不可直接写业务数据库。
- 高频心跳（≤ 5s）只允许向 OpenClaw 推送 intel.* 事件，不触发连接器动作。
- 所有 Agent 均需声明 sandboxMode 支持，可随时切换为沙盘模式调试。

---

## 第二章：Agent 心跳架构总览

### 2.1 架构层级图

┌─────────────────────────────────────────────────────────────────────┐
│                    行业情报中心 v2.0 Agent 架构                        │
├────────────────┬───────────────────────────────┬────────────────────┤
│  Hermes        │   Industry Pack Agent 层        │  OpenClaw          │
│  Control       │   (心跳调度 + 分析推理)            │  Execution         │
│  Kernel        │                                 │  Runtime           │
├────────────────┼───────────────────────────────┼────────────────────┤
│                │  [A1] 战略态势感知 Agent           │                    │
│  意图解析        │  [A2] 数据流量动力学 Agent         │  SSE 事件流          │
│  WorkflowGen  │  [A3] 行业生态星云 Agent            │  intel.* 事件族     │
│  ModelRouter  │  [A4] 推演沙盘 Agent               │  Connector 执行     │
│  PolicyEngine │  [A5] 人机进化核心 Agent            │  Telemetry 采集     │
│  EvalEngine   │                                 │                    │
│  ProposalGen  │  ↑ 所有 Agent 通过 TaskEnvelope   │                    │
│  AuditLog     │    与 Hermes 通信                 │                    │
│                │  ↓ 执行结果由 OpenClaw 回传        │                    │
└────────────────┴───────────────────────────────┴────────────────────┘

心跳调度机制：
WorkflowTemplate(type=scheduled) → Hermes 定时触发 TaskEnvelope
→ OpenClaw 执行 Agent Skill → 结果回传 ExecutionEvent
→ Hermes 写 AgentLog → OpenClaw 推送 intel.* 事件 → 前端消费

### 2.2 五 Agent 心跳频率对比

| Agent ID | Agent 名称 | 心跳频率 | 授权等级 | 触发方式 |
|---|---|---|---|---|
| A1 | 战略态势感知 Agent | 30s | L2 | Scheduled WorkflowTemplate |
| A2 | 数据流量动力学 Agent | 3s（流式）| L1 | Event-driven + Scheduled |
| A3 | 行业生态星云 Agent | 5min | L2 | Scheduled WorkflowTemplate |
| A4 | 推演沙盘 Agent | 按需 | L1（沙盘）| User-triggered TaskEnvelope |
| A5 | 人机进化核心 Agent | 1hr | L2 | Scheduled + Eval-triggered |

---

## 第三章：五大板块 Agent 详细规格

### 3.1 A1：战略态势感知 Agent

职责：定时采集行业雷达多维度指标，生成态势快照，推送战术警报。

心跳行为：
```yaml
agentId: industry-strategic-awareness-agent
agentTemplate: industry-intel/strategic-awareness-v2
scheduledWorkflow:
  templateId: wf-strategic-awareness-heartbeat
  interval: 30s
  automationLevel: L2
  riskLevel: LOW

skills:
  - skill.industry.radar-score-compute    # 计算 8 维雷达分值
  - skill.industry.policy-nlp-scan        # 政策语义扫描
  - skill.industry.event-signal-classify  # 事件信号分类（L1/L2/L3 威胁等级）
  - skill.industry.heatmap-region-update  # 区域热度更新

output:
  - emitEvent: intel.signal.detected      # 推送到 OpenClaw SSE 流
  - writeLog: AgentLog.strategic
  - updateKpiSnapshot: IndustryIntelSnapshot.radarSection

alertTrigger:
  condition: "threatLevel >= HIGH OR signalDelta > 2σ"
  action: emit intel.alert.tactical
  escalation: "升级为 L3 任务，需要人工复核"
```

Skill 说明：
- radar-score-compute：读取 KPI Model 8 维度（市场热度/竞对强度/政策风险/
  资金流向/技术变化/舆情温度/供应链压力/监管密度），计算综合雷达分值。
- policy-nlp-scan：调用 Hermes 已注册的 NLP Tool，对近 24h 政策文本做语义偏移检测。
- event-signal-classify：对 OpenClaw 回传的原始 ExecutionEvent 按影响力打标，
  输出 L1/L2/L3 分类。

异常处理：
- 连续 3 次心跳失败 → 降级为 5min 频率 + 写 AuditLog 告警。
- NLP Tool 超时 → 跳过语义扫描，用上次缓存结果，标注「数据可能延迟」。

---

### 3.2 A2：数据流量动力学 Agent

职责：近实时采集市场资金流向、趋势曲线、竞对活动，驱动板块2实时数据。

心跳行为：
```yaml
agentId: industry-data-flux-agent
agentTemplate: industry-intel/data-flux-v2
scheduledWorkflow:
  templateId: wf-data-flux-stream-heartbeat
  interval: 3s           # 流式心跳，只推事件，不触发连接器
  automationLevel: L1
  riskLevel: LOW

skills:
  - skill.industry.market-flow-tick       # 资金流向心跳计算（内存计算）
  - skill.industry.trend-curve-update     # 趋势曲线增量更新
  - skill.industry.competitor-activity    # 竞对动作密度采样（15min 批次合并）

output:
  - emitEvent: intel.flow.tick            # 3s 推一次心跳数据到 SSE
  - batchOutput: intel.trend.updated      # 每 60s 推一次趋势增量

connectorPolicy:
  allowedConnectors: []    # 高频心跳禁止触发任何外部连接器
```

流量控制：
- 单 Workspace 最多同时 1 个 A2 实例，幂等键保证。
- 前端 EventSource 重连时，OpenClaw 提供最近 30 条补偿包。

---

### 3.3 A3：行业生态星云 Agent

职责：定期更新行业知识图谱（节点与边关系），驱动板块3的3D拓扑更新。

心跳行为：
```yaml
agentId: industry-nebula-agent
agentTemplate: industry-intel/nebula-topology-v2
scheduledWorkflow:
  templateId: wf-nebula-topology-heartbeat
  interval: 5min
  automationLevel: L2
  riskLevel: LOW

skills:
  - skill.industry.entity-graph-update
  - skill.industry.capital-flow-graph
  - skill.industry.product-line-map
  - skill.industry.policy-node-inject

knowledgePack:
  readFrom: domain-knowledge/industry-graph-v2
  writeBack: domain-knowledge/industry-graph-v2

output:
  - emitEvent: intel.topology.updated     # 推送图谱差量
  - updateDomainKnowledge: industry-graph
  - writeLog: AgentLog.nebula
```

图谱更新规则：
- 每次心跳只推送差量（新增/删除节点&边、权重变化），不推全量。
- 前端初始化走 GET /api/v1/industry/knowledge-graph 拉全量，后续消费 SSE 差量。
- 节点上限：500 节点 / 2000 边，超出按 PageRank 截断低权重节点。

---

### 3.4 A4：推演沙盘 Agent

职责：响应用户发起的沙盘推演请求，生成多路径预测结果，返回结构化建议。

触发方式（非定时，按需触发）：
```yaml
agentId: industry-sandbox-agent
agentTemplate: industry-intel/simulation-sandbox-v2
triggerType: user-initiated
automationLevel: L1          # 强制 L1，结果仅为建议，不自动执行
riskLevel: LOW
sandboxMode: true            # 强制沙盘，OpenClaw 不触发真实连接器

skills:
  - skill.industry.hypothesis-parse
  - skill.industry.scenario-tree-build    # 构建最优/基准/最差三条路径
  - skill.industry.win-rate-estimate      # 基于历史数据估算胜率
  - skill.industry.action-recommendation  # 生成战术建议（非指令）

output:
  - updateWorkflowRun: scenario-results
  - emitEvent: run.completed

constraints:
  maxSimulationDepth: 3
  timeoutMs: 30000
  outputMustLabel: "AI 建议 / 仅供参考"
```

注意：A4 结果不触发任何业务动作。所有建议须由人工在审批中心
发起 L2 或以上流程才能执行。

---

### 3.5 A5：人机进化核心 Agent

职责：定期读取评估报告，生成 Harness 进化提案，更新进化代际展示数据。

心跳行为：
```yaml
agentId: industry-evolution-agent
agentTemplate: industry-intel/evolution-core-v2
scheduledWorkflow:
  templateId: wf-evolution-heartbeat
  interval: 1hr
  automationLevel: L2
  riskLevel: MEDIUM

additionalTrigger:
  - evalEngine.threshold.crossed    # 指标偏移超阈值时即时触发

skills:
  - skill.harness.eval-report-read
  - skill.harness.decision-alignment-calc
  - skill.harness.weight-drift-detect
  - skill.harness.proposal-draft-generate

output:
  - createProposal: EvolutionProposal(status=draft)
  - updateView: EvolutionProposalView[]
  - emitEvent: intel.evolution.proposal-created
  - writeLog: AuditLog.proposal-create    # 必须写 AuditLog

proposal_constraints:
  - 只能生成 WorkflowTemplate / SkillBinding / EvalRuleSet / MemoryPolicy 类型提案
  - 禁止生成涉及 Guardrail / RBAC / 高危动作白名单的提案
  - 所有提案 status 初始为 draft，必须经审批中心审批后才能进入 canary
```

---

## 第四章：跨 Agent 协作规范

### 4.1 共享数据对象

| 共享对象 | 生产者 | 消费者 | 存储位置 |
|---|---|---|---|
| IndustryIntelSnapshot | A1 | 前端板块1/4/5 | Hermes 缓存层 |
| intel.flow.tick (SSE) | A2 | 前端板块2 | OpenClaw SSE 流 |
| domain-knowledge/industry-graph | A3 | 前端板块3 | Industry Pack 知识对象 |
| WorkflowRun.scenario-results | A4 | 前端板块4 | Hermes WorkflowRun |
| EvolutionProposalView[] | A5 | 前端板块5 | Hermes Proposal 记录 |

### 4.2 Agent 间信号链路

链路 1：
A1 检测到 threatLevel=CRITICAL
  → 写入 IndustryIntelSnapshot.threatLevel
  → A5 的 evalEngine.threshold.crossed 触发
  → A5 提前生成进化提案
  → 前端板块5 展示新提案 + 告警 Badge

链路 2：
A3 检测到新竞争对手节点
  → intel.topology.updated 事件推送
  → A1 下次心跳纳入新节点参与雷达计算
  → 板块1 雷达图动态更新

### 4.3 并发与资源隔离

- 同一 Workspace 同一时刻，每个 Agent 最多运行 1 个实例（幂等键保证）。
- A2（3s 高频）与 A5（1hr 低频）各自独立 WorkflowRun，不相互阻塞。
- A4（按需）支持并发多个推演任务，每个任务独立 sandboxMode WorkflowRun。

---

## 第五章：Harness Bundle 定义

### 5.1 行业情报中心 Harness Bundle

```yaml
bundleId: harness-industry-intel-v2
version: "2.0.0"
status: draft

agentPolicy:
  allowedAgents:
    - industry-strategic-awareness-agent
    - industry-data-flux-agent
    - industry-nebula-agent
    - industry-sandbox-agent
    - industry-evolution-agent
  maxConcurrentAgents: 3
  sandboxEscapePolicy: deny

workflowTemplates:
  - wf-strategic-awareness-heartbeat
  - wf-data-flux-stream-heartbeat
  - wf-nebula-topology-heartbeat
  - wf-evolution-heartbeat
  # A4 无固定模板，由 SandboxScenarioRequest 动态生成

evalRuleSet:
  - rule: "A1 连续 5 次心跳失败 → 告警 + 频率降级"
  - rule: "A5 提案生成频率超过 3次/hr → 暂停 + 人工审查"
  - rule: "A4 推演超时率 > 20% → 生成简化技能提案"

memoryPolicy:
  agentMemoryScope: workspace
  evolutionMemoryRetention: 90d

connectorPolicy:
  heartbeatAgentWriteConnectors: deny
  sandboxAgentAllConnectors: deny
```

### 5.2 进化代际计数规则

evolutionGeneration（GEN-N）= HarnessBundle 历史激活版本数
- 初始值：来自现有行业大盘的 Harness 版本计数（非手动设置）
- 每次 Proposal.approved + Canary.graduated → GEN +1
- 每次 Rollback → GEN 不减，标注 [rolled-back]

---

## 第六章：治理与审计

### 6.1 必须写 AuditLog 的行为

| 行为 | 触发 Agent | 日志类型 |
|---|---|---|
| A1 检测到 CRITICAL 级告警 | A1 | AuditLog.intel-alert |
| A4 沙盘推演提交 | A4 / 用户触发 | AuditLog.sandbox-submit |
| A5 生成新 EvolutionProposal | A5 | AuditLog.proposal-create |
| 任意 Agent 心跳连续失败 | Hermes EvalEngine | AuditLog.agent-health |
| Harness Bundle 版本变更 | A5 → 审批中心 | AuditLog.harness-change |

### 6.2 执行指挥官授权签名

板块5的「授权签名区」必须映射到 AuditLog 中最近一次
proposal.approve 记录的审批人（userId / displayName）与时间戳。
禁止使用静态装饰文本代替真实审批人信息。

---

## 第七章：MVP 范围

### 必做

- [ ] 五个 Agent 的 WorkflowTemplate 定义（YAML）
- [ ] A1 战略态势感知 Agent 完整实现
- [ ] A2 数据流量 Agent（流式心跳 + SSE 推送）
- [ ] A4 沙盘 Agent（L1 推演 + 结构化输出）
- [ ] A5 进化 Agent 读取 EvaluationReport + 生成 draft Proposal
- [ ] Harness Bundle v2.0 定义
- [ ] AuditLog 覆盖（A4 沙盘提交 + A5 提案生成）

### 暂缓

- [ ] A3 星云 Agent 全量知识图谱更新（Phase 2）
- [ ] 跨 Agent 信号链路 A1 → A5 直接触发（Phase 2）
- [ ] A5 自动权重修正建议（Phase 3）

---
本增补稿遵循 AGENTS.md v3.0.0 + CLAUDE.md v1.2。
所有 Agent 运行在 Industry Pack Layer，可装载、可停用、可回滚。