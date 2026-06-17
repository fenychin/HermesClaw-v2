/**
 * Auth.js v5 API Route Handler
 * —— 处理 /api/auth/* 全部请求（登录、登出、会话、回调等）
 */
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
