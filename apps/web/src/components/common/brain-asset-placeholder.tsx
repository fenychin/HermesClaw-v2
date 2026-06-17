import type { LucideIcon } from "lucide-react";
import { Sparkles } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { Badge } from "@/components/ui/badge";

/** 单个功能分区的配置 */
export interface BrainAssetColumn {
  title: string;
  icon: LucideIcon;
  emptyTitle: string;
  emptyDescription: string;
}

interface BrainAssetPlaceholderPageProps {
  /** 页面标题 */
  title: string;
  /** 页面描述（PageHeader 副标题） */
  description: string;
  /** 功能说明卡片中的图标 */
  featureIcon: LucideIcon;
  /** 功能说明卡片中图标的颜色 token（如 "text-brand"） */
  featureIconColor: string;
  /** 功能说明卡片中图标背景 token（如 "bg-brand/10"） */
  featureIconBg: string;
  /** 功能说明卡片标题 */
  featureTitle: string;
  /** 功能说明卡片文字（PRD 描述） */
  featureText: string;
  /** 三个功能分区 */
  columns: [BrainAssetColumn, BrainAssetColumn, BrainAssetColumn];
  /** 底部 Phase 2 提示文字 */
  phase2Text: string;
  /** 底部 Phase 2 提示图标颜色 */
  phase2IconColor?: string;
  /** 底部 Phase 2 提示图标背景 */
  phase2IconBg?: string;
  /** 面包屑（可选） */
  breadcrumb?: { label: string; href?: string }[];
}

/**
 * 智慧大脑多模态资产占位页通用组件
 * —— 用于 voice / images / videos 等 Phase 2 规划中的模块，统一结构
 *    消除三份 95% 重复的页级 JSX
 */
export function BrainAssetPlaceholderPage({
  title,
  description,
  featureIcon: FeatureIcon,
  featureIconColor = "text-brand",
  featureIconBg = "bg-brand/10",
  featureTitle,
  featureText,
  columns,
  phase2Text,
  phase2IconColor = "text-brand",
  phase2IconBg = "bg-brand/10",
  breadcrumb,
}: BrainAssetPlaceholderPageProps) {
  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={description}
        breadcrumb={breadcrumb}
      />

      {/* 功能说明卡片 */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <div
            className={`size-10 rounded-xl ${featureIconBg} flex items-center justify-center shrink-0`}
          >
            <FeatureIcon className={`size-5 ${featureIconColor}`} />
          </div>
          <div>
            <h3 className="text-foreground text-sm font-semibold">{featureTitle}</h3>
            <p className="text-muted-foreground text-sm mt-1.5 leading-relaxed">
              {featureText}
            </p>
          </div>
        </div>
      </div>

      {/* 三个功能分区 */}
      <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-3">
        {columns.map((col) => (
          <div key={col.title} className="bg-card border border-border rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-foreground text-sm font-semibold">{col.title}</h3>
              <Badge variant="outline" className="text-hint text-[10px]">
                规划中
              </Badge>
            </div>
            <div className="pt-2">
              <EmptyState
                icon={col.icon}
                title={col.emptyTitle}
                description={col.emptyDescription}
              />
            </div>
          </div>
        ))}
      </div>

      {/* 底部提示 */}
      <div className="bg-accent/50 border border-dashed border-border rounded-xl p-4 flex items-center gap-3">
        <div
          className={`size-9 rounded-lg ${phase2IconBg} flex items-center justify-center shrink-0`}
        >
          <Sparkles className={`size-4 ${phase2IconColor}`} />
        </div>
        <p className="text-muted-foreground text-xs leading-relaxed">
          {phase2Text}
        </p>
      </div>
    </div>
  );
}
