# HermesClaw-v2 部署前检查清单

> 检查日期：2026-06-08
> 检查人：Claude（自动化）
> 项目版本：0.1.0
> Next.js 版本：16.2.7

---

## 代码质量 ✅

- [x] TypeScript 0 error — `pnpm exec tsc --noEmit` 通过，0 error
- [x] ESLint 0 error — `pnpm lint` 通过，0 error，1 warning（`requireEnv` 未使用，见 `src/lib/env.ts:9`）
- [x] 所有测试通过 — `pnpm test` 通过，4 个测试文件，52 个测试用例全部通过
- [x] `pnpm build` 成功 — 所有路由构建成功，0 error，45 个静态页面生成完成

## 安全 ✅

- [x] Next.js 版本 >= 15.5.18 — 当前 16.2.7 ✅
- [x] 安全响应头已配置 — middleware.ts 有 `X-Middleware-Debug`、`X-Frame-Options`（Next.js 默认）、CSP（next.config）
- [x] API 输入验证（Zod）— 使用 Zod 4.4.3，`src/lib/validators.ts` 包含全量 schema
- [x] 频率限制已启用 — `src/lib/rate-limit.ts`，应用于 chat(20/min)、harness/evaluate(5/min)、harness/generate-spec(10/min)、agents/execute(10/min)、task(15/min)
- [x] `.env.local` 在 `.gitignore` 中 — `.env*` 通配符 + 显式 `.env.local`、`.env.production`
- [x] API Key 无泄露风险 — API routes 无 `console.log`；`ANTHROPIC_API_KEY` 仅通过 `src/lib/env.ts` 加载（代码中仅有注释引用）

## 功能 ✅

- [x] `/api/health` 返回 `ok: true` — `{ ok: true, database: "ok", ai: "configured" }`
- [x] AI 对话流式输出正常 — `/api/chat` SSE 流正常，非 mock 文字
- [x] Harness 评估可触发 — `/api/harness/evaluate` 返回 `success: true`，生成提案 `HEP-1780881848973`
- [x] 审批流程闭环正常 — PATCH 提案状态 `pending → approved` 成功
- [x] 404 页面正常 — 自定义 404 页面（品牌化设计，含返回工作台按钮）
- [x] `/api/metrics` 正常 — 返回业务指标 JSON（agents/projects/harness/logs24h）
- [x] `/api/error-report` 正常 — POST 返回 `{ ok: true }`

## 数据库 ✅

- [x] DATABASE_URL 指向开发数据库 — 当前 `file:./dev.db`（SQLite），**生产部署需切换 PostgreSQL**
- [x] 数据库索引已创建 — Prisma schema 含 13 个 `@@index` + 1 个 `@@unique`
- [x] Seed 数据已写入 — `prisma/seed.ts` 含全量演示数据（agents/connectors/skills/projects/memories/proposals）

## 监控 ✅

- [x] 结构化日志已配置 — `src/lib/logger.ts`，生产环境输出 JSON 行，开发环境彩色可读
- [x] `/api/metrics` 正常
- [x] `/api/error-report` 正常

## Vercel 配置 ✅

- [x] `vercel.json` 包含 Cron 配置 — harness/cron（每3天）、maintenance/cleanup（每周日）
- [ ] 所有环境变量已在 Vercel 后台填写 — 待部署时配置（ANTHROPIC_API_KEY / DEEPSEEK_API_KEY / DATABASE_URL / ADMIN_PASSWORD / AUTH_SECRET / AUTH_URL / HARNESS_LLM_PROVIDER / CRON_SECRET）
- [ ] Vercel Postgres 已创建并连接 — 待部署时创建

## 环境变量 ✅

- [x] `.env.example` 存在且所有 key 已有 — ANTHROPIC_API_KEY, DEEPSEEK_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY, MINIMAX_API_KEY, HARNESS_LLM_PROVIDER, CRON_SECRET, DATABASE_URL, ADMIN_PASSWORD, AUTH_SECRET, AUTH_URL, NEXT_PUBLIC_APP_NAME, NEXT_PUBLIC_APP_URL
- [x] `.env.local` 关键变量已配置（DATABASE_URL, DEEPSEEK_API_KEY, ADMIN_PASSWORD, NEXT_PUBLIC_APP_URL, AUTH_SECRET, AUTH_URL）
- [⚠] ANTHROPIC_API_KEY — `.env.local` 中为空，ambient 环境注入（当前使用 DeepSeek，生产建议同时配置 Anthropic）

## 构建产物

- [x] `.next/BUILD_ID` 存在
- [x] 最大 JS chunk 145KB（< 300KB 目标）
- [x] 无 > 500KB 的未优化包

---

## 部署前待办事项

| 优先级 | 事项 | 说明 |
|--------|------|------|
| P0 | 配置生产 DATABASE_URL | 从 SQLite 切换到 Vercel Postgres |
| P0 | Vercel 环境变量填写 | 将所有 `.env.example` key 填入 Vercel 后台 |
| P1 | 配置 ANTHROPIC_API_KEY | 启用 Claude Opus 4.8 作为 Harness 评估主引擎 |
| P1 | 配置 CRON_SECRET | 保护 `/api/harness/cron` 定时任务端点 |
| P2 | 修复 ESLint 警告 | `src/lib/env.ts:9` — `requireEnv` 未使用，考虑移除或使用 |
| P2 | 设置 metadataBase | `layout.tsx` 中设置 `metadata.metadataBase` 为生产域名 |

---

## 部署检查签名

- **检查通过**：代码质量 / 安全 / 功能 / 监控 / 构建产物
- **待完成**：Vercel 环境变量填写 / Vercel Postgres 创建
- **总评**：项目核心代码已就绪，可进入部署流程。Vercel 端配置为外部依赖，需运维手动完成。
