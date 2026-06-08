/**
 * 环境变量安全审查（生产安全加固）
 * —— 集中管理所有环境变量，提供运行时验证。
 *
 * 仅供服务端使用（Route Handler / lib/server/*），
 * 绝不在 'use client' 组件中导入。
 */

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.trim() === "") {
    throw new Error(`缺少必需的环境变量: ${key}`);
  }
  return value;
}

/**
 * 运行时验证——在 API route handler 内部调用，确保关键变量已配置。
 * 不要在模块顶层（import 阶段）调用，否则会导致 build 阶段失败。
 */
export function verifyRequiredEnv(): string[] {
  const missing: string[] = [];
  const required = ["ANTHROPIC_API_KEY", "DATABASE_URL"];
  for (const key of required) {
    if (!process.env[key] || process.env[key]!.trim() === "") {
      missing.push(key);
    }
  }
  return missing;
}

export const env = {
  /** Anthropic API Key */
  get anthropicApiKey(): string {
    return process.env.ANTHROPIC_API_KEY ?? "";
  },

  /** DeepSeek API Key（引擎亦需，与 Anthropic 互补） */
  get deepseekApiKey(): string {
    return process.env.DEEPSEEK_API_KEY ?? "";
  },

  /** Anthropic 中转地址（可选） */
  get anthropicBaseUrl(): string {
    return process.env.ANTHROPIC_BASE_URL ?? "";
  },

  /** 数据库连接 URL（由 Prisma 管理） */
  get databaseUrl(): string {
    return process.env.DATABASE_URL ?? "";
  },

  /** 管理员密码（Harness 审批等需验证的场景） */
  get adminPassword(): string {
    return process.env.ADMIN_PASSWORD ?? "";
  },

  /** Harness LLM Provider 显式覆写 */
  get harnessLlmProvider(): string {
    return process.env.HARNESS_LLM_PROVIDER ?? "";
  },

  /** 运行环境 */
  get nodeEnv(): string {
    return process.env.NODE_ENV || "development";
  },

  // 便捷判断
  get isDev(): boolean {
    return this.nodeEnv === "development";
  },
  get isProd(): boolean {
    return this.nodeEnv === "production";
  },
};
