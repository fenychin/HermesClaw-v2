"use client";

import { Mic } from "lucide-react";
import { PageTransition } from "@/components/common/PageTransition";
import { MediaAssetPageClient } from "@/components/pages/files/media-asset-page-client";

/** 语音库 —— 品牌声音与多语种语音资产管理 */
export default function VoicePage() {
  return (
    <PageTransition>
      <MediaAssetPageClient
        title="语音库"
        description="品牌声音与多语种语音资产"
        icon={Mic}
        category="audio"
        breadcrumb={[
          { label: "资料库", href: "/files" },
          { label: "语音库" },
        ]}
      />
    </PageTransition>
  );
}
