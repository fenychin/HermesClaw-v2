---
name: generate-quotation
description: 根据采购意向与贸易术语（FOB/CIF/DDP等），自动计算并生成合规的正式贸易报价单，支持 PDF 导出与审批流。
industry: foreign-trade
role: 报价代理
allowed-tools: Read, WebFetch
disable-model-invocation: false
version: 1.0.0
---

# 自动生成报价单（generate-quotation）

## 能力清单 (can_do)

- 基于产品参数和客户需求自动生成正式报价单
- 支持多贸易术语：FOB、CIF、DDP、EXW、CFR
- 报价单包含：品名规格、数量、单价、总价、贸易术语、交期、有效期
- 自动套用公司抬头模板（Logo、地址、联系方式）
- 生成结构化 Markdown 表格 + PDF 导出就绪格式
- 支持多币种（USD/EUR/GBP/CNY）及实时汇率换算
- 版本号自动递增，历史报价可溯源
- 触发审批流：草稿生成后自动流转到负责人审批

## 约束条件 (cannot_do)

- 不得在未审批情况下直接发送报价给客户
- 不得低于成本价（利润率为负时强制中断并警示）
- 不得修改已批准版本的报价内容
- 汇率波动超 3% 时须在报价中标注红色风险提示
- 禁止在报价单中承诺未确认的认证、检测或物流条款

## 输入规格

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| productList | array | ✅ | 产品列表（名称、规格、数量、成本价） |
| incoterms | string | ✅ | 贸易术语（FOB/CIF/DDP/EXW） |
| targetPort | string | ✅ | 目的港或目的地 |
| currency | string | ❌ | 报价币种（默认 USD） |
| profitMargin | number | ❌ | 目标利润率（默认 15%） |
| validityDays | number | ❌ | 报价有效期（默认 30 天） |

## 输出规格

```json
{
  "result": {
    "quotationId": "QT-2026-001",
    "version": "v1.0",
    "status": "draft",
    "header": {
      "date": "2026-06-26",
      "validUntil": "2026-07-26",
      "incoterms": "FOB Shanghai",
      "currency": "USD",
      "paymentTerms": "T/T 30% deposit"
    },
    "lineItems": [
      {
        "no": 1,
        "description": "产品名称规格",
        "quantity": 1000,
        "unit": "PCS",
        "unitPrice": 12.5,
        "amount": 12500
      }
    ],
    "totalAmount": 12500,
    "profitMarginActual": "15.2%",
    "markdownTable": "| # | 品名 | 数量 | 单价(USD) | 金额(USD) |\\n|---|---|---|---|---|\\n| 1 | ... |",
    "warnings": [],
    "approvalRequired": true
  },
  "summary": "报价单生成摘要",
  "confidence": 0.95,
  "warnings": []
}
```

## 所需工具 / 连接器

- 汇率 API — 实时汇率查询
- 产品数据库 — 产品成本与规格
- ft-quotation-pdf 技能 — PDF 报价单渲染
- 审批流系统 — 报价单审批

## 进化策略

- 成单率超 70% 的报价模板沉淀到中期记忆
- 提供版本管理和历史对比功能
