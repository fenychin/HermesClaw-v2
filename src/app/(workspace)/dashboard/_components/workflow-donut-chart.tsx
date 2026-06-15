"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer
} from "recharts";

export interface DonutChartDatum {
  name: string;
  value: number;
}

// 颜色映射配置：completed=绿色，failed=红色，running=蓝色，cancelled=灰色
const COLOR_MAP: Record<string, string> = {
  "已完成": "var(--success)",
  "已失败": "var(--danger)",
  "运行中": "var(--info)",
  "已取消": "var(--hint)"
};

export default function WorkflowDonutChart({ data }: { data: DonutChartDatum[] }) {
  // 过滤掉 value === 0 的，以便绘制更好看
  const chartData = data.filter(d => d.value > 0);

  if (chartData.length === 0) {
    return (
      <div className="h-[220px] flex items-center justify-center text-hint text-xs">
        暂无运行状态数据
      </div>
    );
  }

  return (
    <div className="w-full h-[220px] mt-4 flex items-center justify-center">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={80}
            paddingAngle={3}
            dataKey="value"
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLOR_MAP[entry.name] || "var(--border)"} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              color: "var(--foreground)",
            }}
          />
          <Legend 
            verticalAlign="bottom" 
            height={36} 
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: "11px" }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
