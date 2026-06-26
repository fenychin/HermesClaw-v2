---
name: customer-profile
description: 从多渠道提取目标企业背景，分析采购行为与决策链，输出客户画像与合作风险评估报告，供开发信及报价策略使用。
industry: foreign-trade
role: 客户画像分析师
allowed-tools: Read, WebFetch, WebSearch
disable-model-invocation: false
version: 1.0.0
---

# 客户画像分析（customer-profile）

## 能力清单 (can_do)

- 多渠道客户背景采集：LinkedIn 公司页、海关进出口记录、B2B 平台行为数据
- 提取关键画像维度：行业细分、企业规模、采购周期、主营产品结构
- 决策链分析：识别采购决策人、影响者、把关人角色
- 采购行为特征：历史采购频率、偏好供应商地区、价格敏感度
- 合作风险评估：信用状况、付款习惯、争议历史
- 推荐沟通策略：基于画像定制首次触达方式和话术重点
- 结果沉淀到长期记忆，供后续技能复用

## 约束条件 (cannot_do)

- 不得使用未经授权的数据源（禁止爬取企业内部系统）
- 信息不足时不得编造画像细节，须标注"信息不足，待补充"
- 不得将画像数据分享给第三方或跨工作空间使用
- 不得对 GDPR 管辖区域客户做不合规的个人信息收集

## 输入规格

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| companyName | string | ✅ | 目标公司名称 |
| knownInfo | string | ❌ | 已知背景信息（可选补充） |
| region | string | ❌ | 所在地区（如 Germany、USA） |

## 输出规格

```json
{
  "result": {
    "companyProfile": {
      "name": "公司名称",
      "industry": "行业细分",
      "scale": "企业规模（人数/营收）",
      "mainProducts": ["主营产品1", "主营产品2"],
      "region": "所在地区",
      "founded": "成立年份"
    },
    "decisionChain": {
      "buyer": "采购负责人职位",
      "influencer": "技术/质量把关人",
      "approver": "最终审批人"
    },
    "purchaseBehavior": {
      "frequency": "采购频率",
      "preferredRegion": "偏好供应商地区",
      "priceSensitivity": "high|medium|low",
      "keyRequirements": ["要求1", "要求2"]
    },
    "communicationStrategy": {
      "preferredChannel": "邮件|LinkedIn|WhatsApp",
      "toneAdvice": "专业正式|友好亲切",
      "keyTalkingPoints": ["话术重点1", "话术重点2"]
    },
    "riskAssessment": {
      "level": "low|medium|high",
      "factors": ["风险点1", "风险点2"],
      "recommendation": "建议措施"
    }
  },
  "summary": "画像摘要（人类可读）",
  "confidence": 0.85,
  "warnings": [],
  "dataCompleteness": "complete|partial|insufficient"
}
```

## 所需工具 / 连接器

- 海关进出口数据 — 采购行为验证
- LinkedIn API — 公司与联系人信息
- Web 搜索 — 企业新闻与动态

## 进化策略

- 调用 20 次后，评分低于 7 分时自动提交 HEP（进化提案）
- 画像结果沉淀到长期记忆，供后续询盘分级和报价技能复用
