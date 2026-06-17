"use client";

import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

/**
 * 审批概览环形图（recharts）
 * —— 独立 default export，供页面以 next/dynamic(ssr:false) 懒加载，
 *    将 recharts 从 Harness 审批路由的首屏编译图中剥离
 */
export default function ApprovalDonutChart({
  approved,
  rejected,
  pending,
}: {
  approved: number;
  rejected: number;
  pending: number;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={[
            { name: "已批准", value: approved || 0.1 },
            { name: "已拒绝", value: rejected || 0.1 },
            { name: "待审批", value: pending || 0.1 },
          ]}
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={75}
          paddingAngle={2}
          dataKey="value"
          stroke="none"
        >
          <Cell fill="var(--chart-3)" />
          <Cell fill="var(--chart-5)" />
          <Cell fill="var(--chart-4)" />
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}
