/**
 * API 频率限制（生产安全加固）
 * —— 基于内存的简单限流器，防止 API 滥用。
 *
 * 当前为单进程内存方案，适合开发/单实例部署。
 * 生产环境多实例部署时，应替换为 @upstash/ratelimit + @upstash/redis。
 */

const requestCounts = new Map<string, { count: number; resetAt: number }>();

/** 定时清理过期记录，避免内存泄漏 */
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of requestCounts.entries()) {
      if (now > record.resetAt) {
        requestCounts.delete(ip);
      }
    }
  }, 60_000); // 每分钟清理一次
}

/**
 * 检查指定 IP 是否超出频率限制。
 *
 * @param ip       客户端 IP（取自 x-forwarded-for 头）
 * @param limit    时间窗口内最大请求数，默认 60
 * @param windowMs 时间窗口毫秒数，默认 60_000（1 分钟）
 * @returns true 表示未超限，false 表示请求过多
 */
export function rateLimit(ip: string, limit = 60, windowMs = 60_000): boolean {
  ensureCleanup();

  const now = Date.now();
  const record = requestCounts.get(ip);

  if (!record || now > record.resetAt) {
    requestCounts.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (record.count >= limit) return false;
  record.count++;
  return true;
}

/**
 * 获取指定 IP 的限流状态（用于调试/监控）
 */
export function getRateLimitStatus(ip: string): { used: number; limit: number; resetAt: number } | null {
  const record = requestCounts.get(ip);
  if (!record || Date.now() > record.resetAt) return null;
  return { used: record.count, limit: -1, resetAt: record.resetAt };
}
