import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env";

/**
 * Anthropic 客户端单例
 * —— 仅在服务端（Route Handler）使用，切勿在客户端组件引入，
 *    否则会泄露 ANTHROPIC_API_KEY。
 *
 * 支持中转站 / 代理：设置 ANTHROPIC_BASE_URL 即可把请求指向兼容的
 * 中转地址（如国内中转站的 claude-opus-4-8），无需改动业务代码；
 * 不设置时默认走官方 https://api.anthropic.com。
 */
const anthropic = new Anthropic({
  apiKey: env.anthropicApiKey,
  // 仅在配置了中转地址时覆盖 baseURL，避免传入空串
  ...(env.anthropicBaseUrl
    ? { baseURL: env.anthropicBaseUrl }
    : {}),
});

export default anthropic;
