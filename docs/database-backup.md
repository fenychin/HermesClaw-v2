# 数据库备份与恢复指南

> HermesClaw-v2 数据库备份策略与操作说明。

---

## 1. 托管备份（Vercel Postgres）

生产环境如使用 **Vercel Postgres**，平台自动提供每日备份，保留 **7 天**。无需手动干预。

> 参考：[Vercel Postgres — Backups](https://vercel.com/docs/storage/vercel-postgres/backups)

---

## 2. 本地/自托管 PostgreSQL 手动备份

### 备份命令

```bash
# 导出完整数据库到 SQL 文件（文件名含日期）
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql

# 或指定自定义格式（支持并行恢复）
pg_dump -Fc $DATABASE_URL > backup-$(date +%Y%m%d).dump
```

### 恢复命令

```bash
# 从 SQL 文件恢复
psql $DATABASE_URL < backup-20260608.sql

# 从自定义格式恢复
pg_restore -d $DATABASE_URL backup-20260608.dump
```

### 仅备份特定表

```bash
# 只备份关键业务表
pg_dump $DATABASE_URL \
  -t Agent -t AgentLog -t Memory -t Project \
  -t Conversation -t ConversationMessage \
  -t HarnessProposal -t AuditLog \
  > backup-core-$(date +%Y%m%d).sql
```

---

## 3. 本地 SQLite 备份

当前开发环境使用 SQLite，备份只需复制数据库文件：

```bash
cp dev.db dev-backup-$(date +%Y%m%d).db
```

恢复时替换回原文件即可：

```bash
cp dev-backup-20260608.db dev.db
```

---

## 4. 建议策略

| 环境 | 频率 | 保留期 | 方式 |
|------|------|--------|------|
| 生产（Vercel） | 每日自动 | 7 天 | 平台托管 |
| 生产（自托管） | 每日 | 30 天 | `pg_dump` + cron |
| 开发 | 按需 | — | 手动 `cp dev.db` |

### 生产自托管 crontab 示例

```cron
# 每日凌晨 2:00 备份，保留最近 30 天
0 2 * * * pg_dump $DATABASE_URL > /backups/hermesclaw-$(date +\%Y\%m\%d).sql && find /backups/ -name "hermesclaw-*.sql" -mtime +30 -delete
```
