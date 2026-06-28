"use client";

import { ImageIcon } from "lucide-react";
import { PageTransition } from "@/components/common/PageTransition";
import { MediaAssetPageClient } from "@/components/pages/files/media-asset-page-client";

/** 图像资产 —— 产品图、营销素材与品牌素材管理 */
export default function ImagesPage() {
  return (
    <PageTransition>
      <MediaAssetPageClient
        title="图像库"
        description="产品图、营销与品牌素材管理"
        icon={ImageIcon}
        category="image"
        breadcrumb={[
          { label: "资料库", href: "/files" },
          { label: "图像库" },
        ]}
      />
    </PageTransition>
  );
}
