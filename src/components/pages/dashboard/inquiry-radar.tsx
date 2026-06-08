"use client";

import { useSyncExternalStore } from "react";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts";

/** 雷达图：询盘来源分布（固定数据） */
const RADAR_DATA = [
  { region: "北美", value: 35 },
  { region: "欧洲", value: 28 },
  { region: "东南亚", value: 20 },
  { region: "中东", value: 12 },
  { region: "其他", value: 5 },
];

/** useSyncExternalStore 空订阅（用于水合安全的 isClient 检测） */
const emptySubscribe = () => () => {};

/** 仅客户端渲染的询盘来源雷达图（recharts 动态导入，减少首屏 JS） */
export default function InquiryRadar() {
  const isClient = useSyncExternalStore(emptySubscribe, () => true, () => false);

  if (!isClient) {
    return (
      <div className="flex h-[220px] items-center justify-center">
        <span className="text-hint text-sm">加载图表中…</span>
      </div>
    );
  }

  return (
    <div className="h-[220px]">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={RADAR_DATA}>
          <PolarGrid stroke="#2A2A31" strokeWidth={0.5} />
          <PolarAngleAxis
            dataKey="region"
            tick={{ fill: "#A1A1AA", fontSize: 11 }}
          />
          <PolarRadiusAxis
            tick={{ fill: "#71717A", fontSize: 9 }}
            axisLine={false}
            tickCount={4}
          />
          <Radar
            name="询盘来源"
            dataKey="value"
            stroke="#7C5CFF"
            fill="#7C5CFF"
            fillOpacity={0.2}
            strokeWidth={1.5}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
