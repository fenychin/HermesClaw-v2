/**
 * 最近记录构建工具
 * —— sidebar-recent / recent-panel 共享的 buildRecentRecords() 与 mock 基线数据
 */
import type { RecentRecord } from "@/hooks/use-recent-conversations";
import type { Inquiry } from "@/types";

/** mock 任务基线（待 Task 实体全量替换） */
export const MOCK_TASKS: RecentRecord[] = [
  {
    id: "task-recent-001",
    type: "task",
    title: "Sakura 样品质量整改",
    timestamp: new Date(Date.now() - 45 * 60000).toISOString(),
  },
  {
    id: "task-recent-002",
    type: "task",
    title: "BrightPath 报价单修订",
    timestamp: new Date(Date.now() - 120 * 60000).toISOString(),
  },
];

/**
 * 从 store 数据 + mock 任务 + API 对话构建混合最近记录。
 *
 * @param storeProjects 项目 store 数据
 * @param inquiries 询盘 store 数据（映射为伪"对话"记录，点击跳转外贸板块）
 * @returns 合并并按时间倒序排列的最近记录
 */
export function buildRecentRecords(
  storeProjects: { id: string; name: string; updatedAt: string }[],
  inquiries: Inquiry[],
): RecentRecord[] {
  const conversations: RecentRecord[] = inquiries.slice(0, 4).map((inq) => ({
    id: inq.id,
    type: "conversation",
    title: inq.companyName,
    timestamp: inq.receivedAt,
    href: "/foreign-trade",
  }));

  const projects: RecentRecord[] = storeProjects.slice(0, 2).map((proj) => ({
    id: proj.id,
    type: "project",
    title: proj.name,
    timestamp: proj.updatedAt,
  }));

  return [...conversations, ...projects, ...MOCK_TASKS].sort(
    (a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}
