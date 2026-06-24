// 写入 Neon：创建默认 Workspace
import { Pool } from "pg";
const p = new Pool({
  connectionString: process.env.DATABASE_URL,
});
await p.query(
  `INSERT INTO "Workspace" (id, name, plan, "automationLevel", status, "createdAt")
   VALUES ($1,$2,$3,$4,$5,NOW()) ON CONFLICT DO NOTHING`,
  ["default", "Default", "pro", "L1", "active"]
);
console.log("✅ Workspace 已创建");
await p.end();
