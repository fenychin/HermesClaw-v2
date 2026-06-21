import { NextResponse } from "next/server";

export async function GET() {
  // 模拟返回 10 个积分任务的初始完成状态
  return NextResponse.json([
    { taskId: "task_connect_x", completed: false, completedAt: null },
    { taskId: "task_connect_discord", completed: false, completedAt: null },
    { taskId: "task_join_discord", completed: false, completedAt: null },
    { taskId: "task_verify_email", completed: true, completedAt: "2026-06-18 10:00" },
    { taskId: "task_create_workspace", completed: true, completedAt: "2026-06-18 10:05" },
    { taskId: "task_bind_connector", completed: true, completedAt: "2026-06-19 14:20" },
    { taskId: "task_run_workflow", completed: false, completedAt: null },
    { taskId: "task_enable_pack", completed: false, completedAt: null },
    { taskId: "task_daily_login", completed: false, completedAt: null },
    { taskId: "task_run_workflow_daily", completed: false, completedAt: null }
  ]);
}
