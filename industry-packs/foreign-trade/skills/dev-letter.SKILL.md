---
name: dev-letter
description: 基于客户画像和产品卖点，生成高转化率的个性化外贸开发信，强制中英双语代码块输出，支持多种邮件语气。
industry: foreign-trade
role: 开发信写作专家
allowed-tools: Read, WebFetch, WebSearch
disable-model-invocation: false
version: 1.0.0
---

# 开发信生成（dev-letter）

## 能力清单 (can_do)

- 基于客户背景生成高度个性化开发信（融入客户行业术语和近期动态）
- 强制中英双语输出：`email-cn` 和 `email-en` 代码块
- 生成 3 个主题行选项并标注推荐度（A/B/C）
- 支持三种邮件语气：专业正式 / 友好亲切 / 简洁直接
- 撰写跟进邮件框架（首次发送后 7 天/14 天跟进模板）
- 提供写作依据与知识库来源引用
- GDPR/CAN-SPAM 合规自动校验
- 成功开发信模板沉淀到长期记忆

## 约束条件 (cannot_do)

- 不得直接发送邮件（须经人工审核后手动发送）
- 不得使用虚假紧迫感（禁止："库存有限""最后机会""限时"等）
- 信息不足时不得编造产品认证资质或客户已知信息
- 不得冒充客户已有供应商身份
- 不得向 GDPR 管辖区域客户发送未经同意的营销邮件
- 禁止在正文中承诺未经审批的价格或交期

## 输入规格

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| clientBackground | string | ✅ | 客户背景信息（来自客户画像） |
| sellingPoints | string | ✅ | 产品核心卖点（3-5 条） |
| language | string | ✅ | 主语言（en/zh/de/es/fr 等） |
| tone | string | ✅ | 邮件语气（professional/friendly/concise） |

## 输出规格

```json
{
  "result": {
    "subjectOptions": [
      { "subject": "主题行选项A", "rating": "A", "reason": "推荐理由" },
      { "subject": "主题行选项B", "rating": "B", "reason": "推荐理由" },
      { "subject": "主题行选项C", "rating": "C", "reason": "推荐理由" }
    ],
    "emailCn": "中文版开发信正文（Markdown 格式）",
    "emailEn": "英文版开发信正文（Markdown 格式）",
    "writingRationale": "写作依据与知识库来源",
    "followUpFrame": {
      "day7": "7天跟进邮件框架",
      "day14": "14天跟进邮件框架"
    },
    "complianceCheck": {
      "gdprCompliant": true,
      "canSpamCompliant": true,
      "warnings": []
    }
  },
  "summary": "开发信生成摘要",
  "confidence": 0.87,
  "warnings": []
}
```

## 所需工具 / 连接器

- 产品目录数据库 — 产品规格与认证信息
- 海关进出口数据 — 客户采购行为验证
- 邮件合规检查 — GDPR/CAN-SPAM 校验

## 进化策略

- 成功开发信（客户回复率 > 15%）自动沉淀到长期记忆模板库
- 调用 20 次后回复率低于 5% 时提交 HEP 优化提案
