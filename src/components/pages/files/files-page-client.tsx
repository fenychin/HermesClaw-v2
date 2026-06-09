"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Upload,
  List,
  Grid3X3,
  Trash2,
  Move,
  Tag,
  Download,
  Eye,
  MoreHorizontal,
  X,
  FolderOpen,
  FileText,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { cn } from "@/lib/utils";
import type { FileItem, FileParseStatus, VectorIndexStatus } from "@/types";

import {
  mockFiles,
  fileCategories,
  fileTypeIconMap,
} from "./file-mock-data";

/** 文件分类树（左侧栏） */
function FileCategoryTree({
  selected,
  onSelect,
  counts,
}: {
  selected: string;
  onSelect: (key: string) => void;
  counts: Record<string, number>;
}) {
  return (
    <aside className="w-52 shrink-0 flex flex-col border-border border-r bg-sidebar/60">
      {/* 标题 */}
      <div className="px-5 pt-5 pb-3">
        <h2 className="text-foreground text-lg font-semibold tracking-tight">
          文件
        </h2>
      </div>

      {/* 分类列表 */}
      <nav className="flex-1 overflow-y-auto px-3 space-y-0.5">
        {fileCategories.map((cat) => (
          <button
            key={cat.key}
            type="button"
            onClick={() => onSelect(cat.key)}
            className={cn(
              "w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors text-left",
              selected === cat.key
                ? "bg-accent text-foreground font-medium"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
          >
            <span className="text-base shrink-0">{cat.icon}</span>
            <span className="flex-1 truncate">{cat.label}</span>
            {counts[cat.key] !== undefined && counts[cat.key] > 0 && (
              <Badge
                variant="secondary"
                className="bg-card text-hint shrink-0 h-5 px-1.5 text-[10px] font-medium tabular-nums"
              >
                {counts[cat.key]}
              </Badge>
            )}
          </button>
        ))}
      </nav>

      {/* 底部新建按钮 */}
      <div className="px-3 pb-4 pt-2">
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground">
          <FolderOpen className="size-4" />
          新建文件夹
        </Button>
      </div>
    </aside>
  );
}

/** 解析状态 Badge */
function ParseStatusBadge({ status }: { status: FileParseStatus }) {
  const config: Record<
    FileParseStatus,
    { label: string; className: string; showDot: boolean }
  > = {
    parsed: {
      label: "已解析",
      className: "bg-success/10 text-success border-success/20",
      showDot: true,
    },
    parsing: {
      label: "解析中",
      className: "bg-warning/10 text-warning border-warning/20",
      showDot: true,
    },
    unparsed: {
      label: "未解析",
      className: "bg-muted text-hint border-border",
      showDot: false,
    },
    failed: {
      label: "失败",
      className: "bg-danger/10 text-danger border-danger/20",
      showDot: true,
    },
  };

  const c = config[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        c.className,
      )}
    >
      {c.showDot ? (
        <span
          className={cn(
            "size-1.5 rounded-full",
            status === "parsed" && "bg-success",
            status === "parsing" && "bg-warning animate-pulse",
            status === "failed" && "bg-danger",
          )}
        />
      ) : null}
      {c.label}
    </span>
  );
}

/** 文件类型 Badge */
function FileTypeBadge({ type }: { type: string }) {
  return (
    <Badge variant="outline" className="text-[11px] font-mono uppercase text-hint">
      {type}
    </Badge>
  );
}

