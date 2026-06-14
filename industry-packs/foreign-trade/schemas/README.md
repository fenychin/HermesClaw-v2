# 外贸行业包 — Schema 声明

本 pack 持有以下数据库表（在主 `prisma/schema.prisma` 中通过 `@@map("ft_*")` 标注）：

| Prisma 模型 | 物理表名 | 说明 |
|---|---|---|
| `Inquiry` | `ft_inquiry` | 询盘 |
| `Quotation` | `ft_quotation` | 报价 |
| `MarketIntelligence` | `ft_market_intelligence` | 市场情报 |
| `ExchangeRate` | `ft_exchange_rate` | 汇率监测 |
| `Report` | `ft_report` | 外贸日/周报 |

## 边界规则

依据 CLAUDE.md §6.1，行业包是插件不是业务分支。内核业务代码（`src/lib/server/{hermes,openclaw,shared}`）
**不得**直接 import 上述模型；必须通过 `/api/packs/foreign-trade/*` 路由或行业包 SDK 提供的接口访问。

允许直接消费的位置（白名单，由 ESLint `no-restricted-imports` 规则强制）：
- `src/app/api/packs/foreign-trade/**`
- `src/app/(workspace)/foreign-trade/**`
- `src/lib/server/connectors/email/inquiry-parser.ts`（外贸专属邮件解析）

## 演进路线

v0.13+ 升级为 monorepo 时，本 pack 下的 schema 将拆为 `services/foreign-trade-pack/prisma/schema.prisma`
并以 prisma multi-schema 方式合并，届时 ESLint 规则可由 package 边界自然替代。
