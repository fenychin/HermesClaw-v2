"use client";

import { Mic, Phone, Globe } from "lucide-react";
import { PageTransition } from "@/components/common/PageTransition";
import {
  BrainAssetPlaceholderPage,
  type BrainAssetColumn,
} from "@/components/common/brain-asset-placeholder";

const COLUMNS: [BrainAssetColumn, BrainAssetColumn, BrainAssetColumn] = [
  {
    title: "品牌声音",
    icon: Mic,
    emptyTitle: "品牌声音模型",
    emptyDescription:
      "上传企业声音样本，生成专属品牌音色。支持单人多声线、情感语调调节与实时预览。",
  },
  {
    title: "外呼模板",
    icon: Phone,
    emptyTitle: "多语种外呼模板",
    emptyDescription:
      "预置 8 种语言的电商外呼脚本模板，覆盖询盘跟进、订单确认、节日关怀等场景。",
  },
  {
    title: "多语种语音资产",
    icon: Globe,
    emptyTitle: "语音资产管理",
    emptyDescription:
      "按语种、场景、音色标签检索与管理全部语音资产，支持版本回溯与 A/B 测试。",
  },
];

/** 语音库 —— 品牌声音与多语种语音资产管理 */
export default function VoicePage() {
  return (
    <PageTransition>
      <BrainAssetPlaceholderPage
        title="语音库"
        description="品牌声音与多语种语音资产"
        featureIcon={Mic}
        featureIconColor="text-brand"
        featureIconBg="bg-brand/10"
        featureTitle="关于语音库"
        featureText="PRD §9.3：语音库是 HermesClaw 多模态资产体系的核心组件，承载品牌声音模型、多语种外呼模板、TTS 音色管理等能力。
支持上传企业管理者的声音样本，生成专属品牌音色；内置中/英/日/韩/西/法/德/阿 8 种语言的电商场景外呼模板；
所有语音资产可按语种、场景、音色标签检索与版本管理。"
        columns={COLUMNS}
        phase2Text="该模块已规划，Phase 2 启动。届时将集成 TTS 引擎与声音克隆模型，敬请期待。"
        phase2IconColor="text-brand"
        phase2IconBg="bg-brand/10"
        breadcrumb={[
          { label: "智慧大脑", href: "/brain" },
          { label: "语音库" },
        ]}
      />
    </PageTransition>
  );
}
