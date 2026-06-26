---
name: quote-gen
description: 多策略定价分析，综合产品成本、汇率、运费、关税与利润空间，生成 FOB/CIF/DDP 三档报价方案及谈判预案。
industry: foreign-trade
role: 报价策略顾问
allowed-tools: Read, WebFetch
disable-model-invocation: false
version: 1.0.0
---

# 报价策略生成（quote-gen）

## 能力清单 (can_do)

- 多策略定价分析：保本价、目标价、报出价三档分层计算
- 支持 FOB、CIF、DDP、EXW 等主要贸易术语报价
- 实时汇率融合：自动拉取汇率并标注波动风险
- 运费与关税预估：基于目的港和产品 HS 编码
- 利润率分析：设定 5%/10%/15%/20% 档位推荐报价区间
- 正式报价单 Markdown 表格输出，支持 PDF 导出
- 谈判让步节奏：设计 3 轮价格谈判预案
- 版本管理：每次修改自动递增版本号
- 报价单审批流：草稿 → 审核 → 批准 → 发送

## 约束条件 (cannot_do)

- 不得在未经人工审批的情况下自动发送报价给客户
- 不得低于成本价报价（利润率为负时强制警示并拒绝生成）
- 不得修改已批准版本的报价数据（已批准版本只读）
- 汇率波动超过 3% 时须在报价中标注醒目风险提示
- 不得直接访问 ERP 实际成本数据，仅可使用用户提供的参数

## 输入规格

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| productDetails | object | ✅ | 产品参数（名称、规格、单位成本、数量） |
| strategy | string | ✅ | 报价策略（conservative/balanced/aggressive） |
| incoterms | string | ✅ | 贸易术语（FOB/CIF/DDP/EXW） |
| paymentTerms | string | ❌ | 付款方式（T/T 30天/LC即期等） |

## 输出规格

```json
{
  "result": {
    "priceRangeAdvice": {
      "floorPrice": "底价（USD）",
      "targetPrice": "目标价（USD）",
      "quotedPrice": "报出价（USD）",
      "currency": "USD",
      "unitProfitMargin": "单位利润率（%）"
    },
    "quotationDraft": "| 项目 | 规格 | 数量 | 单价 | 金额 |\\n|---|---|---|---|---|\\n| ... |",
    "incoterms": "FOB Shanghai",
    "validityDays": 30,
    "negotiationPlan": [
      { "round": 1, "concession": "可让步 2%", "condition": "订单量 ≥ 500pcs" },
      { "round": 2, "concession": "再让步 1.5%", "condition": "付款方式改为 T/T 30%" },
      { "round": 3, "concession": "底价不再让步", "condition": "提供质保书补偿" }
    ],
    "riskWarnings": [
      "汇率风险：USD/CNY 近期波动 2.3%，建议加锁汇条款",
      "原材料价格上涨风险：有效期内涨幅超 5% 可重新协商"
    ]
  },
  "summary": "报价策略摘要（人类可读）",
  "confidence": 0.9,
  "warnings": [],
  "version": "v1.0"
}
```

## 所需工具 / 连接器

- 汇率 API（`/api/exchange-rates`）— 实时汇率查询
- 产品数据库（Prisma Product 表）— 产品成本参数
- ft-quotation-pdf 技能 — PDF 报价单生成
- ft-cost-accounting 技能 — 成本核算支撑

## 进化策略

- 调用 20 次后，客户接受率低于 60% 时提交 HEP
- 谈判结果沉淀到中期记忆，持续优化报价策略
