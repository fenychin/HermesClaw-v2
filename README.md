⚠️ Security: Rotating credentials, do not use old tokens

# HermesClaw-v2

> 面向中小企业的 AI 数字员工基础平台 — Web 工作台
> Hermes（云端控制面）+ OpenClaw（移动端数据面）· 首个行业：外贸

## Quick Start / 快速开始

```bash
pnpm install

# Copy env template / 复制环境变量模板
cp .env.example .env.local

pnpm dev        # → http://localhost:3000
```

## Documentation / 项目文档

| Document / 文档 | Description / 说明 |
|------|------|
| [CLAUDE.md](./CLAUDE.md) | Engineering spec: tech stack, directory conventions, code style / 工程说明：技术栈、目录规范、代码风格 |
| [AGENTS.md](./AGENTS.md) | Supreme rules: AI-First dynamic Harness self-evolution architecture / 最高规则：AI-First 动态 Harness 自演化架构 |
| [prd.md](./prd.md) | Product requirements: information architecture, 9 navigation modules, MVP scope / 产品需求文档 |

## Common Commands / 常用命令

```bash
pnpm dev                   # Dev server (Turbopack) / 开发服务器
pnpm build                 # Production build / 生产构建
pnpm lint                  # ESLint
pnpm exec tsc --noEmit     # TypeScript type check / 类型检查
pnpm db:generate           # Regenerate Prisma Client / 重新生成 Prisma Client
curl http://localhost:3000/api/health   # Health check / 健康检查
```

> **Prisma Note**: `src/generated/` is auto-generated and not committed. Run `pnpm db:generate` after any `schema.prisma` change and restart the dev server.
>
> **Prisma 注意**：`src/generated/` 为生成代码，不入库。改 `prisma/schema.prisma` 后，必须 `pnpm db:generate` 并重启 dev server。

## Tech Stack / 技术栈

Next.js 16 + React 19 + TypeScript 5 + Tailwind v4 + shadcn/ui (@base-ui) + Lucide + Zustand 5 + TanStack Query 5 + Framer Motion 12 + Recharts 3

---

## Harness Self-Evolution Engine / Harness 自演化引擎

HermesClaw's core differentiator: the system continuously evaluates its own performance and generates optimization proposals via AI, following a safe Canary deployment pipeline.

HermesClaw 的核心差异化能力：系统持续评估自身运行表现，通过 AI 生成优化提案，遵循安全的 Canary 部署管线。

### Architecture / 架构

```
┌──────────────────────────────────────────────────────────┐
│                    Harness Evaluation                      │
│  runHarnessEvaluation() — DB signal collection + LLM      │
│  ↓ EvaluationResult[]                                     │
│  generateHarnessProposals() — write HarnessProposal to DB │
└──────────────────────┬───────────────────────────────────┘
                       │
          ┌────────────▼────────────┐
          │    Human Approval       │
          │  approveHarnessProposal()│
          │  riskLevel < high → active│
          │  riskLevel ≥ high → canary│
          └───────┬────────┬────────┘
                  │        │
         ┌────────▼──┐  ┌──▼─────────┐
         │  Canary    │  │  Active    │
         │  (24h)     │  │  (direct)  │
         └──┬─────┬──┘  └────────────┘
            │     │
   ┌────────▼─┐ ┌─▼──────────┐
   │ Promote  │ │ Rollback   │
   │ → active │ │ → rolled-back│
   └──────────┘ └────────────┘
```

### API Endpoints / API 端点

| Endpoint | Method | Description / 说明 |
|----------|--------|-------------------|
| `/api/harness/evaluate` | POST | Trigger evaluation + proposal generation / 触发评估+提案生成 |
| `/api/harness/status` | GET | Get harness status and metrics / 获取 Harness 状态 |
| `/api/harness/proposals` | GET | List proposals / 提案列表 |
| `/api/harness/proposals/[id]/approve` | POST | Approve a proposal (→ canary or active) / 审批提案 |
| `/api/harness/proposals/[id]/reject` | POST | Reject a proposal / 驳回提案 |
| `/api/harness/proposals/[id]/rollback` | POST | Rollback an active/canary proposal / 回滚提案 |
| `/api/harness/cron` | GET | Cron: auto promote/rollback canary proposals / 定时自动处理 canary |

