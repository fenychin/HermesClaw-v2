"use client";

/**
 * 世界贸易热力图 — SVG 雷达球式地理可视化
 * —— 展示近 30 天各国询盘活动量分布，活动量映射节点大小与颜色强度。
 * —— 颜色梯度：var(--brand)（低活跃）→ var(--danger)（高活跃）
 * —— hover 显示 tooltip（国名 + 询盘数），click 触发 country 筛选
 */
import { useState, useCallback, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import type { GeoDistributionPoint } from "@/types/dashboard";

export interface WorldTradeHeatmapProps {
  data: GeoDistributionPoint[];
  /** 容器最小高度，默认 320px */
  minHeight?: number;
  className?: string;
}

/** 节点最大/最小半径（px） */
const MIN_RADIUS = 6;
const MAX_RADIUS = 22;

/** 雷达半径占容器百分比 */
const RADAR_R = 0.38;

/**
 * 将国家节点均匀分布在圆形雷达上（按活动量排序）
 * —— 返回 { x, y, r } 百分比坐标
 */
function layoutNodes(
  data: GeoDistributionPoint[],
): Array<GeoDistributionPoint & { cx: number; cy: number; r: number }> {
  const maxActivity = Math.max(1, ...data.map((d) => d.totalActivity));

  return data.map((item, index) => {
    // 均匀分布在 360° 内，偏移起始角度避免节点正好在顶部
    const angle = (index / data.length) * Math.PI * 2 - Math.PI / 2;
    const distance = RADAR_R; // 所有节点在同一轨道
    const cx = 0.5 + Math.cos(angle) * distance;
    const cy = 0.5 + Math.sin(angle) * distance;
    const rRatio = item.totalActivity / maxActivity;
    // 线性映射半径：min → max
    const r =
      MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * Math.sqrt(rRatio); // sqrt 使大小差异更温和
    return { ...item, cx, cy, r };
  });
}

/** 活动量 → 颜色映射：低=brand，中=warning，高=danger */
function activityToColor(ratio: number): string {
  if (ratio > 0.66) return "var(--danger)";
  if (ratio > 0.33) return "var(--warning)";
  return "var(--chart-1)";
}

export default function WorldTradeHeatmap({
  data,
  minHeight = 320,
  className,
}: WorldTradeHeatmapProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const containerRef = useRef<HTMLDivElement>(null);

  const [hoveredCode, setHoveredCode] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const maxActivity = useMemo(
    () => Math.max(1, ...data.map((d) => d.totalActivity)),
    [data],
  );

  const nodes = useMemo(() => {
    if (data.length === 0) return [];
    // 按活动量降序排列
    const sorted = [...data].sort((a, b) => b.totalActivity - a.totalActivity);
    return layoutNodes(sorted.slice(0, 15)); // 最多 15 个国家
  }, [data]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent, code: string) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setHoveredCode(code);
      setTooltipPos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    },
    [],
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredCode(null);
  }, []);

  const handleNodeClick = useCallback(
    (countryCode: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (params.get("country") === countryCode) {
        params.delete("country");
      } else {
        params.set("country", countryCode);
      }
      router.push(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const activeCountry = searchParams.get("country");

  // 空数据状态
  if (data.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center text-hint text-xs bg-card rounded-2xl border border-border",
          className,
        )}
        style={{ minHeight }}
      >
        <p>暂无地理分布数据</p>
      </div>
    );
  }

  const viewBox = "0 0 400 400";

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative bg-card rounded-2xl border border-border p-4 overflow-hidden",
        className,
      )}
      style={{ minHeight }}
    >
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-foreground font-semibold text-sm">
          贸易活动热力分布
        </h3>
        <span className="text-hint text-[10px]">近 30 天 · {data.length} 个国家</span>
      </div>

      {/* SVG 雷达球 */}
      <svg
        viewBox={viewBox}
        className="w-full h-full"
        style={{ maxHeight: `calc(${minHeight}px - 3rem)` }}
      >
        {/* 雷达背景圆（多层同心圆） */}
        {[0.15, 0.28, RADAR_R, 0.46].map((r, i) => (
          <circle
            key={i}
            cx={200}
            cy={200}
            r={r * 400}
            fill="none"
            stroke="var(--border)"
            strokeWidth={i === 3 ? 1 : 0.5}
            strokeDasharray={i === 0 ? "none" : "3 4"}
            opacity={0.4 + (3 - i) * 0.15}
          />
        ))}

        {/* 十字参考线 */}
        <line
          x1={200}
          y1={0}
          x2={200}
          y2={400}
          stroke="var(--border)"
          strokeWidth={0.5}
          opacity={0.2}
        />
        <line
          x1={0}
          y1={200}
          x2={400}
          y2={200}
          stroke="var(--border)"
          strokeWidth={0.5}
          opacity={0.2}
        />

        {/* 中心 Hub */}
        <circle cx={200} cy={200} r={4} fill="var(--chart-1)" opacity={0.6} />
        <circle
          cx={200}
          cy={200}
          r={10}
          fill="none"
          stroke="var(--chart-1)"
          strokeWidth={0.5}
          opacity={0.3}
        />

        {/* 连接线（节点 → 中心） */}
        {nodes.map((node) => (
          <line
            key={`line-${node.countryCode}`}
            x1={node.cx * 400}
            y1={node.cy * 400}
            x2={200}
            y2={200}
            stroke="var(--border)"
            strokeWidth={0.4}
            opacity={
              hoveredCode === node.countryCode ||
              activeCountry === node.countryCode
                ? 0.5
                : 0.15
            }
          />
        ))}

        {/* 国家节点 */}
        {nodes.map((node) => {
          const ratio = node.totalActivity / maxActivity;
          const color = activityToColor(ratio);
          const isActive =
            hoveredCode === node.countryCode ||
            activeCountry === node.countryCode;

          return (
            <g
              key={node.countryCode}
              onMouseMove={(e) => handleMouseMove(e, node.countryCode)}
              onMouseLeave={handleMouseLeave}
              onClick={() => handleNodeClick(node.countryCode)}
              style={{ cursor: "pointer" }}
            >
              {/* 外发光环（高活跃 + hover 可见） */}
              {(isActive || ratio > 0.5) && (
                <circle
                  cx={node.cx * 400}
                  cy={node.cy * 400}
                  r={node.r + 6}
                  fill="none"
                  stroke={color}
                  strokeWidth={isActive ? 1.5 : 0.5}
                  opacity={isActive ? 0.4 : 0.15}
                />
              )}

              {/* 节点圆 */}
              <circle
                cx={node.cx * 400}
                cy={node.cy * 400}
                r={isActive ? node.r + 2 : node.r}
                fill={color}
                opacity={isActive ? 0.9 : 0.6}
              />

              {/* 国旗 emoji 文字（节点中心） */}
              <text
                x={node.cx * 400}
                y={node.cy * 400}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={Math.max(node.r * 0.9, 8)}
              >
                {node.flag || "🌐"}
              </text>

              {/* 国家代码标签（节点下方） */}
              <text
                x={node.cx * 400}
                y={node.cy * 400 + node.r + 10}
                textAnchor="middle"
                fill="var(--muted-foreground)"
                fontSize={9}
                fontWeight={500}
              >
                {node.countryName.length > 6
                  ? node.countryName.slice(0, 6) + "…"
                  : node.countryName}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {hoveredCode && (() => {
        const node = nodes.find((n) => n.countryCode === hoveredCode);
        if (!node) return null;
        return (
          <div
            className="absolute z-20 pointer-events-none bg-popover/95 backdrop-blur-sm border border-border rounded-lg px-3 py-2 shadow-lg"
            style={{
              left: tooltipPos.x + 12,
              top: tooltipPos.y - 30,
            }}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-sm">{node.flag}</span>
              <span className="text-foreground text-xs font-semibold">
                {node.countryName}
              </span>
            </div>
            <div className="text-hint text-[10px] mt-0.5">
              询盘 {node.inquiryCount} 条 · 活动量 {node.totalActivity}
            </div>
          </div>
        );
      })()}

      {/* 图例（底部） */}
      <div className="flex items-center justify-center gap-3 mt-2">
        {[
          { label: "低", color: "var(--chart-1)" },
          { label: "中", color: "var(--warning)" },
          { label: "高", color: "var(--danger)" },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-1">
            <span
              className="inline-block size-2.5 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-hint text-[10px]">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
