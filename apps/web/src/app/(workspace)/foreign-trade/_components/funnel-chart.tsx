"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";

const CHART_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-5)"];

interface FunnelChartProps {
  funnelData: any[];
  funnelRates: any | null;
  totalAcceptedAmountCNY: number;
}

/**
 * 漏斗转化分析图表（Recharts 懒加载）
 * —— 独立组件，由 page-client 以 next/dynamic(ssr:false) 导入
 */
export default function FunnelChart({
  funnelData,
  funnelRates,
  totalAcceptedAmountCNY,
}: FunnelChartProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
      <div className="md:col-span-8">
        <div className="w-full h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={funnelData}
              layout="vertical"
              margin={{ top: 10, right: 30, left: 10, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--border)"
                horizontal={false}
                vertical={true}
              />
              <XAxis
                type="number"
                stroke="var(--hint)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                dataKey="name"
                type="category"
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
              <Bar dataKey="value" name="数量 (去重)" radius={[0, 4, 4, 0]} barSize={22}>
                {funnelData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={CHART_COLORS[index % CHART_COLORS.length]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 漏斗转化率数值指标面板 */}
      <div className="md:col-span-4 bg-background/20 border border-border p-4 rounded-xl space-y-3 h-full flex flex-col justify-center">
        <span className="text-xs font-bold text-foreground block">阶段转化率分析</span>
        {funnelRates ? (
          <div className="space-y-2.5 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-hint">询盘 → 报价转化:</span>
              <span className="font-semibold text-foreground">{(funnelRates.inquiryToQuotation * 100).toFixed(1)}%</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-hint">报价 → 样品转化:</span>
              <span className="font-semibold text-foreground">{(funnelRates.quotationToSample * 100).toFixed(1)}%</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-hint">样品 → 订单转化:</span>
              <span className="font-semibold text-foreground">{(funnelRates.sampleToOrder * 100).toFixed(1)}%</span>
            </div>
            <div className="border-t border-border/60 pt-2.5 flex justify-between items-center font-bold">
              <span className="text-foreground">总转化率 (Inquiry → Order):</span>
              <span className="text-primary">{(funnelRates.overall * 100).toFixed(1)}%</span>
            </div>
          </div>
        ) : (
          <span className="text-hint text-xs">正在分析流转指标...</span>
        )}
      </div>
    </div>
  );
}
