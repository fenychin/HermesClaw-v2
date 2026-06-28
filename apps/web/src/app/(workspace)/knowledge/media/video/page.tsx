"use client";

import { Video } from "lucide-react";
import { PageTransition } from "@/components/common/PageTransition";
import { MediaAssetPageClient } from "@/components/pages/files/media-asset-page-client";

/** 视频资产 —— 讲解、产品与数字人口播素材管理 */
export default function VideosPage() {
  return (
    <PageTransition>
      <MediaAssetPageClient
        title="视频库"
        description="产品讲解、演示与数字人口播素材"
        icon={Video}
        category="video"
        breadcrumb={[
          { label: "资料库", href: "/files" },
          { label: "视频库" },
        ]}
      />
    </PageTransition>
  );
}