### Policy Matrix / 策略裁决矩阵

`checkPolicy()` enforces the automation level × risk level matrix:

`checkPolicy()` 按 自动化等级 × 风险等级 矩阵裁决：

| riskLevel \ Level | L1 | L2 | L3 | L4 |
|-------------------|----|----|----|----|
| low | ✅ allowed | ✅ allowed | ✅ allowed | ⚠️ confirm |
| medium | ✅ allowed | ⚠️ confirm | 🔒 approval | 🚫 blocked |
| high | ⚠️ confirm | 🔒 approval | 🚫 blocked | 🚫 blocked |
| critical | 🔒 approval | 🚫 blocked | 🚫 blocked | 🚫 blocked |

- ✅ **allowed**: Execute directly / 直接执行
- ⚠️ **confirm**: Requires human confirmation / 需人工确认
- 🔒 **approval**: Requires explicit approval / 需显式审批
- 🚫 **blocked**: Not permitted at current automation level / 超出当前自动化等级

### Canary Configuration / Canary 配置

Default canary settings (stored in `HarnessProposal.canaryConfig`):

默认 canary 配置（存储在 `HarnessProposal.canaryConfig` 中）：

```json
{
  "durationHours": 24,
  "successThreshold": 0.95
}
```

- **durationHours**: Observation window before promote/rollback decision / 晋级/回滚决策前的观察窗口
- **successThreshold**: Minimum AgentLog success rate to promote / 晋级所需的最低成功率

### Key Source Files / 关键源文件

| File / 文件 | Role / 角色 |
|-------------|------------|
| `packages/hermes-kernel/src/harness/index.ts` | Evaluation engine: signal collection + LLM analysis / 评估引擎：信号采集+LLM分析 |
| `packages/hermes-kernel/src/policy/index.ts` | Policy matrix: L1-L4 enforcement / 策略矩阵：L1-L4 裁决 |
| `packages/hermes-kernel/src/handlers/harness-handler.ts` | Approve/reject/rollback/canary/promote handlers / 审批/驳回/回滚/canary/promote 处理 |
| `apps/web/src/app/api/harness/cron/route.ts` | Vercel Cron: auto canary evaluation / Vercel 定时任务：自动 canary 评估 |
| `apps/web/src/app/api/task/route.ts` | Task API with checkPolicy gate / Task API + checkPolicy 门禁 |

### Audit Trail / 审计追踪

All governance decisions (approve, reject, rollback, promote) automatically write to `AuditLog` with:

所有治理决策（审批、驳回、回滚、晋级）自动写入 `AuditLog`，包含：

- `action`: `proposal.approve` / `proposal.reject` / `proposal.rollback` / `proposal.promote`
- `detail`: `{ before, after, ...metrics }` JSON
- `actor`: User email or `cron` / `system`
- `riskLevel`: Derived from proposal / 从提案派生

---

## Directory Skeleton / 目录骨架

```
packages/
  hermes-kernel/          # Hermes Control Kernel / 控制核
    src/harness/          # Evaluation engine / 评估引擎
    src/policy/           # Policy matrix / 策略矩阵
    src/handlers/         # Business logic handlers / 业务逻辑处理器
  event-contracts/        # Zod schemas & types / Zod 契约与类型
  openclaw-adapter/       # OpenClaw execution runtime adapter / 执行运行时适配器
  industry-pack-sdk/      # Industry pack loader / 行业包装载器
apps/
  web/                    # Next.js application / Next.js 应用
    src/app/api/          # Route handlers / 路由处理器
prisma/                   # Database schema & migrations / 数据库 schema 与迁移
```
