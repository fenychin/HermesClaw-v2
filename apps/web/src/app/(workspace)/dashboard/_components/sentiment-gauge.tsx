"use client";

/**
 * 行业情绪仪表盘 — SVG 半圆弧仪表组件
 * —— 180° 弧，三色分区（绿=看涨看跌区 / 灰=中性区 / 红=看跌区），指针定位在对应角度。
 * —— 底部显示看涨/中性/看跌标签 + 置信度百分比。
 * —— 用于五大外贸行业情绪（电子/纺织/机械/化工/农业）可视化。
 */
import { cn } from "@/lib/utils";
import type { IndustrySentiment } from "@/types/dashboard";

export interface SentimentGaugeProps {
  data: IndustrySentiment;
  className?: string;
}

/** 将 -100..100 的评分转换为弧度角度（-π/2 .. π/2，即 -90°..90°） */
function scoreToAngle(score: number): number {
  // score: -100 → -π/2（左端=看跌），+100 → +π/2（右端=看涨）
  const clamped = Math.max(-100, Math.min(100, score));
  return (clamped / 100) * (Math.PI / 2);
}

/** 评分 → 颜色 */
function scoreToColor(score: number): string {
  if (score > 20) return "var(--success)";
  if (score < -20) return "var(--danger)";
  return "var(--hint)";
}

/** 评分 → 文本描述 */
function scoreToLabel(score: number): string {
  if (score > 40) return "强烈看涨";
  if (score > 20) return "看涨";
  if (score < -40) return "强烈看跌";
  if (score < -20) return "看跌";
  return "中性";
}

export default function SentimentGauge({
  data,
  className,
}: SentimentGaugeProps) {
  const { sector, score, confidence } = data;
  const color = scoreToColor(score);
  const label = scoreToLabel(score);
  const angle = scoreToAngle(score);

  // SVG 半圆弧参数
  const cx = 60;
  const cy = 54;
  const outerR = 46;
  const innerR = 34;
  const startAngle = Math.PI; // 180° 左侧
  const endAngle = 0; // 0° 右侧

  /** 将角度转为 SVG 坐标 */
  function polarToCartesian(
    cX: number,
    cY: number,
    r: number,
    angleRad: number,
  ): { x: number; y: number } {
    return {
      x: cX + r * Math.cos(angleRad),
      y: cY - r * Math.sin(angleRad),
    };
  }

  /** 绘制弧形路径 */
  function arcPath(
    fromAngle: number,
    toAngle: number,
    r: number,
  ): string {
    const from = polarToCartesian(cx, cy, r, fromAngle);
    const to = polarToCartesian(cx, cy, r, toAngle);
    const largeArcFlag = toAngle - fromAngle > Math.PI ? 1 : 0;
    return [
      `M ${from.x} ${from.y}`,
      `A ${r} ${r} 0 ${largeArcFlag} 1 ${to.x} ${to.y}`,
    ].join(" ");
  }

  // 三段色弧：看跌区 (π → 2π/3)，中性区 (2π/3 → π/3)，看涨区 (π/3 → 0)
  const bearEnd = Math.PI * (2 / 3); // 120°（从 π 到 2π/3 即 60° 弧）
  const neutralEnd = Math.PI * (1 / 3); // 60°

  // 指针坐标
  const pointerEnd = polarToCartesian(cx, cy, outerR + 2, angle);
  const pointerBase1 = polarToCartesian(cx, cy, 6, angle + Math.PI / 2);
  const pointerBase2 = polarToCartesian(cx, cy, 6, angle - Math.PI / 2);

  return (
    <div
      className={cn(
        "flex flex-col items-center bg-card rounded-xl border border-border p-3 min-w-[100px]",
        className,
      )}
    >
      {/* 行业名称 */}
      <span className="text-foreground text-xs font-semibold mb-1">
        {sector}
      </span>

      {/* SVG 半圆仪表 */}
      <svg
        viewBox="0 0 120 64"
        className="w-full max-w-[110px]"
        role="img"
        aria-label={`${sector} 行业情绪: ${label}，置信度 ${Math.round(confidence * 100)}%`}
      >
        {/* 看跌区弧（红） */}
        <path
          d={`${arcPath(startAngle, bearEnd, outerR)} ${arcPath(bearEnd, startAngle, innerR).split(" ").slice(1).reverse().join(" ")} Z`}
          fill="var(--danger)"
          opacity={0.25}
        />

        {/* 中性区弧（灰） */}
        <path
          d={`${arcPath(bearEnd, neutralEnd, outerR)} ${arcPath(neutralEnd, bearEnd, innerR).split(" ").slice(1).reverse().join(" ")} Z`}
          fill="var(--hint)"
          opacity={0.2}
        />

        {/* 看涨区弧（绿） */}
        <path
          d={`${arcPath(neutralEnd, endAngle, outerR)} ${arcPath(endAngle, neutralEnd, innerR).split(" ").slice(1).reverse().join(" ")} Z`}
          fill="var(--success)"
          opacity={0.25}
        />

        {/* 刻度线 */}
        {[Math.PI, Math.PI * 0.75, Math.PI * 0.5, Math.PI * 0.25, 0].map(
          (tickAngle, i) => {
            const start = polarToCartesian(cx, cy, innerR - 3, tickAngle);
            const end = polarToCartesian(cx, cy, outerR + 1, tickAngle);
            return (
              <line
                key={i}
                x1={start.x}
                y1={start.y}
                x2={end.x}
                y2={end.y}
                stroke="var(--border)"
                strokeWidth={0.5}
              />
            );
          },
        )}

        {/* 弧线外框 */}
        <path
          d={arcPath(startAngle, endAngle, outerR)}
          fill="none"
          stroke="var(--border)"
          strokeWidth={1}
        />
        <path
          d={arcPath(startAngle, endAngle, innerR)}
          fill="none"
          stroke="var(--border)"
          strokeWidth={0.5}
        />

        {/* 指针三角 */}
        <polygon
          points={`${pointerEnd.x},${pointerEnd.y} ${pointerBase1.x},${pointerBase1.y} ${pointerBase2.x},${pointerBase2.y}`}
          fill={color}
          stroke="var(--card)"
          strokeWidth={0.5}
        />

        {/* 中心圆点 */}
        <circle
          cx={cx}
          cy={cy}
          r={4}
          fill="var(--card)"
          stroke={color}
          strokeWidth={1.5}
        />
      </svg>

      {/* 评分文本 */}
      <span
        className="text-xs font-semibold mt-0.5"
        style={{ color }}
      >
        {label}
      </span>

      {/* 置信度 */}
      <span className="text-hint text-[9px]">
        置信度 {Math.round(confidence * 100)}%
      </span>
    </div>
  );
}

/**
 * 行业情绪行（5 个仪表盘并排）
 */
export interface SentimentRowProps {
  data: IndustrySentiment[];
  className?: string;
}

export function SentimentRow({ data, className }: SentimentRowProps) {
  if (data.length === 0) {
    return (
      <div className={cn("flex items-center justify-center text-hint text-xs py-8", className)}>
        暂无行业情绪数据
      </div>
    );
  }

  return (
    <div className={cn("flex flex-wrap justify-center gap-2", className)}>
      {data.map((item) => (
        <SentimentGauge key={item.sector} data={item} />
      ))}
    </div>
  );
}
