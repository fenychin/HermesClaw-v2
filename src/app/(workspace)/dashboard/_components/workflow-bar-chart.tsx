"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

/** 单条柱状图数据点 */
export interface WorkflowChartDatum {
  name: string;
  成功: number;
  失败: number;
}

/**
 * 本周工作流执行柱状图
 * —— 独立成 default export 组件，供页面以 next/dynamic(ssr:false) 懒加载，
 *    将 recharts（重型依赖）从大盘路由的首屏编译图中剥离，加快首次进入速度
 */
export default function WorkflowBarChart({
  data,
}: {
  data: WorkflowChartDatum[];
}) {
  return (
    <div className="w-full h-[200px] mt-4">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="name"
            stroke="var(--hint)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke="var(--hint)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              color: "var(--foreground)",
            }}
          />
          <Bar name="成功" dataKey="成功" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
          <Bar name="失败" dataKey="失败" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
