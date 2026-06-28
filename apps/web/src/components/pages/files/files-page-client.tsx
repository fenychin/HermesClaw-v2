"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
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
  User,
  ImageIcon,
  Video,
  Mic,
  Package,
  DollarSign,
  ScrollText,
  Archive,
  Files,
  Loader2,
  CheckCircle2,
  Bot,
  UserPlus,
  AlertTriangle,
  ExternalLink,
  Hash,
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
import { cn, formatFileSize } from "@/lib/utils";
import { formatRelativeDay, formatFullDateTime } from "@/lib/date-utils";
import type { FileItem, FileParseStatus, VectorIndexStatus } from "@/types";

import { mockFiles } from "./file-mock-data";

/** 文件图标组件（静态条件渲染，避免 render 中创建组件） */
function FileIcon({ type, className }: { type: string; className?: string }) {
  const c = className;
  const lower = type.toLowerCase();
  if (["pdf"].includes(lower)) return <FileText className={c} />;
  if (["xlsx", "xls", "csv"].includes(lower)) return <ScrollText className={c} />;
  if (["docx", "doc"].includes(lower)) return <FileText className={c} />;
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(lower)) return <ImageIcon className={c} />;
  if (["mp4", "mov", "avi", "webm"].includes(lower)) return <Video className={c} />;
  if (["m4a", "mp3", "wav", "ogg"].includes(lower)) return <Mic className={c} />;
  if (["zip", "rar", "gz", "7z"].includes(lower)) return <Archive className={c} />;
  return <FileText className={c} />;
}

/** 文件分类定义（使用 Lucide 图标组件） */
interface FileCategoryDef {
  key: string;
  label: string;
  icon: LucideIcon;
  category: FileItem["category"] | null;
}

const fileCategories: FileCategoryDef[] = [
  { key: "all", label: "全部文件", icon: Files, category: null },
  { key: "customer", label: "客户资料", icon: User, category: "customer" },
  { key: "product", label: "产品资料", icon: Package, category: "product" },
  { key: "quotation", label: "报价单", icon: DollarSign, category: "quotation" },
  { key: "contract", label: "合同", icon: ScrollText, category: "contract" },
  { key: "image", label: "图像", icon: ImageIcon, category: "image" },
  { key: "video", label: "视频", icon: Video, category: "video" },
  { key: "audio", label: "语音", icon: Mic, category: "audio" },
  { key: "archive", label: "归档文件", icon: Archive, category: "archive" },
];

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
        {fileCategories.map((cat) => {
          const Icon = cat.icon;
          return (
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
              <Icon className="size-4 shrink-0" />
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
          );
        })}
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

/** 文件来源 Badge（AI 生成物 / 用户上传 / 来源未知） */
function SourceBadge({ sourceType, taskId }: { sourceType: string; taskId: string | null }) {
  if (sourceType === "artifact") {
    // 防御：artifact 类型必须绑定 taskId，否则为数据异常
    if (!taskId) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-danger/30 bg-danger/5 px-2 py-0.5 text-[11px] font-medium text-danger">
          <AlertTriangle className="size-3" />
          数据异常
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-brand/30 bg-brand/5 px-2 py-0.5 text-[11px] font-medium text-brand">
        <Bot className="size-3" />
        AI 生成物
      </span>
    );
  }
  if (!taskId) {
    // 历史数据无 taskId → 来源未知警告
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/5 px-2 py-0.5 text-[11px] font-medium text-warning">
        <AlertTriangle className="size-3" />
        来源未知
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-hint">
      <UserPlus className="size-3" />
      用户上传
    </span>
  );
}

