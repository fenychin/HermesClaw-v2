# HermesClaw-v2

> 面向中小企业的 AI 数字员工基础平台 — Web 工作台
> Hermes（云端控制面）+ OpenClaw（移动端数据面）· 首个行业：外贸

## 快速开始

```bash
pnpm install
pnpm dev        # → http://localhost:3000，自动跳转 /new（超级入口）
```

## 项目文档

| 文档 | 说明 |
|------|------|
| [CLAUDE.md](./CLAUDE.md) | 项目工程说明：技术栈、目录规范、代码风格、颜色系统、组件与状态管理规范 |
| [AGENTS.md](./AGENTS.md) | 项目最高规则：AI-First 动态 Harness 自演化架构（所有 Agent/子系统须遵守） |
| [prd.md](./prd.md) | 产品需求文档：信息架构、9 大一级导航、功能模块、MVP 范围 |

## 常用命令

```bash
pnpm dev                   # 开发服务器（Turbopack）
pnpm build                 # 生产构建
pnpm lint                  # ESLint
pnpm exec tsc --noEmit     # TypeScript 类型检查
pnpm dlx shadcn@latest add <component>  # 新增 shadcn 组件
curl http://localhost:3000/api/health   # 健康检查
```

## 技术栈

Next.js 16 + React 19 + TypeScript 5 + Tailwind v4 + shadcn/ui (@base-ui) + Lucide + Zustand 5 + TanStack Query 5 + Framer Motion 12 + Recharts 3

## 目录骨架

```
src/
  app/                          # App Router
    providers.tsx               # QueryClient + Tooltip Provider
    (workspace)/                # 工作台路由组（9 大模块 + 智慧大脑 8 子页）
    api/health/route.ts         # 后端健康检查
  components/
    ui/                         # shadcn 基础组件
    layout/                     # AppShell / Sidebar / SidebarNavItem / BrainSubnav
    common/                     # PageHeader / EmptyState / StatCard
  config/                       # 导航单一数据源 + 站点常量
  stores/                       # Zustand UI 状态
  hooks/                        # 自定义 hooks
  types/                        # 领域类型
```
