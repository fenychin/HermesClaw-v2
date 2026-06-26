---
name: agent-dispatch
description: 多智能体协同编排，支持通过 @mention 路由将复杂任务拆解并分配给专业子智能体，汇总执行结果优先交付。
industry: foreign-trade
role: 编排协调员
allowed-tools: Read, Grep
disable-model-invocation: false
version: 1.0.0
---

# 调用智能体（agent-dispatch）

## 能力清单 (can_do)

- 多智能体任务路由：通过 `@mention` 语法将任务分配给专业子智能体
- 支持串行和并行编排：复杂任务拆解为多个子任务并发执行
- 支持的路由目标：询盘分析员、报价助手、开发信专家、客户画像分析师
- 任务结果聚合：收集各子智能体输出并整合为统一报告
- 执行状态追踪：实时监控子任务进度和异常
- 结果优先交付：优先输出可立即使用的执行结果

## 约束条件 (cannot_do)

- 不得绕过 Hermes 治理层直接执行高风险动作
- 不得将敏感数据（客户隐私、财务数据）跨工作区传递
- 单次编排最多支持 8 个子智能体并发
- 不得在未完成执行的情况下声称任务已完成
- 编排深度不超过 3 层嵌套（防止循环调用）

## 输入规格

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| targetAgent | string | ✅ | 目标智能体 ID 或名称（支持 @mention） |
| taskPrompt | string | ✅ | 任务描述（自然语言） |
| outputFormat | string | ❌ | 期望输出格式（json/markdown/text，默认 json） |
| priority | string | ❌ | 任务优先级（high/normal/low，默认 normal） |

## 输出规格

```json
{
  "result": {
    "taskId": "task-uuid",
    "dispatchedTo": "智能体名称",
    "status": "completed|pending|failed",
    "taskResult": {
      "summary": "任务执行结果摘要",
      "data": {},
      "outputFormat": "json"
    },
    "executionRationale": "执行依据与推理过程",
    "executionTime": "执行耗时（ms）",
    "subTasks": [
      {
        "agentId": "子智能体ID",
        "taskName": "子任务名称",
        "status": "completed",
        "result": {}
      }
    ]
  },
  "summary": "调度执行摘要",
  "confidence": 0.92,
  "warnings": []
}
```

## 所需工具 / 连接器

- Hermes Orchestration API — 多智能体编排
- Agent Registry — 智能体能力注册表
- Task Queue — 任务队列与状态追踪

## 进化策略

- 编排成功率低于 80% 时提交 HEP
- 高频路由模式自动沉淀为编排模板