/** 文件详情 Drawer（右侧滑出） */
function FileDetailDrawer({
  file,
  open,
  onClose,
}: {
  file: FileItem | null;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();

  if (!file) return null;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        className="w-[480px] sm:max-w-[480px] flex flex-col p-0"
        showCloseButton
      >
        {/* Header */}
        <SheetHeader className="border-border border-b px-5 py-4">
          <SheetTitle className="flex items-start gap-3 text-base">
            <span className="text-2xl shrink-0 mt-0.5">
              {fileTypeIconMap[file.type] || "📄"}
            </span>
            <span className="flex-1 leading-snug break-words">
              {file.name}
            </span>
          </SheetTitle>
          <SheetDescription className="flex items-center gap-2 mt-2">
            <FileTypeBadge type={file.type} />
            <span className="text-hint text-xs">{file.size}</span>
          </SheetDescription>
        </SheetHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* 解析状态 */}
          <div className="space-y-1.5">
            <p className="text-hint text-[11px] font-medium uppercase tracking-wide">
              解析状态
            </p>
            <div className="flex items-center gap-3">
              <ParseStatusBadge status={file.parseStatus} />
              <VectorIndexBadge status={file.vectorIndexStatus} />
            </div>
          </div>

          {/* 解析摘要 */}
          {file.parseSummary ? (
            <div className="space-y-1.5">
              <p className="text-hint text-[11px] font-medium uppercase tracking-wide">
                解析摘要
              </p>
              <div className="bg-accent/50 text-muted-foreground rounded-xl border border-border px-4 py-3 text-xs leading-relaxed">
                {file.parseSummary}
              </div>
            </div>
          ) : null}

          {/* 关联项目 */}
          {file.relatedProjectName ? (
            <div className="space-y-1.5">
              <p className="text-hint text-[11px] font-medium uppercase tracking-wide">
                关联项目
              </p>
              <button
                type="button"
                onClick={() =>
                  router.push(`/projects/${file.relatedProjectId}`)
                }
                className="text-sm text-brand-blue hover:underline"
              >
                {file.relatedProjectName}
              </button>
            </div>
          ) : null}

          {/* 关联智能体 */}
          {file.relatedAgentIds.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-hint text-[11px] font-medium uppercase tracking-wide">
                关联智能体
              </p>
              <div className="flex flex-wrap gap-1.5">
                {file.relatedAgentIds.map((aid) => (
                  <Badge
                    key={aid}
                    variant="secondary"
                    className="cursor-pointer hover:bg-accent text-xs"
                    onClick={() => router.push(`/agents/${aid}`)}
                  >
                    {getAgentName(aid)}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}

          {/* 向量索引状态 已在上面展示 */}

          {/* 标签 */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-hint text-[11px] font-medium uppercase tracking-wide">
                标签
              </p>
              <button
                type="button"
                className="text-brand text-[11px] hover:text-brand/80 transition-colors"
              >
                +添加
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {file.tags.map((tag) => (
                <span
                  key={tag}
                  className="bg-accent/80 text-muted-foreground inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[11px]"
                >
                  {tag}
                  <button
                    type="button"
                    className="hover:text-foreground transition-colors"
                  >
                    <X className="size-2.5" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* 版本历史 */}
          {file.versions.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-hint text-[11px] font-medium uppercase tracking-wide">
                版本历史
              </p>
              <div className="space-y-2">
                {file.versions.map((v, i) => (
                  <div
                    key={v.id}
                    className="flex items-start gap-3 text-xs"
                  >
                    <div className="flex flex-col items-center pt-1.5">
                      <div
                        className={cn(
                          "size-2 rounded-full border-2",
                          i === 0
                            ? "border-brand bg-brand"
                            : "border-border bg-transparent",
                        )}
                      />
                      {i < file.versions.length - 1 ? (
                        <div className="bg-border w-px h-full min-h-[12px]" />
                      ) : null}
                    </div>
                    <div className="flex-1 min-w-0 pb-2">
                      <p className="text-foreground truncate text-xs font-medium">
                        {v.fileName}
                      </p>
                      <p className="text-hint mt-0.5 text-[10px]">
                        {v.operator} · {formatDate(v.createdAt)}
                        {v.note ? ` · ${v.note}` : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer 操作 */}
        <SheetFooter className="border-border border-t px-5 py-3 flex-row gap-2">
          <Button size="sm" className="flex-1 gap-2">
            <Download className="size-4" />
            下载
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-2 text-danger hover:text-danger"
          >
            <Trash2 className="size-4" />
            删除
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** 向量索引 Badge */
function VectorIndexBadge({ status }: { status: VectorIndexStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        status === "indexed"
          ? "bg-success/10 text-success border-success/20"
          : "bg-muted text-hint border-border",
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          status === "indexed" ? "bg-success" : "bg-border",
        )}
      />
      {status === "indexed" ? "已索引" : "未索引"}
    </span>
  );
}

/** 文件上传 Drawer */
function FileUploadSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [selectedFiles, setSelectedFiles] = useState<
    { name: string; size: string }[]
  >([]);
  const [autoParse, setAutoParse] = useState(true);

  const handleAddFiles = () => {
    // Mock: 模拟选择文件
    setSelectedFiles([
      { name: "新产品目录_2026Q3.pdf", size: "5.2 MB" },
      { name: "客户报价模板_新版.xlsx", size: "1.1 MB" },
    ]);
  };

  const handleRemoveFile = (idx: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        className="w-[480px] sm:max-w-[480px] flex flex-col p-0"
        showCloseButton
      >
        <SheetHeader className="border-border border-b px-5 py-4">
          <SheetTitle>上传文件</SheetTitle>
          <SheetDescription>
            将文件上传到知识库，支持自动解析与向量索引
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* 拖拽区域 */}
          <div
            onClick={handleAddFiles}
            className="border-border hover:border-brand/40 hover:bg-accent/50 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-colors"
          >
            <div className="bg-brand/10 text-brand flex size-14 items-center justify-center rounded-2xl">
              <Upload className="size-7" />
            </div>
            <div>
              <p className="text-foreground text-sm font-medium">
                拖拽文件到此处或点击上传
              </p>
              <p className="text-hint mt-1 text-xs">
                支持 PDF、Excel、Word、图片、音频、视频，单文件最大 200MB
              </p>
            </div>
          </div>

          {/* 已选文件列表 */}
          {selectedFiles.length > 0 ? (
            <div className="space-y-2">
              <p className="text-hint text-[11px] font-medium uppercase tracking-wide">
                已选文件 ({selectedFiles.length})
              </p>
              <div className="space-y-2">
                {selectedFiles.map((f, i) => (
                  <div
                    key={i}
                    className="border-border bg-accent/40 flex items-center gap-3 rounded-xl border px-3 py-2.5"
                  >
                    <span className="text-lg">{fileTypeIconMap["pdf"] || "📄"}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-foreground truncate text-sm font-medium">
                        {f.name}
                      </p>
                      <p className="text-hint text-[11px]">{f.size}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveFile(i)}
                      className="text-hint hover:text-danger transition-colors"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* 上传选项 */}
          <div className="space-y-3">
            <p className="text-hint text-[11px] font-medium uppercase tracking-wide">
              上传选项
            </p>

            {/* 自动解析开关 */}
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="text-foreground text-sm">上传后自动解析</p>
                <p className="text-hint text-[11px]">
                  AI 将自动提取文本、图像、表格等结构化信息
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={autoParse}
                onClick={() => setAutoParse(!autoParse)}
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors",
                  autoParse ? "bg-primary" : "bg-muted border-border",
                )}
              >
                <span
                  className={cn(
                    "bg-background pointer-events-none inline-block size-3.5 rounded-full shadow ring-0 transition-transform",
                    autoParse ? "translate-x-4" : "translate-x-0.5",
                  )}
                />
              </button>
            </label>

            {/* 关联项目 */}
            <div className="space-y-1.5">
              <p className="text-foreground text-sm">关联到项目</p>
              <select className="border-border bg-accent/40 text-foreground w-full rounded-lg border px-3 py-2 text-sm outline-none focus-visible:border-ring">
                <option value="">不关联</option>
                <option value="proj-001">美国 BrightPath 户外灯具订单</option>
                <option value="proj-002">德国 Schmidt 精密五金长期合作</option>
                <option value="proj-003">日本 Sakura 家居收纳新品开发</option>
                <option value="proj-005">智能家居产品线 2026 出海计划</option>
              </select>
            </div>
          </div>
        </div>

        <SheetFooter className="border-border border-t px-5 py-3">
          <Button
            size="sm"
            disabled={selectedFiles.length === 0}
            className="w-full gap-2"
          >
            <Upload className="size-4" />
            开始上传 ({selectedFiles.length} 个文件)
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** 格式化日期（相对日期 + 精简展示） */
function formatDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "今天";
  if (diffDays === 1) return "昨天";
  if (diffDays < 7) return `${diffDays} 天前`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} 周前`;

  const m = date.getMonth() + 1;
  const d = date.getDate();
  return `${m}月${d}日`;
}

/** 格式化完整日期 */
function formatFullDate(iso: string): string {
  const date = new Date(iso);
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const h = date.getHours().toString().padStart(2, "0");
  const min = date.getMinutes().toString().padStart(2, "0");
  return `${y}/${m}/${d} ${h}:${min}`;
}

/** 根据 agentId 获取智能体名称（优先匹配 mock 数据） */
function getAgentName(agentId: string): string {
  const map: Record<string, string> = {
    "agent-001": "Leon",
    "agent-002": "Clara",
    "agent-003": "Marcus",
    "agent-004": "Quincy",
    "agent-005": "Diana",
    "agent-006": "Athena",
    "agent-007": "Sophia",
    "agent-008": "Victor",
    "agent-009": "Scout",
    "agent-010": "Iris",
  };
  return map[agentId] || agentId;
}

/** ===== 主组件 ===== */
export function FilesPageClient() {
  const router = useRouter();

  // 状态
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "card">("table");
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(
    new Set(),
  );
  const [detailFileId, setDetailFileId] = useState<string | null>(null);
  const [showUploadSheet, setShowUploadSheet] = useState(false);

  // 过滤文件
  const filteredFiles = useMemo(() => {
    let files = [...mockFiles];

    // 分类过滤
    if (selectedCategory !== "all") {
      files = files.filter((f) => f.category === selectedCategory);
    }

    // 搜索过滤
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      files = files.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.tags.some((t) => t.toLowerCase().includes(q)) ||
          (f.relatedProjectName &&
            f.relatedProjectName.toLowerCase().includes(q)),
      );
    }

    return files;
  }, [selectedCategory, searchQuery]);

  // 各分类文件计数
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    counts["all"] = mockFiles.length;
    for (const cat of fileCategories) {
      if (cat.category === null) continue;
      counts[cat.key] = mockFiles.filter(
        (f) => f.category === cat.category,
      ).length;
    }
    return counts;
  }, []);

  // 当前查看的文件详情
  const detailFile = useMemo(
    () => mockFiles.find((f) => f.id === detailFileId) || null,
    [detailFileId],
  );

  // 全选/取消全选（当前页）
  const allSelected = filteredFiles.every((f) => selectedFileIds.has(f.id));

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedFileIds(new Set());
    } else {
      setSelectedFileIds(new Set(filteredFiles.map((f) => f.id)));
    }
  }, [allSelected, filteredFiles]);

  const toggleSelectFile = useCallback((id: string) => {
    setSelectedFileIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleOpenDetail = useCallback((id: string) => {
    setDetailFileId(id);
  }, []);

  const batchCount = selectedFileIds.size;

  return (
    <div className="flex h-full">
      {/* ====== 左侧分类树 ====== */}
      <FileCategoryTree
        selected={selectedCategory}
        onSelect={setSelectedCategory}
        counts={categoryCounts}
      />

      {/* ====== 右侧主区域 ====== */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* ---- 顶部页头 ---- */}
        <div className="border-border border-b px-6 py-4">
          <PageHeader
            title="文件"
            description="企业内容供给链：分类、解析、标签、向量索引与版本控制"
          />

          {/* 工具栏 */}
          <div className="flex items-center gap-3 mt-2">
            {/* 搜索 */}
            <div className="relative flex-1 max-w-sm">
              <Search className="text-hint absolute left-3 top-1/2 size-4 -translate-y-1/2 pointer-events-none" />
              <Input
                placeholder="搜索文件名称、标签或关联项目..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>

            {/* 上传按钮 */}
            <Button
              size="sm"
              className="gap-2"
              onClick={() => setShowUploadSheet(true)}
            >
              <Upload className="size-4" />
              上传文件
            </Button>

            {/* 视图切换 */}
            <div className="bg-accent/50 flex items-center rounded-lg border border-border p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={cn(
                  "flex items-center justify-center size-8 rounded-md transition-colors",
                  viewMode === "table"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-hint hover:text-foreground",
                )}
                aria-label="表格视图"
              >
                <List className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("card")}
                className={cn(
                  "flex items-center justify-center size-8 rounded-md transition-colors",
                  viewMode === "card"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-hint hover:text-foreground",
                )}
                aria-label="卡片视图"
              >
                <Grid3X3 className="size-4" />
              </button>
            </div>

            {/* 批量操作区 */}
            {batchCount > 0 ? (
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-hint text-xs">
                  已选 {batchCount} 项
                </span>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8">
                  <Tag className="size-3.5" />
                  打标签
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8">
                  <Move className="size-3.5" />
                  移动
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs h-8 text-danger hover:text-danger"
                >
                  <Trash2 className="size-3.5" />
                  删除
                </Button>
                <button
                  type="button"
                  onClick={() => setSelectedFileIds(new Set())}
                  className="text-hint hover:text-foreground transition-colors"
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {/* ---- 内容区 ---- */}
        <div className="flex-1 overflow-auto p-6">
          {/* 分类标题 */}
          <div className="mb-4">
            <h3 className="text-foreground text-sm font-semibold">
              {
                fileCategories.find((c) => c.key === selectedCategory)
                  ?.label
              }
              <span className="text-hint ml-2 text-xs font-normal">
                {filteredFiles.length} 个项目
              </span>
            </h3>
          </div>

          {filteredFiles.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="没有找到文件"
              description="尝试调整搜索条件或切换到其他分类"
            />
          ) : viewMode === "table" ? (
            /* ===== 表格视图 ===== */
            <div className="border-border rounded-2xl border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allSelected}
                        aria-label="全选"
                        onCheckedChange={() => toggleSelectAll()}
                      />
                    </TableHead>
                    <TableHead>文件名</TableHead>
                    <TableHead className="w-20">类型</TableHead>
                    <TableHead className="w-20">大小</TableHead>
                    <TableHead className="w-36">关联项目</TableHead>
                    <TableHead className="w-24">解析状态</TableHead>
                    <TableHead className="w-28">更新时间</TableHead>
                    <TableHead className="w-24">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredFiles.map((file) => (
                    <TableRow
                      key={file.id}
                      className={cn(
                        "group",
                        selectedFileIds.has(file.id) && "bg-accent/30",
                      )}
                    >
                      <TableCell>
                        <Checkbox
                          checked={selectedFileIds.has(file.id)}
                          onCheckedChange={() => toggleSelectFile(file.id)}
                          aria-label={`选择 ${file.name}`}
                        />
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => handleOpenDetail(file.id)}
                          className="flex items-center gap-2.5 hover:opacity-80 transition-opacity text-left"
                        >
                          <span className="text-lg shrink-0">
                            {fileTypeIconMap[file.type] || "📄"}
                          </span>
                          <span className="text-foreground truncate text-sm font-medium max-w-[320px]">
                            {file.name}
                          </span>
                        </button>
                      </TableCell>
                      <TableCell>
                        <FileTypeBadge type={file.type} />
                      </TableCell>
                      <TableCell className="text-hint text-sm tabular-nums">
                        {file.size}
                      </TableCell>
                      <TableCell>
                        {file.relatedProjectName ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(
                                `/projects/${file.relatedProjectId}`,
                              );
                            }}
                            className="text-brand-blue hover:underline text-sm truncate max-w-[140px] block text-left"
                          >
                            {file.relatedProjectName}
                          </button>
                        ) : (
                          <span className="text-hint text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <ParseStatusBadge status={file.parseStatus} />
                      </TableCell>
                      <TableCell className="text-hint text-sm">
                        {formatDate(file.updatedAt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => handleOpenDetail(file.id)}
                            className="text-hint hover:text-foreground p-1 transition-colors"
                            title="预览"
                          >
                            <Eye className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            className="text-hint hover:text-foreground p-1 transition-colors"
                            title="下载"
                          >
                            <Download className="size-3.5" />
                          </button>
                          <DropdownMenu>
                            <DropdownMenuTrigger className="text-hint hover:text-foreground p-1 transition-colors">
                              <MoreHorizontal className="size-3.5" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-32">
                              <DropdownMenuItem
                                onClick={() => handleOpenDetail(file.id)}
                              >
                                <Eye className="size-3.5" />
                                预览
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <Download className="size-3.5" />
                                下载
                              </DropdownMenuItem>
                              <DropdownMenuItem variant="destructive">
                                <Trash2 className="size-3.5" />
                                删除
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            /* ===== 卡片视图 ===== */
            <div className="grid grid-cols-4 gap-4">
              {filteredFiles.map((file) => (
                <div
                  key={file.id}
                  onClick={() => handleOpenDetail(file.id)}
                  className={cn(
                    "border-border bg-card hover:border-brand/30 hover:bg-accent/30 group relative cursor-pointer rounded-2xl border p-4 transition-all",
                    selectedFileIds.has(file.id) &&
                      "border-brand/50 bg-accent/20",
                  )}
                >
                  {/* 选中标记 & 文件图标 */}
                  <div className="flex items-start justify-between mb-3">
                    <span className="text-5xl">
                      {fileTypeIconMap[file.type] || "📄"}
                    </span>
                    <Checkbox
                      checked={selectedFileIds.has(file.id)}
                      onCheckedChange={() => toggleSelectFile(file.id)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`选择 ${file.name}`}
                      className="opacity-0 group-hover:opacity-100 transition-opacity data-checked:opacity-100 mt-1"
                    />
                  </div>

                  {/* 文件名 */}
                  <p className="text-foreground text-sm font-medium leading-snug line-clamp-1 mb-2">
                    {file.name}
                  </p>

                  {/* 类型 + 大小 + 时间 */}
                  <div className="flex items-center gap-2 mb-3">
                    <FileTypeBadge type={file.type} />
                    <span className="text-hint text-[11px]">
                      {file.size}
                    </span>
                  </div>

                  <div className="text-hint text-[11px] mb-3">
                    {formatFullDate(file.updatedAt)}
                  </div>

                  {/* 底部操作 */}
                  <div className="flex items-center justify-between">
                    <ParseStatusBadge status={file.parseStatus} />
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        onClick={(e) => e.stopPropagation()}
                        className="text-hint hover:text-foreground p-1 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-32">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenDetail(file.id);
                          }}
                        >
                          <Eye className="size-3.5" />
                          预览
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Download className="size-3.5" />
                          下载
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Trash2 className="size-3.5" />
                          删除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ====== 文件详情 Drawer ====== */}
      <FileDetailDrawer
        file={detailFile}
        open={detailFileId !== null}
        onClose={() => setDetailFileId(null)}
      />

      {/* ====== 文件上传 Drawer ====== */}
      <FileUploadSheet
        open={showUploadSheet}
        onClose={() => setShowUploadSheet(false)}
      />
    </div>
  );
}
