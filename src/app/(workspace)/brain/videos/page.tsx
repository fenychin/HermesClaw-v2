"use client";

import { Video, Presentation, UserRound, Film } from "lucide-react";
import { PageTransition } from "@/components/common/PageTransition";
import {
  BrainAssetPlaceholderPage,
  type BrainAssetColumn,
} from "@/components/common/brain-asset-placeholder";

const COLUMNS: [BrainAssetColumn, BrainAssetColumn, BrainAssetColumn] = [
  {
    title: "产品讲解",
    icon: Presentation,
    emptyTitle: "产品讲解视频",
    emptyDescription:
      "产品功能演示、开箱评测、生产工艺等讲解视频的统一管理与多语种字幕生成。",
  },
  {
    title: "数字人口播",
    icon: UserRound,
    emptyTitle: "数字人口播素材",
    emptyDescription:
      "AI 数字人生成的多语种口播视频，支持模板化批量生产与品牌形象定制。",
  },
  {
    title: "营销视频",
    icon: Film,
    emptyTitle: "营销视频素材",
    emptyDescription:
      "社媒短视频、广告素材、客户案例视频的统一存储与智能标签分类。",
  },
];

/** 视频资产 —— 讲解、产品与数字人口播素材管理 */
export default function VideosPage() {
  return (
    <PageTransition>
      <BrainAssetPlaceholderPage
        title="视频资产"
        description="产品讲解、演示与数字人口播素材"
        featureIcon={Video}
        featureIconColor="text-success"
        featureIconBg="bg-success/10"
        featureTitle="关于视频资产"
        featureText="PRD §9.3：视频资产库是 HermesClaw 多模态内容供给链的重要组成部分，承载产品讲解视频、工厂实拍、数字人口播、
客户案例等视频资源。支持 AI 自动生成字幕、多语种配音、智能剪辑片段提取，所有视频按产品/场景/市场自动关联。"
        columns={COLUMNS}
        phase2Text="该模块已规划，Phase 2 启动。届时将集成 AI 视频处理引擎与数字人生成管线，敬请期待。"
        phase2IconColor="text-success"
        phase2IconBg="bg-success/10"
        breadcrumb={[
          { label: "智慧大脑", href: "/brain" },
          { label: "视频" },
        ]}
      />
    </PageTransition>
  );
}
