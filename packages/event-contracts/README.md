# Event Contracts — 三域契约层

## 规则
- Hermes Kernel 是 HERMES_OWNED 契约的唯一写入者
- OpenClaw Adapter 是 OPENCLAW_OWNED 契约的唯一写入者
- Industry Pack 只能读取 INDUSTRY_PACK_READABLE 的契约
- 禁止跨域直接导入，必须通过此包的 index.ts
