# CLAUDE.md — HermesClaw-v2 项目说明

> 本文件为项目工程说明与协作规范。**最高行为规则见 [AGENTS.md](./AGENTS.md)**，本文档与之冲突时以 AGENTS.md 为准。
> 完整产品需求见 [prd.md](./prd.md)。

---

## 1. 项目简介

**HermesClaw-v2** 是面向中小企业（小 B 场景）的 **AI 数字员工基础平台**，首个优先切入行业为**外贸**。

- **Hermes** — 云端规划与记忆控制面（工作流编排、记忆管理、策略路由、动态 Harness 评估与升级审批）。
- **OpenClaw** — 移动端执行与连接器数据面（任务执行、数据采集、连接器调用、事件回传）。
- **主交互入口** — Web 工作台（深色专业控制台风格）。

平台目标：让 AI 从一次性辅助工具，升级为可管理、可执行、可记忆、可进化的企业数字员工系统。

> 当前仓库为 **Web 工作台前端 + 全栈基础脚手架**，对应 PRD Phase 1：基础工作台框架 + 外贸行业 MVP + 智慧大脑/项目空间/动态大盘基础版。

---

## 2. 技术栈

| 分类 | 选型 | 版本 | 说明 |
|------|------|------|------|
| 框架 | Next.js（App Router） | 16.x | React 全栈框架，Turbopack 默认开启 |
| 语言 | TypeScript | 5.x | 全量类型化，禁用隐式 any |
| 运行时 | React | 19.x | Server / Client Components |
| 样式 | Tailwind CSS | **v4（CSS-first）** | 主题走 `globals.css` 的 CSS 变量 + `@theme inline`，**无 tailwind.config 的 theme.extend** |
| 组件库 | shadcn/ui | — | 基于 `@base-ui/react`，组件位于 `src/components/ui` |
| 图标 | Lucide（lucide-react） | 1.x | 统一图标体系 |
| 客户端状态 | Zustand | 5.x | UI / 客户端交互态 |
| 服务端状态 | TanStack Query | 5.x | 请求缓存、失效、重试 |
| 动画 | Framer Motion | 12.x | 交互动效 |
| 图表 | Recharts | 3.x | 大盘与数据可视化，配色用 `--chart-1..5` |
| 包管理 | **pnpm** | — | 统一使用 pnpm，勿混用 npm/yarn |

**常用命令**：

```bash
pnpm dev      # 启动开发服务器（Turbopack）→ http://localhost:3000
pnpm build    # 生产构建
pnpm lint     # ESLint 检查
pnpm exec tsc --noEmit   # 类型检查
pnpm dlx shadcn@latest add <component>   # 新增 shadcn 组件
```

---

## 3. 目录结构规范

```
src/
  app/
    layout.tsx              # 根布局：强制深色(dark class)、字体、<Providers>
    providers.tsx           # 'use client' — TanStack Query + Tooltip Provider
    page.tsx                # 根路由 → 重定向到 /new
    globals.css             # ★ 颜色系统单一落点（Tailwind v4 @theme inline）
    api/                    # 后端 Route Handlers（全栈）
      health/route.ts       #   GET 健康检查
    (workspace)/            # 工作台路由组：共享左侧导航外壳
      layout.tsx            #   AppShell 包裹
      foreign-trade/        #   外贸
      new/                  #   新话题（超级入口）
      dashboard/            #   动态大盘
      agents/               #   智能体（含 [id] 详情）
      projects/             #   项目空间（含 [id] 详情）
      brain/                #   智慧大脑（layout 提供二级导航）
        short-memory/ mid-memory/ long-memory/
        skills/ connectors/ voice/ images/ videos/
      files/ recent/ settings/
  components/
    ui/                     # shadcn 生成组件（勿手改，用 CLI 更新）
    layout/                 # AppShell / Sidebar / SidebarNavItem / BrainSubnav
    common/                 # PageHeader / EmptyState / StatCard 等通用业务组件
  config/
    navigation.ts           # ★ 导航单一数据源（mainNav / bottomNav / brainNav）
    site.ts                 # 站点级常量
  lib/
    utils.ts                # cn() 等工具函数
  stores/                   # Zustand stores（ui-store 等）
  hooks/                    # 自定义 hooks
  types/                    # 全局 TS 类型
```

**约定**：

- 路由分组 `(workspace)` 不影响 URL，仅用于共享布局。
- 信息架构（一级 / 二级导航）以 `src/config/navigation.ts` 为**唯一数据源**，新增模块在此登记，勿在多处硬编码。
- 后端逻辑放 `app/api/<resource>/route.ts`；复杂业务逻辑后续下沉至 `src/lib/server/*`，Route Handler 只做 I/O 与校验。

---

## 4. 代码风格规范

