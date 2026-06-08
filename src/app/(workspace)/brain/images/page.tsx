"use client";

import { useState, useMemo } from "react";
import { ImageIcon, Search, Upload } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { PageTransition } from "@/components/common/PageTransition";
import { cn } from "@/lib/utils";

/** 模拟图像资产数据 */
interface ImageAsset {
  id: string;
  name: string;
  category: string;
  tags: string[];
  ocrStatus: "done" | "pending" | "none";
  resolution: string;
  size: string;
  color: string;
}

const IMAGE_DATA: ImageAsset[] = [
  {
    id: "img-001",
    name: "IP65 投光灯 · 正面白底",
    category: "产品图",
    tags: ["灯具", "白底图", "主图"],
    ocrStatus: "none",
    resolution: "2000×2000",
    size: "1.2 MB",
    color: "#4A5568",
  },
  {
    id: "img-002",
    name: "陶瓷餐具 16 件套 · 场景图",
    category: "产品图",
    tags: ["陶瓷", "场景图", "套件"],
    ocrStatus: "done",
    resolution: "2400×1600",
    size: "2.8 MB",
    color: "#C8B59B",
  },
  {
    id: "img-003",
    name: "UL 认证证书 · 2026 版",
    category: "证书",
    tags: ["认证", "UL", "合规"],
    ocrStatus: "done",
    resolution: "3300×2550",
    size: "3.5 MB",
    color: "#E2E8F0",
  },
  {
    id: "img-004",
    name: "CE 认证证书 · 2026 版",
    category: "证书",
    tags: ["认证", "CE", "合规"],
    ocrStatus: "done",
    resolution: "3300×2550",
    size: "3.2 MB",
    color: "#E2E8F0",
  },
  {
    id: "img-005",
    name: "春季广交会 · 展位全景",
    category: "营销素材",
    tags: ["展会", "广交会", "2026"],
    ocrStatus: "pending",
    resolution: "4000×3000",
    size: "4.8 MB",
    color: "#2D3748",
  },
  {
    id: "img-006",
    name: "智能插座 · 功能示意图",
    category: "营销素材",
    tags: ["智能家居", "示意图", "功能"],
    ocrStatus: "done",
    resolution: "1600×1200",
    size: "0.9 MB",
    color: "#38B2AC",
  },
  {
    id: "img-007",
    name: "德国 Schmidt 客户拜访合影",
    category: "营销素材",
    tags: ["客户", "德国", "拜访"],
    ocrStatus: "none",
    resolution: "3000×2000",
    size: "2.1 MB",
    color: "#553C9A",
  },
  {
    id: "img-008",
    name: "CNC 精密五金件 · 细节特写",
    category: "产品图",
    tags: ["五金", "精密", "细节"],
    ocrStatus: "none",
    resolution: "2400×2400",
    size: "1.8 MB",
    color: "#718096",
  },
];

const CATEGORIES = ["全部", "产品图", "证书", "营销素材"];

/** 智慧大脑 → 图像页 */
export default function ImagesPage() {
  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState("全部");

  const filtered = useMemo(() => {
    let list = [...IMAGE_DATA];
    if (activeCat !== "全部") {
      list = list.filter((img) => img.category === activeCat);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (img) =>
          img.name.toLowerCase().includes(q) ||
          img.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return list;
  }, [activeCat, search]);

  return (
    <PageTransition>
    <div className="space-y-6">
      <PageHeader
        icon={ImageIcon}
        title="图像资产"
        description="产品图、证书、营销素材与 OCR 识别内容库"
        actions={
          <button
            type="button"
            className="bg-brand text-white hover:bg-brand/80 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors"
          >
            <Upload className="size-4" />
            上传图片
          </button>
        }
      />

      {/* 搜索 + 分类筛选 */}
      <div className="flex items-center gap-4">
        <div className="relative max-w-sm flex-1">
          <Search className="text-hint pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索图片名称或标签…"
            className="bg-card border-border text-foreground placeholder:text-hint w-full rounded-xl border py-2 pl-9 pr-4 text-sm outline-none transition-colors focus:border-brand/50"
          />
        </div>
        <div className="flex gap-1.5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCat(cat)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                activeCat === cat
                  ? "bg-brand/10 text-brand"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* 图片卡片网格（4列） */}
      {filtered.length === 0 ? (
        <div className="text-muted-foreground py-16 text-center text-sm">
          未找到匹配的图片
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          {filtered.map((img) => (
            <div
              key={img.id}
              className="bg-card border-border hover:border-brand/30 rounded-2xl border overflow-hidden transition-colors"
            >
              {/* 占位色块 */}
              <div
                className="flex aspect-square items-center justify-center"
                style={{ backgroundColor: img.color }}
              >
                <ImageIcon className="size-10 text-white/40" />
              </div>

              {/* 信息区 */}
              <div className="space-y-2 p-3.5">
                <h3 className="text-foreground truncate text-sm font-medium">
                  {img.name}
                </h3>

                {/* 标签 */}
                <div className="flex flex-wrap gap-1">
                  {img.tags.map((tag) => (
                    <span
                      key={tag}
                      className="bg-accent text-hint rounded-md px-2 py-0.5 text-[10px]"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>

                {/* 分辨率 + OCR 状态 */}
                <div className="flex items-center justify-between">
                  <span className="text-hint text-[11px]">
                    {img.resolution} · {img.size}
                  </span>
                  {img.ocrStatus !== "none" && (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium",
                        img.ocrStatus === "done"
                          ? "bg-success/10 text-success"
                          : "bg-warning/10 text-warning"
                      )}
                    >
                      {img.ocrStatus === "done" ? "OCR 已识别" : "OCR 识别中"}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  </PageTransition>
  );
}
