import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // 三域架构边界隔离规则 (no-restricted-imports)
  {
    files: ["src/lib/server/adapters/openclaw/**/*"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          {
            group: ["**/workflow/**", "**/harness/**", "**/brain/**"],
            message: "OpenClaw 执行域适配器不得反向依赖控制内核层 (Hermes) 业务逻辑。"
          }
        ]
      }]
    }
  },
  {
    files: ["src/contracts/**/*"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          {
            group: ["**/lib/**", "**/components/**", "**/app/**"],
            message: "契约定义层 (contracts) 应该是纯粹的，禁止导入任何具体服务端实现或 UI 组件。"
          }
        ]
      }]
    }
  },
  // CLAUDE.md §6.1：行业包是插件不是业务分支。
  // 内核业务代码（src/lib/server/* 顶层 + harness/* + workflow/*）
  // 不得直接 import 外贸专属类型 @/types/trade；
  // 行业概念应通过 industryId 参数化处理，或封装在 connectors/email/inquiry-parser 等专属模块。
  // 白名单（允许直接消费）：
  //   - src/app/api/packs/foreign-trade/**
  //   - src/app/(workspace)/foreign-trade/**
  //   - src/lib/server/connectors/email/inquiry-parser.ts
  //   - src/types/dashboard.ts（前端聚合型，非内核）
  //   - src/hooks/**（前端层，已经在外贸 UI 域）
  {
    files: [
      "src/lib/server/*.ts",
      "src/lib/server/harness/**/*.ts",
      "src/lib/server/workflow/**/*.ts",
      "src/lib/server/agents/**/*.ts",
      "src/lib/server/adapters/**/*.ts",
    ],
    ignores: [
      "src/lib/server/connectors/email/inquiry-parser.ts",
    ],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          {
            group: ["@/types/trade", "**/types/trade"],
            message: "内核业务代码不得 import 外贸专属类型 @/types/trade（CLAUDE.md §6.1 行业包是插件不是业务分支）。请通过 industryId 参数化处理；外贸专属逻辑应放在 src/app/api/packs/foreign-trade/* 或 src/lib/server/connectors/email/inquiry-parser.ts。"
          }
        ]
      }]
    }
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated Prisma client directory
    "src/generated/**",
  ]),
]);

export default eslintConfig;

