/**
 * Prisma Seed 共享工具
 * —— 提供各种子脚本共用的 PrismaClient 工厂等通用逻辑。
 *    消除 seed-*.ts 中重复的 adapter + client 初始化代码。
 *
 * 用法：
 *   import { createSeedPrisma } from './seed-utils'
 *   const prisma = createSeedPrisma()
 */
import { PrismaClient } from '../apps/web/src/generated/prisma-v2/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

/**
 * 创建用于 seed 脚本的 PrismaClient 实例
 * —— 统一 PostgreSQL adapter 配置，解决与 schema postgres provider 冲突问题
 */
export function createSeedPrisma(opts?: {
  /** 数据库文件路径，默认取 DATABASE_URL 环境变量或 postgresql://localhost:5432/hermesclaw_dev */
  databaseUrl?: string
  /** Prisma 日志级别，默认只输出 error 与 warn */
  log?: Array<'query' | 'info' | 'warn' | 'error'>
}): PrismaClient {
  const connectionString =
    opts?.databaseUrl ??
    process.env['DATABASE_URL'] ??
    'postgresql://localhost:5432/hermesclaw_dev'
  const pool = new Pool({ connectionString, max: 2 })
  const adapter = new PrismaPg(pool)

  return new PrismaClient({
    adapter,
    log: opts?.log ?? ['error', 'warn'],
  })
}
