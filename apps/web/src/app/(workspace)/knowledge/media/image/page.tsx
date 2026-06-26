"use client";

import { ImageIcon, Package, Megaphone, Palette } from "lucide-react";
import { PageTransition } from "@/components/common/PageTransition";
import {
  BrainAssetPlaceholderPage,
  type BrainAssetColumn,
} from "@/components/common/brain-asset-placeholder";

const COLUMNS: [BrainAssetColumn, BrainAssetColumn, BrainAssetColumn] = [
  {
    title: "产品图",
    icon: Package,
    emptyTitle: "产品图像管理",
    emptyDescription:
      "管理产品白底图、场景图、规格图，支持按 SKU 自动关联与 AI 背景去除。",
  },
  {
    title: "营销素材",
    icon: Megaphone,
    emptyTitle: "营销素材管理",
    emptyDescription:
      "Banner、社媒图、邮件头图等营销素材的统一存储与智能适配不同平台尺寸。",
  },
  {
    title: "品牌素材",
    icon: Palette,
    emptyTitle: "品牌视觉素材",
    emptyDescription:
      "Logo 变体、品牌色板、字体文件等品牌视觉资产的集中管理与版本控制。",
  },
];

/** 图像资产 —— 产品图、营销素材与品牌素材管理 */
export default function ImagesPage() {
  return (
    <PageTransition>
      <BrainAssetPlaceholderPage
        title="图像库"
        description="产品图、营销与品牌素材管理"
        featureIcon={ImageIcon}
        featureIconColor="text-brand-blue"
        featureIconBg="bg-brand-blue/10"
        featureTitle="关于图像资产"
        featureText="PRD §9.3：图像资产库是 HermesClaw 视觉内容供给链的核心，承载产品白底图、场景图、证书、营销 banner、社媒素材等
        图像资源。支持 OCR 文字识别、自动标签分类、AI 背景去除与智能裁剪，所有素材可按产品 SKU、场景、市场自动关联。"
        columns={COLUMNS}
        phase2Text="该模块已规划，Phase 2 启动。届时将集成 AI 图像处理引擎与自动标签系统，敬请期待。"
        phase2IconColor="text-brand-blue"
        phase2IconBg="bg-brand-blue/10"
        breadcrumb={[
          { label: "资料库", href: "/files" },
          { label: "图像库" },
        ]}
      />
    </PageTransition>
  );
}
