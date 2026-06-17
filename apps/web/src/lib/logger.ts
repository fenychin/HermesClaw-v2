type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LogContext = Record<string, unknown>;

/**
 * 结构化日志函数
 * - 生产环境：输出 JSON 行，便于日志平台（如 Datadog / Loki / Vercel Logs）解析
 * - 开发环境：带颜色的人类可读格式
 */
function log(level: LogLevel, message: string, context?: LogContext) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    service: 'hermesclaw-v2',
    env: process.env['NODE_ENV'],
    ...context,
  };

  if (process.env['NODE_ENV'] === 'production') {
    // 生产环境：结构化 JSON，便于日志平台解析
    console.log(JSON.stringify(entry));
  } else {
    // 开发环境：可读格式
    const color: Record<LogLevel, string> = {
      debug: '\x1b[36m',
      info: '\x1b[32m',
      warn: '\x1b[33m',
      error: '\x1b[31m',
    };
    console.log(`${color[level]}[${level.toUpperCase()}]\x1b[0m ${message}`, context || '');
  }
}

export const logger = {
  debug: (msg: string, ctx?: LogContext) => log('debug', msg, ctx),
  info: (msg: string, ctx?: LogContext) => log('info', msg, ctx),
  warn: (msg: string, ctx?: LogContext) => log('warn', msg, ctx),
  error: (msg: string, ctx?: LogContext) => log('error', msg, ctx),
};