/** 回执 Hash 摘要（前8位） */
function ReceiptHashBadge({ hash }: { hash: string | null }) {
  if (!hash) {
    return (
      <span className="text-hint text-[11px]">—</span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[11px] text-hint">
      <Hash className="size-3" />
      {hash.slice(0, 8)}
    </span>
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
            <FileIcon type={file.type} className="size-6 shrink-0 mt-0.5 text-muted-foreground" />
            <span className="flex-1 leading-snug break-words">
              {file.name}
            </span>
          </SheetTitle>
          <SheetDescription className="flex items-center gap-2 mt-2">
            <FileTypeBadge type={file.type} />
            <span className="text-hint text-xs">{formatFileSize(file.size)}</span>
          </SheetDescription>
        </SheetHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* 来源追踪链路（新增） */}
          <div className="space-y-1.5">
            <p className="text-hint text-[11px] font-medium uppercase tracking-wide">
              来源追踪链路
            </p>
            <div className="bg-accent/40 border border-border rounded-xl p-3 space-y-2.5 text-xs">
              {/* 来源类型 */}
              <div className="flex items-center justify-between">
                <span className="text-hint">来源类型</span>
                <SourceBadge sourceType={file.sourceType} taskId={file.taskId} />
              </div>

              {/* taskId */}
              <div className="flex items-center justify-between">
                <span className="text-hint">任务 ID</span>
                {file.taskId ? (
                  <Link
                    href={`/workspace/runs/${file.workflowRunId || ""}`}
                    className="text-brand-blue hover:underline font-mono text-[11px] flex items-center gap-1"
                  >
                    {file.taskId.slice(0, 12)}…
                    <ExternalLink className="size-3" />
                  </Link>
                ) : (
                  <span className="text-warning flex items-center gap-1">
                    <AlertTriangle className="size-3" />
                    来源未知
                  </span>
                )}
              </div>

              {/* workflowRunId */}
              <div className="flex items-center justify-between">
                <span className="text-hint">工作流运行 ID</span>
                {file.workflowRunId ? (
                  <Link
                    href={`/workspace/runs/${file.workflowRunId}`}
                    className="text-brand-blue hover:underline font-mono text-[11px]"
                  >
                    {file.workflowRunId.slice(0, 12)}…
                  </Link>
                ) : (
                  <span className="text-hint">—</span>
                )}
              </div>

              {/* receiptHash */}
              <div className="flex items-center justify-between">
                <span className="text-hint">执行回执 Hash</span>
                <ReceiptHashBadge hash={file.receiptHash} />
              </div>

              {/* connectorId */}
              <div className="flex items-center justify-between">
                <span className="text-hint">连接器 ID</span>
                {file.connectorId ? (
                  <span className="text-foreground font-mono text-[11px]">
                    {file.connectorId}
                  </span>
                ) : (
                  <span className="text-hint">—</span>
                )}
              </div>
            </div>
          </div>

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
                        {v.operator} · {formatRelativeDay(v.createdAt)}
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

/** 单文件最大 50MB（与服务端 POST /api/files/upload 一致） */
const MAX_FILE_SIZE = 50 * 1024 * 1024;

/** 文件上传 Drawer */
function FileUploadSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [autoParse, setAutoParse] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState<
    { name: string; success: boolean; error?: string }[]
  >([]);
  const [rejectedFiles, setRejectedFiles] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((fileList: FileList | null) => {
    if (!fileList) return;
    const files = Array.from(fileList);
    const oversized: string[] = [];
    const valid: File[] = [];

    for (const f of files) {
      if (f.size > MAX_FILE_SIZE) {
        oversized.push(f.name);
      } else {
        valid.push(f);
      }
    }

    if (oversized.length > 0) {
      setRejectedFiles((prev) => [...prev, ...oversized]);
    }

    if (valid.length > 0) {
      setSelectedFiles((prev) => [
        ...prev,
        ...valid.filter(
          (f) => !prev.some((pf) => pf.name === f.name && pf.size === f.size),
        ),
      ]);
    }
  }, []);

  const handleRemoveFile = useCallback((idx: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleUpload = useCallback(async () => {
    if (selectedFiles.length === 0) return;
    setUploading(true);
    setUploadResults([]);

    const results: { name: string; success: boolean; error?: string }[] = [];

    for (const file of selectedFiles) {
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/files/upload", {
          method: "POST",
          body: formData,
        });
        const json = await res.json();
        if (res.ok && json.success) {
          results.push({ name: file.name, success: true });
        } else {
          results.push({
            name: file.name,
            success: false,
            error: json.error || "上传失败",
          });
        }
      } catch (err) {
        results.push({
          name: file.name,
          success: false,
          error: err instanceof Error ? err.message : "网络错误",
        });
      }
    }

    setUploadResults(results);
    setUploading(false);
    if (results.every((r) => r.success)) {
      // 全部成功：延迟关闭，让用户看到结果
      setTimeout(() => {
        setSelectedFiles([]);
        setUploadResults([]);
        onClose();
      }, 1500);
    }
  }, [selectedFiles, onClose]);

  // 拖拽事件
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      handleFileSelect(e.dataTransfer.files);
    },
    [handleFileSelect],
  );

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
          {/* 隐藏文件 input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files)}
          />

          {/* 拖拽区域 */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-colors",
              isDragOver
                ? "border-brand bg-brand/10"
                : "border-border hover:border-brand/40 hover:bg-accent/50",
            )}
          >
            <div className="bg-brand/10 text-brand flex size-14 items-center justify-center rounded-2xl">
              <Upload className="size-7" />
            </div>
            <div>
              <p className="text-foreground text-sm font-medium">
                拖拽文件到此处或点击选择
              </p>
              <p className="text-hint mt-1 text-xs">
                支持 PDF、Excel、Word、图片、音频、视频，单文件最大 50MB
              </p>
            </div>
          </div>

          {/* 超大文件拒绝提示 */}
          {rejectedFiles.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-danger text-[11px] font-medium uppercase tracking-wide">
                超出大小限制（已跳过 {rejectedFiles.length} 个文件）
              </p>
              <div className="space-y-1">
                {rejectedFiles.map((name, i) => (
                  <div
                    key={i}
                    className="bg-danger/10 text-danger flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs"
                  >
                    <X className="size-3 shrink-0" />
                    <span className="truncate">{name}</span>
                    <span className="shrink-0 text-[10px] opacity-70">超过 50MB</span>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setRejectedFiles([])}
                className="text-hint hover:text-foreground text-[10px] transition-colors"
              >
                清除提示
              </button>
            </div>
          )}

          {/* 已选文件列表 */}
          {selectedFiles.length > 0 && !uploading && uploadResults.length === 0 && (
            <div className="space-y-2">
              <p className="text-hint text-[11px] font-medium uppercase tracking-wide">
                已选文件 ({selectedFiles.length})
              </p>
              <div className="space-y-2">
                {selectedFiles.map((f, i) => {
                  const ext = f.name.split(".").pop()?.toLowerCase() || "";
                  return (
                    <div
                      key={`${f.name}-${f.size}-${i}`}
                      className="border-border bg-accent/40 flex items-center gap-3 rounded-xl border px-3 py-2.5"
                    >
                      <FileIcon type={ext} className="size-5 shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="text-foreground truncate text-sm font-medium">
                          {f.name}
                        </p>
                        <p className="text-hint text-[11px]">
                          {formatFileSize(f.size)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveFile(i)}
                        className="text-hint hover:text-danger transition-colors"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 上传进度 */}
          {uploading && (
            <div className="flex items-center gap-3 py-8 justify-center">
              <Loader2 className="size-5 text-brand animate-spin" />
              <span className="text-muted-foreground text-sm">
                正在上传 {selectedFiles.length} 个文件...
              </span>
            </div>
          )}

          {/* 上传结果 */}
          {uploadResults.length > 0 && (
            <div className="space-y-2">
              <p className="text-hint text-[11px] font-medium uppercase tracking-wide">
                上传结果
              </p>
              <div className="space-y-1.5">
                {uploadResults.map((r, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-3 py-2 text-sm",
                      r.success
                        ? "bg-success/10 text-success"
                        : "bg-danger/10 text-danger",
                    )}
                  >
                    {r.success ? (
                      <CheckCircle2 className="size-4 shrink-0" />
                    ) : (
                      <X className="size-4 shrink-0" />
                    )}
                    <span className="truncate flex-1">{r.name}</span>
                    {r.error && (
                      <span className="text-xs opacity-80">{r.error}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 上传选项（上传前展示） */}
          {!uploading && uploadResults.length === 0 && (
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
          )}
        </div>

        <SheetFooter className="border-border border-t px-5 py-3">
          {uploadResults.length > 0 ? (
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => {
                setSelectedFiles([]);
                setUploadResults([]);
                setRejectedFiles([]);
                onClose();
              }}
            >
              完成
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={selectedFiles.length === 0 || uploading}
              className="w-full gap-2"
              onClick={handleUpload}
            >
              {uploading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  上传中...
                </>
              ) : (
                <>
                  <Upload className="size-4" />
                  开始上传 ({selectedFiles.length} 个文件)
                </>
              )}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
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
  const [taskIdFilter, setTaskIdFilter] = useState("");
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

    // taskId 过滤
    if (taskIdFilter.trim()) {
      const taskQ = taskIdFilter.toLowerCase();
      files = files.filter(
        (f) => f.taskId && f.taskId.toLowerCase().includes(taskQ),
      );
    }

    // 搜索过滤
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      files = files.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.tags.some((t) => t.toLowerCase().includes(q)) ||
          (f.relatedProjectName &&
            f.relatedProjectName.toLowerCase().includes(q)) ||
          (f.receiptHash && f.receiptHash.toLowerCase().includes(q)),
      );
    }

    return files;
  }, [selectedCategory, searchQuery, taskIdFilter]);

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
                placeholder="搜索文件名称、标签、回执 hash..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>

            {/* taskId 过滤器 */}
            <div className="relative w-40">
              <Hash className="text-hint absolute left-3 top-1/2 size-3.5 -translate-y-1/2 pointer-events-none" />
              <Input
                placeholder="按 taskId 过滤…"
                value={taskIdFilter}
                onChange={(e) => setTaskIdFilter(e.target.value)}
                className="pl-8 h-9 text-xs"
              />
              {taskIdFilter && (
                <button
                  type="button"
                  onClick={() => setTaskIdFilter("")}
                  className="text-hint hover:text-foreground absolute right-2 top-1/2 -translate-y-1/2"
                >
                  <X className="size-3" />
                </button>
              )}
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
            ) : (
              <div className="ml-auto flex items-center gap-2">
                {taskIdFilter && (
                  <Badge variant="outline" className="text-[10px] gap-1">
                    <Hash className="size-3" />
                    taskId: {taskIdFilter}
                    <button
                      type="button"
                      onClick={() => setTaskIdFilter("")}
                      className="hover:text-foreground"
                    >
                      <X className="size-2.5" />
                    </button>
                  </Badge>
                )}
              </div>
            )}
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
            <div className="overflow-x-auto">
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
                    <TableHead className="w-16">类型</TableHead>
                    <TableHead className="w-16">大小</TableHead>
                    <TableHead className="w-24">来源</TableHead>
                    <TableHead className="w-28">执行证据</TableHead>
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
                          <FileIcon type={file.type} className="size-5 shrink-0 text-muted-foreground" />
                          <span className="text-foreground truncate text-sm font-medium max-w-[320px]">
                            {file.name}
                          </span>
                        </button>
                      </TableCell>
                      <TableCell>
                        <FileTypeBadge type={file.type} />
                      </TableCell>
                      <TableCell className="text-hint text-sm tabular-nums">
                        {formatFileSize(file.size)}
                      </TableCell>
                      <TableCell>
                        <SourceBadge sourceType={file.sourceType} taskId={file.taskId} />
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {file.taskId ? (
                            <Link
                              href={`/workspace/runs/${file.workflowRunId || ""}`}
                              className="text-brand-blue hover:underline text-[11px] font-mono block truncate max-w-[120px]"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {file.taskId.slice(0, 8)}…
                            </Link>
                          ) : (
                            <span className="text-hint text-[11px]">—</span>
                          )}
                          <ReceiptHashBadge hash={file.receiptHash} />
                        </div>
                      </TableCell>
                      <TableCell>
                        <ParseStatusBadge status={file.parseStatus} />
                      </TableCell>
                      <TableCell className="text-hint text-sm">
                        {formatRelativeDay(file.updatedAt)}
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
                    <FileIcon type={file.type} className="size-8 text-muted-foreground" />
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
                      {formatFileSize(file.size)}
                    </span>
                  </div>

                  <div className="text-hint text-[11px] mb-3">
                    {formatFullDateTime(file.updatedAt)}
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
