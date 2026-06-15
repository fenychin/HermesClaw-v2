# 外贸行业包 — 知识库

本目录用于存放外贸行业专属的知识/文档，供 Hermes Memory Service 与 Skills 引用。

## 计划纳入的知识文件

- `incoterms-2020.md` — Incoterms® 2020 国际贸易术语解释通则
- `lc-checklist.md` — 信用证不符点常见清单
- `hs-code-quick-ref.md` — 高频商品 HS 编码速查（按一带一路目标市场）
- `customs-clearance-tips.md` — 主要目标国海关清关要点
- `payment-risk-by-country.md` — 重点国家付款风险等级与建议账期

## 加载方式

Industry Pack SDK 提供 `loadIndustryKnowledge('foreign-trade')` 读取本目录下的 markdown
文件，详见 `src/lib/industry-pack-sdk/loader.ts`。
