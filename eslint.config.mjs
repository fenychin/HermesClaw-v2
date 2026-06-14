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

