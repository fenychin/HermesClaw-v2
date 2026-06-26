---
name: inquiry-grade
description: 对外贸询盘进行多维度评分（客户质量、产品匹配度、成交意向、风险等级），输出分级结果与客户画像速写，优先跟进高价值询盘。
industry: foreign-trade
role: 询盘分拣员
allowed-tools: Read, Grep, WebFetch, WebSearch
disable-model-invocation: false
version: 1.0.0
---

# 询盘深度分析（inquiry-grade）

## 能力清单 (can_do)

- 询盘内容解析：提取产品需求、数量、交期、目标价、认证要求
- 四维度加权评分：
  - **客户质量**（30%）：企业背景、采购体量、决策能力
  - **产品匹配度**（30%）：需求与自身产能的匹配程度
  - **成交意向**（25%）：询盘具体程度、紧迫度信号
  - **风险等级**（15%）：地区风险、付款方式风险、合规风险
- 客户画像速写：基于询盘文本推断客户类型（贸易商/终端/分销商）
- 生成首封回复邮件框架（email-en 代码块）
- 风险提示：欺诈信号、低质询盘特征识别
- 跟进优先级排序建议（A/B/C 分级）
- 结果沉淀到中期记忆

## 约束条件 (cannot_do)

- 不得以单一标准（如价格）判定询盘质量
- 分数低于 40 分（C 级）须明确说明原因而非直接丢弃
- 不得在分析中泄露客户信息到其他工作区
- 不得自动回复询盘（须经人工审核）
- 当询盘信息严重不足时，须标注"信息不足"而非生成臆测画像

## 输入规格

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| inquiryText | string | ✅ | 原始询盘邮件文本 |
| productCategory | string | ❌ | 产品品类（辅助匹配度评分） |
| clientCompany | string | ❌ | 客户公司名（辅助画像） |

## 输出规格

```json
{
  "result": {
    "scoreCard": {
      "total": 78,
      "grade": "A",
      "dimensions": {
        "clientQuality": { "score": 82, "weight": 0.3, "reasoning": "评分依据" },
        "productMatch": { "score": 90, "weight": 0.3, "reasoning": "评分依据" },
        "purchaseIntent": { "score": 65, "weight": 0.25, "reasoning": "评分依据" },
        "riskLevel": { "score": 70, "weight": 0.15, "reasoning": "评分依据" }
      }
    },
    "customerProfile": {
      "type": "终端用户|贸易商|分销商|待确认",
      "estimatedPurchaseVolume": "采购规模估算",
      "urgency": "high|medium|low",
      "keyRequirements": ["要求1", "要求2"]
    },
    "replyDraft": "```email-en\\nDear [Name],\\n\\n[邮件正文框架]\\n\\nBest regards```",
    "riskWarnings": ["风险提示1", "风险提示2"],
    "followUpPriority": "A|B|C",
    "followUpSuggestion": "建议跟进时间和方式"
  },
  "summary": "询盘分析摘要",
  "confidence": 0.83,
  "warnings": []
}
```

## 所需工具 / 连接器

- 海关进出口数据 — 客户采购历史验证
- Web 搜索 — 客户公司背景核查
- 邮件记录 — 历史往来邮件参考

## 进化策略

- 20次调用中3次评分 < 7时提交 HEP（进化提案）
- 分析结果沉淀到中期记忆，持续优化评分模型
