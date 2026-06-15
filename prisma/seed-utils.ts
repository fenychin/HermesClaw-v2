/**
 * Prisma Seed 共享工具
 * —— 提供各种子脚本共用的 PrismaClient 工厂等通用逻辑。
 *    消除 seed-*.ts 中重复的 adapter + client 初始化代码。
 *
 * 用法：
 *   import { createSeedPrisma } from './seed-utils'
 *   const prisma = createSeedPrisma()
 */
import { PrismaClient } from '../src/generated/prisma-v2/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

/**
 * 创建用于 seed 脚本的 PrismaClient 实例
 * —— 统一 BetterSqlite3 adapter 配置，各脚本无需重复初始化代码
 */
export function createSeedPrisma(opts?: {
  /** 数据库文件路径，默认取 DATABASE_URL 环境变量或 file:./dev.db */
  databaseUrl?: string
  /** Prisma 日志级别，默认只输出 error 与 warn */
  log?: Array<'query' | 'info' | 'warn' | 'error'>
}): PrismaClient {
  const adapter = new PrismaBetterSqlite3({
    url: opts?.databaseUrl ?? process.env['DATABASE_URL'] ?? 'file:./dev.db',
  })

  return new PrismaClient({
    adapter,
    log: opts?.log ?? ['error', 'warn'],
  })
}
