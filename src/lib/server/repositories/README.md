# Repositories 层（Route → Service → Repository 三层抽象的数据访问层）

本目录是全局架构审查 P1-#4 的基础设施——后续新代码应把数据库访问
**从 route 文件迁到本目录下的窄 repository**，route 不直接 import `@/lib/prisma`。

## 约定

- 每个 domain（如 `projects` / `conversations` / `workflows` / `agents`）一个文件。
- 每个 repo 只暴露纯数据访问函数（CRUD wrapper），不包含业务逻辑。
- 禁止 repo 之间互相 import（单向：route → repo → prisma）。
- repo 内可使用 `prisma.$transaction` 做多表操作，但不允许跨文件的事务编排。

## 迁移优先级（审查报告 A2 节 "8 个完全裸奔"）

| # | Domain | 当前 prisma 调用点 | 预计工作 |
|---|---|---|---|
| 1 | `metrics` | 8 处只读（dashboard stats） | 1 repo |
| 2 | `memory` | 4 处读写（已有 MemoryService 做部分） | 收尾 |
| 3 | `workflows` | 2 处只读 | 1 repo |
| 4 | `harness` | 多个读/写混合 | 2 repo |
| 5 | `audit` | 2 处只读 | 已有 service 层 |
| 6 | `exchange-rates` | 1 处只读（外贸 pack own） | 不迁 |
| 7 | `reports` | 1 处只读 + 1 处 AI 生成（外贸 pack own） | 不迁 |
| 8 | `maintenance/cleanup` | 2 处删除 | 1 repo |

## 新代码规则（`scripts/check-route-prisma.ts` 强制）

1. `src/app/api/**/route.ts` 不允许 `import { prisma } from "@/lib/prisma"`。
2. 改为 `import { getProjects } from "@/lib/server/repositories/projects"` 等。
3. 存量 49 个文件已在白名单中，逐步迁移移除。
