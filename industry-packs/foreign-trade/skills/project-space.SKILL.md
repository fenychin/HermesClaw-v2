---
name: project-space
description: 为客户订单或销售机会建立独立项目工作空间，生成结构化任务清单、里程碑节点和推荐数字员工配置。
industry: foreign-trade
role: 项目规划助手
allowed-tools: Read, Grep
disable-model-invocation: false
version: 1.0.0
---

# 创建项目空间（project-space）

## 能力清单 (can_do)

- 为客户订单 / 销售机会创建独立项目工作空间
- 生成 5-8 个初始任务清单（含优先级和负责角色）
- 定义关键里程碑节点（询价→报价→样品→订单→发货→回款）
- 推荐数字员工配置（绑定哪些智能体到项目空间）
- 生成项目结构建议：文件夹结构、跟进频率、风险提示
- 支持的项目类型：新客户开发、现有客户大单、展会跟进、样品追踪

## 约束条件 (cannot_do)

- 不得自动创建涉及财务授权的项目节点（须人工审批）
- 不得跨工作空间复制客户隐私数据
- 不得在未确认客户意向前创建正式订单项目空间
- 项目空间类不自动进化升级，需人工审批

## 输入规格

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| projectName | string | ✅ | 项目名称（如"ACME 公司 2026Q3 订单"） |
| associatedClient | string | ❌ | 关联客户名称 |
| projectType | string | ❌ | 项目类型（new-client/existing-client/exhibition/sample，默认 new-client） |
| keyFocus | string | ❌ | 重点关注事项（如"付款条款谈判"） |

## 输出规格

```json
{
  "result": {
    "spaceId": "proj-uuid",
    "spaceName": "项目空间名称",
    "spaceStructure": {
      "folders": ["📥 询盘记录", "📤 报价文件", "📦 样品追踪", "📋 合同单证", "💰 收款跟进"],
      "description": "项目空间结构说明"
    },
    "taskList": [
      {
        "no": 1,
        "task": "完成客户画像分析",
        "priority": "high",
        "owner": "客户画像分析师",
        "dueInDays": 1
      },
      {
        "no": 2,
        "task": "生成报价方案",
        "priority": "high",
        "owner": "报价策略顾问",
        "dueInDays": 3
      }
    ],
    "milestones": [
      { "name": "首次报价发送", "targetDay": 3 },
      { "name": "客户确认样品", "targetDay": 14 },
      { "name": "正式订单签署", "targetDay": 30 },
      { "name": "货款收回", "targetDay": 90 }
    ],
    "agentConfig": {
      "recommended": ["客户画像分析师", "报价策略顾问", "开发信写作专家"],
      "reason": "推荐理由"
    }
  },
  "summary": "项目空间创建摘要",
  "confidence": 0.9,
  "warnings": []
}
```

## 所需工具 / 连接器

- 工作空间管理 API — 项目空间创建
- CRM 系统 — 客户关联
- 任务管理 — 任务清单创建

## 进化策略

- 项目空间类不自动升级，需人工审批
- 成功成单的项目模板可人工标记为最佳实践
