// 初始化 Neon 数据库 — 创建默认 Workspace
import { Pool } from "pg";

const DATABASE_URL = process.env.DATABASE_URL
  ?? "postgresql://neondb_owner:npg_uvSGAoebTq97@ep-twilight-boat-ao0huell.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";

const pool = new Pool({ connectionString: DATABASE_URL, max: 1 });

try {
  const { rows: tables } = await pool.query(
    `SELECT tablename FROM pg_tables WHERE schemaname='public'`
  );
  console.log("Tables:", tables.map((t) => t.tablename).join(", "));

  const exists = await pool.query('SELECT id FROM "Workspace" WHERE id=$1', [
    "default",
  ]);
  if (exists.rows.length === 0) {
    await pool.query(
      'INSERT INTO "Workspace" (id, name, plan, "automationLevel", status, "createdAt") VALUES ($1,$2,$3,$4,$5,NOW())',
      ["default", "Default", "pro", "L1", "active"]
    );
    console.log("✅ Workspace created!");
  } else {
    console.log("Workspace already exists");
  }
} catch (e) {
  console.error("Error:", e.message);
} finally {
  await pool.end();
}