- **注释用中文**，**标识符（组件 / 函数 / 变量 / 类型）用英文**。
- **组件**：函数式组件 + TypeScript，PascalCase 命名（如 `SidebarNavItem`）；文件名 kebab-case（如 `sidebar-nav-item.tsx`）。
- **客户端组件**：用到 `useState` / `usePathname` / 事件等浏览器能力的组件，文件首行加 `"use client"`；默认保持 Server Component。
- **类型优先**：props 显式声明 interface；避免 `any`，必要时用 `unknown` + 收窄。
- **样式**：一律用 Tailwind 工具类 + 语义化 token（见第 5 节），避免裸写十六进制颜色；多类名合并用 `cn()`（`@/lib/utils`）。
- **导入路径**：统一使用 `@/*` 别名（指向 `src/`）。
- 提交前确保 `pnpm lint` 与 `pnpm exec tsc --noEmit` 通过。

---

## 5. 颜色系统（深色主题）

全站强制深色。颜色在 [src/app/globals.css](./src/app/globals.css) 的 `:root, .dark` 中以 hex 定义，并经 `@theme inline` 注册为 Tailwind 工具类。**禁止裸写色值**，一律使用下列 token。

| 用途 | 色值 | shadcn / 自定义 token | Tailwind 工具类 |
|------|------|----------------------|------------------|
| 页面主背景 | `#0B0B0C` | `--background` | `bg-background` |
| 侧边栏背景 | `#111112` | `--sidebar` | `bg-sidebar` |
| 卡片背景 | `#18181B` | `--card` | `bg-card` |
| 浮层背景 | `#202024` | `--popover` | `bg-popover` |
| hover 背景 | `#24242A` | `--accent` | `bg-accent` |
| 分隔线 | `#2A2A31` | `--border` / `--input` | `border-border` |
| 一级文字 | `#F5F5F7` | `--foreground` | `text-foreground` |
| 二级文字 | `#A1A1AA` | `--muted-foreground` | `text-muted-foreground` |
| 弱提示文字 | `#71717A` | `--hint` | `text-hint` |
| 品牌主色 | `#7C5CFF` | `--primary` / `--brand` / `--ring` | `bg-primary` / `bg-brand` |
| 品牌辅助蓝 | `#4DA3FF` | `--brand-blue` | `text-brand-blue` |
| 成功色 | `#37C99A` | `--success` | `text-success` |
| 警告色 | `#F0A43B` | `--warning` | `text-warning` |
| 风险色 | `#FF6B6B` | `--destructive` / `--danger` | `text-danger` |

- **圆角**：基准 `--radius: 0.875rem`（PRD 大圆角），梯度 `rounded-lg / -xl / -2xl`。
- **图表**：Recharts 用 `--chart-1..5`（主色 / 蓝 / 成功 / 警告 / 风险）。
- 新增语义色：先在 `globals.css` 的 `:root, .dark` 加 CSS 变量，再在 `@theme inline` 加 `--color-*` 映射，方可作为工具类使用。

---

## 6. 组件规范

- **优先复用 shadcn/ui**（`src/components/ui`）；其组件由 CLI 生成，**勿手动改源码**，需要变体时在业务层封装。
- **分层**：
  - `components/ui` — 基础组件（shadcn）。
  - `components/layout` — 框架级布局（侧边栏、外壳、二级导航）。
  - `components/common` — 跨模块复用的业务组件（页头、空状态、指标卡）。
  - 模块私有组件就近放在对应路由目录下。
- **占位约定**：未实现模块统一用 `EmptyState`；页头统一用 `PageHeader`；指标卡用 `StatCard`。
- 组件 props 用 interface 显式声明；可选回退用默认值（如 `EmptyState` 的默认图标）。
- 图标统一从 `lucide-react` 导入；图像图标用别名 `ImageIcon` 避免与 `next/image` 混淆。

---

## 7. 状态管理规范

职责边界清晰，避免混用：

- **Zustand（`src/stores`）** — 仅承载 **UI / 客户端交互态**（侧边栏折叠、弹层开关、本地草稿等）。store 用 `use<Name>Store` 命名。
- **TanStack Query** — 承载**所有服务端状态**（远程数据的获取、缓存、失效、重试、乐观更新）。全局 `QueryClient` 在 `src/app/providers.tsx` 用 `useState` 惰性单例创建（默认 `staleTime: 60s`、关闭窗口聚焦重取）。
- **React 局部 state** — 仅组件内一次性 UI 状态。
- ❌ 不要把服务端数据塞进 Zustand；❌ 不要用 Query 管理纯 UI 开关。

---

## 8. Git 提交规范

采用 **Conventional Commits**：`<type>(<scope>): <subject>`

| type | 含义 |
|------|------|
| `feat` | 新功能 |
| `fix` | 缺陷修复 |
| `docs` | 文档变更 |
| `style` | 格式（不影响逻辑） |
| `refactor` | 重构（非功能、非修复） |
| `perf` | 性能优化 |
| `test` | 测试 |
| `chore` | 构建 / 依赖 / 工具链 |

- `scope` 建议用模块名：`trade` / `dashboard` / `agents` / `brain` / `files` / `ui` / `config`。
- subject 用中文、祈使语气、不加句号。例：`feat(brain): 新增连接器授权状态卡片`。
- 涉及 Harness 规则或 AGENTS.md 变更，须遵循 AGENTS.md 第三/七章的 HEP 审批流程。

---

*本文档随项目演进持续更新；结构性约定变更请同步修订本文件与 `src/config/navigation.ts`。*
