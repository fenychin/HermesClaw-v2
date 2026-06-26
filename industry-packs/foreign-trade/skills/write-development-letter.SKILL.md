---
name: write-development-letter
description: 结合客户画像和主营产品卖点，智能起草高转化率的英文外贸开发信，提供主题行建议、个性化正文和合规声明。
industry: foreign-trade
role: 开发信撰写员
allowed-tools: Read, WebFetch
disable-model-invocation: false
version: 1.0.0
---

# 撰写开发信（write-development-letter）

## 能力清单 (can_do)

- 基于客户画像（公司背景、行业、痛点）撰写个性化开发信
- 融入产品核心卖点、差异化优势和行业术语
- 提供 3 个主题行选项（标注打开率预测）
- 自适应邮件语气：专业正式、友好亲切、简洁直接
- 输出英文版正文（Markdown 格式）
- 生成退订声明（CAN-SPAM 合规）
- 自动校验 GDPR/CAN-SPAM 合规性
- 提供首次触达后 7 天跟进模板

## 约束条件 (cannot_do)

- 不得直接发送邮件（须经人工确认后手动发送）
- 禁止虚假紧迫感表述（"库存有限""限时优惠""最后机会"等）
- 信息不足时不得编造产品认证或客户信息
- 不得向 GDPR 管辖区域客户发送未经同意的营销内容
- 禁止在邮件中承诺价格或交期（须通过报价单确认）

## 输入规格

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| clientProfile | object | ✅ | 客户画像（来自 customer-profile 技能输出） |
| productSellingPoints | array | ✅ | 产品核心卖点列表（3-5 条） |
| tone | string | ❌ | 邮件语气（professional/friendly/concise，默认 professional） |
| recipientName | string | ❌ | 收件人姓名（用于个性化称呼） |

## 输出规格

```json
{
  "result": {
    "subjectOptions": [
      { "subject": "主题行A", "expectedOpenRate": "28%", "reason": "推荐理由" },
      { "subject": "主题行B", "expectedOpenRate": "22%", "reason": "推荐理由" },
      { "subject": "主题行C", "expectedOpenRate": "18%", "reason": "推荐理由" }
    ],
    "emailBody": {
      "greeting": "Dear [Name],",
      "opening": "开场白段落",
      "body": "主体内容段落（含产品卖点）",
      "callToAction": "行动召唤段落",
      "closing": "结束语",
      "signature": "签名区",
      "unsubscribeNotice": "退订声明"
    },
    "fullEmailText": "完整邮件正文（Markdown 格式）",
    "followUpDay7": "7天跟进邮件模板",
    "complianceCheck": {
      "gdprCompliant": true,
      "canSpamCompliant": true,
      "hasUnsubscribeLink": true
    }
  },
  "summary": "开发信撰写摘要",
  "confidence": 0.88,
  "warnings": []
}
```

## 所需工具 / 连接器

- 客户画像数据 — 来自 customer-profile 技能
- 产品目录 — 产品规格与认证信息
- 邮件合规工具 — GDPR/CAN-SPAM 校验

## 进化策略

- 客户回复率 > 15% 的开发信模板自动沉淀到长期记忆
- 成功案例定期汇总为最佳实践知识库
