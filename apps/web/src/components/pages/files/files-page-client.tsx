"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Search, Upload, List, Grid3X3, Trash2, Move, Tag, Download,
  Eye, MoreHorizontal, X, FolderOpen, FileText, User, ImageIcon,
  Video, Mic, Package, DollarSign, ScrollText, Archive, Files,
  Loader2, CheckCircle2, RefreshCw, AlertTriangle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { cn, formatFileSize } from "@/lib/utils";
import { formatRelativeDay, formatFullDateTime } from "@/lib/date-utils";
import type { FileItem, FileParseStatus, VectorIndexStatus } from "@/types";

// ─── 类型 ────────────────────────────────────────────────────────────────────

interface ProjectOption { id: string; name: string }

// ─── 文件图标 ─────────────────────────────────────────────────────────────────

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

// ─── 分类定义 ─────────────────────────────────────────────────────────────────

interface FileCategoryDef {
  key: string;
  label: string;
  icon: LucideIcon;
  category: FileItem["category"] | null;
}

const fileCategories: FileCategoryDef[] = [
  { key: "all",      label: "全部文件", icon: Files,     category: null },
  { key: "customer", label: "客户资料", icon: User,      category: "customer" },
  { key: "product",  label: "产品资料", icon: Package,   category: "product" },
  { key: "quotation",label: "报价单",   icon: DollarSign,category: "quotation" },
  { key: "contract", label: "合同",     icon: ScrollText,category: "contract" },
  { key: "image",    label: "图像",     icon: ImageIcon, category: "image" },
  { key: "video",    label: "视频",     icon: Video,     category: "video" },
  { key: "audio",    label: "语音",     icon: Mic,       category: "audio" },
  { key: "archive",  label: "归档文件", icon: Archive,   category: "archive" },
];

// ─── 分类树 ───────────────────────────────────────────────────────────────────

function FileCategoryTree({
  selected, onSelect, counts,
}: {
  selected: string;
  onSelect: (key: string) => void;
  counts: Record<string, number>;
}) {
  return (
    <aside className="w-52 shrink-0 flex flex-col border-border border-r bg-sidebar/60">
      <div className="px-5 pt-5 pb-3">
        <h2 className="text-foreground text-lg font-semibold tracking-tight">文件</h2>
      </div>
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
                <Badge variant="secondary" className="bg-card text-hint shrink-0 h-5 px-1.5 text-[10px] font-medium tabular-nums">
                  {counts[cat.key]}
                </Badge>
              )}
            </button>
          );
        })}
      </nav>
      <div className="px-3 pb-4 pt-2">
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground">
          <FolderOpen className="size-4" />
          新建文件夹
        </Button>
      </div>
    </aside>
  );
}

// ─── 状态 Badge ───────────────────────────────────────────────────────────────

function ParseStatusBadge({ status }: { status: FileParseStatus }) {
  const config: Record<FileParseStatus, { label: string; className: string; showDot: boolean }> = {
    parsed:   { label: "已解析", className: "bg-success/10 text-success border-success/20",   showDot: true },
    parsing:  { label: "解析中", className: "bg-warning/10 text-warning border-warning/20",   showDot: true },
    unparsed: { label: "未解析", className: "bg-muted text-hint border-border",               showDot: false },
    failed:   { label: "失败",   className: "bg-danger/10 text-danger border-danger/20",      showDot: true },
  };
  const c = config[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium", c.className)}>
      {c.showDot ? (
        <span className={cn("size-1.5 rounded-full",
          status === "parsed"  && "bg-success",
          status === "parsing" && "bg-warning animate-pulse",
          status === "failed"  && "bg-danger",
        )} />
      ) : null}
      {c.label}
    </span>
  );
}

function FileTypeBadge({ type }: { type: string }) {
  return <Badge variant="outline" className="text-[11px] font-mono uppercase text-hint">{type}</Badge>;
}

function VectorIndexBadge({ status }: { status: VectorIndexStatus }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
      status === "indexed" ? "bg-success/10 text-success border-success/20" : "bg-muted text-hint border-border",
    )}>
      <span className={cn("size-1.5 rounded-full", status === "indexed" ? "bg-success" : "bg-border")} />
      {status === "indexed" ? "已索引" : "未索引"}
    </span>
  );
}

// ─── 文件详情 Drawer ──────────────────────────────────────────────────────────

function FileDetailDrawer({
  file, open, onClose, onDelete, onTagsChange,
}: {
  file: FileItem | null;
  open: boolean;
  onClose: () => void;
  onDelete: (id: string) => void;
  onTagsChange: (id: string, tags: string[]) => void;
}) {
  const router = useRouter();
  const [newTag, setNewTag] = useState("");
  const [editingTags, setEditingTags] = useState(false);

  useEffect(() => { if (!open) { setNewTag(""); setEditingTags(false); } }, [open]);

  if (!file) return null;

  const handleAddTag = async () => {
    const tag = newTag.trim();
    if (!tag || file.tags.includes(tag)) return;
    const nextTags = [...file.tags, tag];
    try {
      const res = await fetch(`/api/files/${file.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: nextTags }),
      });
      if (res.ok) { onTagsChange(file.id, nextTags); setNewTag(""); }
    } catch { /* 静默 */ }
  };

  const handleRemoveTag = async (tag: string) => {
    const nextTags = file.tags.filter((t) => t !== tag);
    try {
      const res = await fetch(`/api/files/${file.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: nextTags }),
      });
      if (res.ok) onTagsChange(file.id, nextTags);
    } catch { /* 静默 */ }
  };

  const handleDownload = () => {
    window.open(`/api/files/${file.id}/download`, "_blank");
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-[480px] sm:max-w-[480px] flex flex-col p-0" showCloseButton>
        <SheetHeader className="border-border border-b px-5 py-4">
          <SheetTitle className="flex items-start gap-3 text-base">
            <FileIcon type={file.type} className="size-6 shrink-0 mt-0.5 text-muted-foreground" />
            <span className="flex-1 leading-snug break-words">{file.name}</span>
          </SheetTitle>
          <SheetDescription className="flex items-center gap-2 mt-2">
            <FileTypeBadge type={file.type} />
            <span className="text-hint text-xs">{formatFileSize(file.size)}</span>
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* 解析状态 */}
          <div className="space-y-1.5">
            <p className="text-hint text-[11px] font-medium uppercase tracking-wide">解析状态</p>
            <div className="flex items-center gap-3">
              <ParseStatusBadge status={file.parseStatus} />
              <VectorIndexBadge status={file.vectorIndexStatus} />
            </div>
          </div>

          {/* 解析摘要 */}
          {file.parseSummary ? (
            <div className="space-y-1.5">
              <p className="text-hint text-[11px] font-medium uppercase tracking-wide">解析摘要</p>
              <div className="bg-accent/50 text-muted-foreground rounded-xl border border-border px-4 py-3 text-xs leading-relaxed">
                {file.parseSummary}
              </div>
            </div>
          ) : null}

          {/* 关联项目 */}
          {file.relatedProjectName ? (
            <div className="space-y-1.5">
              <p className="text-hint text-[11px] font-medium uppercase tracking-wide">关联项目</p>
              <button type="button" onClick={() => router.push(`/projects/${file.relatedProjectId}`)}
                className="text-sm text-brand-blue hover:underline">
                {file.relatedProjectName}
              </button>
            </div>
          ) : null}

          {/* 标签 */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-hint text-[11px] font-medium uppercase tracking-wide">标签</p>
              <button type="button" onClick={() => setEditingTags(!editingTags)}
                className="text-brand text-[11px] hover:text-brand/80 transition-colors">
                {editingTags ? "完成" : "+添加"}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {file.tags.map((tag) => (
                <span key={tag} className="bg-accent/80 text-muted-foreground inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[11px]">
                  {tag}
                  {editingTags && (
                    <button type="button" onClick={() => handleRemoveTag(tag)} className="hover:text-danger transition-colors">
                      <X className="size-2.5" />
                    </button>
                  )}
                </span>
              ))}
            </div>
            {editingTags && (
              <div className="flex items-center gap-2 mt-2">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
                  placeholder="输入标签后按 Enter"
                  className="h-7 text-xs"
                />
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleAddTag}>添加</Button>
              </div>
            )}
          </div>

          {/* 版本历史 */}
          {file.versions.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-hint text-[11px] font-medium uppercase tracking-wide">版本历史</p>
              <div className="space-y-2">
                {file.versions.map((v, i) => (
                  <div key={v.id} className="flex items-start gap-3 text-xs">
                    <div className="flex flex-col items-center pt-1.5">
                      <div className={cn("size-2 rounded-full border-2", i === 0 ? "border-brand bg-brand" : "border-border bg-transparent")} />
                      {i < file.versions.length - 1 ? <div className="bg-border w-px h-full min-h-[12px]" /> : null}
                    </div>
                    <div className="flex-1 min-w-0 pb-2">
                      <p className="text-foreground truncate text-xs font-medium">{v.fileName}</p>
                      <p className="text-hint mt-0.5 text-[10px]">
                        {v.operator} · {formatRelativeDay(v.createdAt)}{v.note ? ` · ${v.note}` : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <SheetFooter className="border-border border-t px-5 py-3 flex-row gap-2">
          <Button size="sm" className="flex-1 gap-2" onClick={handleDownload}>
            <Download className="size-4" />下载
          </Button>
          <Button size="sm" variant="outline" className="gap-2 text-danger hover:text-danger"
            onClick={() => { onClose(); onDelete(file.id); }}>
            <Trash2 className="size-4" />删除
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ─── 删除确认弹窗 ─────────────────────────────────────────────────────────────

function DeleteConfirmDialog({
  open, count, onConfirm, onCancel,
}: {
  open: boolean;
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-danger" />
            确认删除{count > 1 ? ` ${count} 个文件` : "文件"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {count > 1
              ? `将删除选中的 ${count} 个文件。删除后文件将从列表中移除，但可在系统审计记录中追溯。`
              : "文件删除后将从列表中移除，但可在系统审计记录中追溯。"}
            此操作无法撤销。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>取消</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-danger hover:bg-danger/90">
            确认删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── 单文件最大 50MB ──────────────────────────────────────────────────────────

const MAX_FILE_SIZE = 50 * 1024 * 1024;

// ─── 文件上传 Sheet ───────────────────────────────────────────────────────────

function FileUploadSheet({
  open, onClose, onSuccess, projects,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  projects: ProjectOption[];
}) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [autoParse, setAutoParse] = useState(true);
  const [projectId, setProjectId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState<{ name: string; success: boolean; error?: string }[]>([]);
  const [rejectedFiles, setRejectedFiles] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((fileList: FileList | null) => {
    if (!fileList) return;
    const files = Array.from(fileList);
    const oversized: string[] = [];
    const valid: File[] = [];
    for (const f of files) {
      if (f.size > MAX_FILE_SIZE) oversized.push(f.name);
      else valid.push(f);
    }
    if (oversized.length > 0) setRejectedFiles((prev) => [...prev, ...oversized]);
    if (valid.length > 0) {
      setSelectedFiles((prev) => [...prev, ...valid.filter((f) => !prev.some((pf) => pf.name === f.name && pf.size === f.size))]);
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
        formData.append("autoParse", String(autoParse));
        if (projectId) formData.append("projectId", projectId);
        const res = await fetch("/api/files/upload", { method: "POST", body: formData });
        const json = await res.json();
        if (res.ok && json.success) results.push({ name: file.name, success: true });
        else results.push({ name: file.name, success: false, error: json.error || "上传失败" });
      } catch (err) {
        results.push({ name: file.name, success: false, error: err instanceof Error ? err.message : "网络错误" });
      }
    }

    setUploadResults(results);
    setUploading(false);
    if (results.some((r) => r.success)) {
      onSuccess(); // 只要有成功就刷新列表
    }
    if (results.every((r) => r.success)) {
      setTimeout(() => { setSelectedFiles([]); setUploadResults([]); onClose(); }, 1500);
    }
  }, [selectedFiles, autoParse, projectId, onClose, onSuccess]);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragOver(false); }, []);
  const handleDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragOver(false); handleFileSelect(e.dataTransfer.files); }, [handleFileSelect]);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-[480px] sm:max-w-[480px] flex flex-col p-0" showCloseButton>
        <SheetHeader className="border-border border-b px-5 py-4">
          <SheetTitle>上传文件</SheetTitle>
          <SheetDescription>将文件上传到知识库，支持自动解析与向量索引</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => handleFileSelect(e.target.files)} />

          {/* 拖拽区域 */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-colors",
              isDragOver ? "border-brand bg-brand/10" : "border-border hover:border-brand/40 hover:bg-accent/50",
            )}
          >
            <div className="bg-brand/10 text-brand flex size-14 items-center justify-center rounded-2xl">
              <Upload className="size-7" />
            </div>
            <div>
              <p className="text-foreground text-sm font-medium">拖拽文件到此处或点击选择</p>
              <p className="text-hint mt-1 text-xs">支持 PDF、Excel、Word、图片、音频、视频，单文件最大 50MB</p>
            </div>
          </div>

          {/* 超大文件提示 */}
          {rejectedFiles.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-danger text-[11px] font-medium uppercase tracking-wide">超出大小限制（已跳过 {rejectedFiles.length} 个文件）</p>
              <div className="space-y-1">
                {rejectedFiles.map((name, i) => (
                  <div key={i} className="bg-danger/10 text-danger flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs">
                    <X className="size-3 shrink-0" /><span className="truncate">{name}</span><span className="shrink-0 text-[10px] opacity-70">超过 50MB</span>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => setRejectedFiles([])} className="text-hint hover:text-foreground text-[10px] transition-colors">清除提示</button>
            </div>
          )}

          {/* 已选文件列表 */}
          {selectedFiles.length > 0 && !uploading && uploadResults.length === 0 && (
            <div className="space-y-2">
              <p className="text-hint text-[11px] font-medium uppercase tracking-wide">已选文件 ({selectedFiles.length})</p>
              <div className="space-y-2">
                {selectedFiles.map((f, i) => {
                  const ext = f.name.split(".").pop()?.toLowerCase() || "";
                  return (
                    <div key={`${f.name}-${f.size}-${i}`} className="border-border bg-accent/40 flex items-center gap-3 rounded-xl border px-3 py-2.5">
                      <FileIcon type={ext} className="size-5 shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="text-foreground truncate text-sm font-medium">{f.name}</p>
                        <p className="text-hint text-[11px]">{formatFileSize(f.size)}</p>
                      </div>
                      <button type="button" onClick={() => handleRemoveFile(i)} className="text-hint hover:text-danger transition-colors">
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
              <span className="text-muted-foreground text-sm">正在上传 {selectedFiles.length} 个文件...</span>
            </div>
          )}

          {/* 上传结果 */}
          {uploadResults.length > 0 && (
            <div className="space-y-2">
              <p className="text-hint text-[11px] font-medium uppercase tracking-wide">上传结果</p>
              <div className="space-y-1.5">
                {uploadResults.map((r, i) => (
                  <div key={i} className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-sm", r.success ? "bg-success/10 text-success" : "bg-danger/10 text-danger")}>
                    {r.success ? <CheckCircle2 className="size-4 shrink-0" /> : <X className="size-4 shrink-0" />}
                    <span className="truncate flex-1">{r.name}</span>
                    {r.error && <span className="text-xs opacity-80">{r.error}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 上传选项 */}
          {!uploading && uploadResults.length === 0 && (
            <div className="space-y-3">
              <p className="text-hint text-[11px] font-medium uppercase tracking-wide">上传选项</p>

              {/* 自动解析开关 */}
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <p className="text-foreground text-sm">上传后自动解析</p>
                  <p className="text-hint text-[11px]">AI 将自动提取文本、图像、表格等结构化信息</p>
                </div>
                <button type="button" role="switch" aria-checked={autoParse} onClick={() => setAutoParse(!autoParse)}
                  className={cn("relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors", autoParse ? "bg-primary" : "bg-muted border-border")}>
                  <span className={cn("bg-background pointer-events-none inline-block size-3.5 rounded-full shadow ring-0 transition-transform", autoParse ? "translate-x-4" : "translate-x-0.5")} />
                </button>
              </label>

              {/* 关联项目（真实API） */}
              <div className="space-y-1.5">
                <p className="text-foreground text-sm">关联到项目</p>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="border-border bg-accent/40 text-foreground w-full rounded-lg border px-3 py-2 text-sm outline-none focus-visible:border-ring"
                >
                  <option value="">不关联</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        <SheetFooter className="border-border border-t px-5 py-3">
          {uploadResults.length > 0 ? (
            <Button size="sm" variant="outline" className="w-full" onClick={() => { setSelectedFiles([]); setUploadResults([]); setRejectedFiles([]); onClose(); }}>完成</Button>
          ) : (
            <Button size="sm" disabled={selectedFiles.length === 0 || uploading} className="w-full gap-2" onClick={handleUpload}>
              {uploading ? (<><Loader2 className="size-4 animate-spin" />上传中...</>) : (<><Upload className="size-4" />开始上传 ({selectedFiles.length} 个文件)</>)}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ─── 自定义 Hooks ─────────────────────────────────────────────────────────────

function useFiles(category: string, query: string) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (category && category !== "all") params.set("category", category);
      if (query.trim()) params.set("q", query.trim());
      params.set("limit", "100");
      const res = await fetch(`/api/files?${params}`);
      const json = await res.json();
      if (res.ok && json.success) {
        setFiles(json.data.files as FileItem[]);
        setTotal(json.data.total as number);
      } else {
        setError(json.error || "加载失败");
      }
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  }, [category, query]);

  useEffect(() => { void fetchFiles(); }, [fetchFiles]);

  return { files, loading, error, total, refresh: fetchFiles };
}

function useProjects() {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  useEffect(() => {
    fetch("/api/projects?limit=100")
      .then((r) => r.json())
      .then((j) => { if (j.success) setProjects((j.data.projects as { id: string; name: string }[]).map((p) => ({ id: p.id, name: p.name }))); })
      .catch(() => {});
  }, []);
  return projects;
}

// ─── 主组件 ───────────────────────────────────────────────────────────────────

export function FilesPageClient() {
  const router = useRouter();

  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "card">("table");
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [detailFileId, setDetailFileId] = useState<string | null>(null);
  const [showUploadSheet, setShowUploadSheet] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string[] | null>(null); // 待删除 ID 列表

  // 搜索防抖
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const { files, loading, error, refresh } = useFiles(selectedCategory, debouncedQuery);
  const projects = useProjects();

  // 分类计数（全部基于 API 返回的当前列表）
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    counts["all"] = files.length;
    for (const cat of fileCategories) {
      if (cat.category === null) continue;
      counts[cat.key] = files.filter((f) => f.category === cat.category).length;
    }
    return counts;
  }, [files]);

  const detailFile = useMemo(
    () => files.find((f) => f.id === detailFileId) || null,
    [files, detailFileId],
  );

  const allSelected = files.length > 0 && files.every((f) => selectedFileIds.has(f.id));

  const toggleSelectAll = useCallback(() => {
    if (allSelected) setSelectedFileIds(new Set());
    else setSelectedFileIds(new Set(files.map((f) => f.id)));
  }, [allSelected, files]);

  const toggleSelectFile = useCallback((id: string) => {
    setSelectedFileIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }, []);

  const handleOpenDetail = useCallback((id: string) => setDetailFileId(id), []);

  // ── 删除逻辑 ──────────────────────────────────────────────────────────────

  const confirmDelete = useCallback((ids: string[]) => setDeleteTarget(ids), []);

  const executeDelete = useCallback(async () => {
    if (!deleteTarget || deleteTarget.length === 0) return;
    try {
      await Promise.all(
        deleteTarget.map((id) => fetch(`/api/files/${id}`, { method: "DELETE" }))
      );
    } catch { /* 单条失败不中断其他 */ }
    setDeleteTarget(null);
    setSelectedFileIds(new Set());
    setDetailFileId(null);
    void refresh();
  }, [deleteTarget, refresh]);

  // ── 下载逻辑 ─────────────────────────────────────────────────────────────

  const handleDownload = useCallback((id: string) => {
    window.open(`/api/files/${id}/download`, "_blank");
  }, []);

  // ── 标签更新（由 Drawer 回调） ────────────────────────────────────────────

  const handleTagsChange = useCallback((_id: string, _tags: string[]) => {
    void refresh(); // 重新拉取最新列表
  }, [refresh]);

  const batchCount = selectedFileIds.size;

  // ── 渲染 ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full">
      {/* 左侧分类树 */}
      <FileCategoryTree selected={selectedCategory} onSelect={setSelectedCategory} counts={categoryCounts} />

      {/* 右侧主区域 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 顶部页头 */}
        <div className="border-border border-b px-6 py-4">
          <PageHeader title="文件" description="企业内容供给链：分类、解析、标签、向量索引与版本控制" />

          {/* 工具栏 */}
          <div className="flex items-center gap-3 mt-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="text-hint absolute left-3 top-1/2 size-4 -translate-y-1/2 pointer-events-none" />
              <Input
                placeholder="搜索文件名称、标签或解析摘要..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>

            <Button size="sm" className="gap-2" onClick={() => setShowUploadSheet(true)}>
              <Upload className="size-4" />上传文件
            </Button>

            <Button size="sm" variant="ghost" className="gap-2 text-hint" onClick={() => void refresh()}>
              <RefreshCw className="size-4" />
            </Button>

            {/* 视图切换 */}
            <div className="bg-accent/50 flex items-center rounded-lg border border-border p-0.5">
              <button type="button" onClick={() => setViewMode("table")}
                className={cn("flex items-center justify-center size-8 rounded-md transition-colors", viewMode === "table" ? "bg-card text-foreground shadow-sm" : "text-hint hover:text-foreground")}
                aria-label="表格视图"><List className="size-4" />
              </button>
              <button type="button" onClick={() => setViewMode("card")}
                className={cn("flex items-center justify-center size-8 rounded-md transition-colors", viewMode === "card" ? "bg-card text-foreground shadow-sm" : "text-hint hover:text-foreground")}
                aria-label="卡片视图"><Grid3X3 className="size-4" />
              </button>
            </div>

            {/* 批量操作 */}
            {batchCount > 0 && (
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-hint text-xs">已选 {batchCount} 项</span>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8">
                  <Tag className="size-3.5" />打标签
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8">
                  <Move className="size-3.5" />移动
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8 text-danger hover:text-danger"
                  onClick={() => confirmDelete(Array.from(selectedFileIds))}>
                  <Trash2 className="size-3.5" />删除
                </Button>
                <button type="button" onClick={() => setSelectedFileIds(new Set())} className="text-hint hover:text-foreground transition-colors">
                  <X className="size-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-auto p-6">
          <div className="mb-4">
            <h3 className="text-foreground text-sm font-semibold">
              {fileCategories.find((c) => c.key === selectedCategory)?.label}
              <span className="text-hint ml-2 text-xs font-normal">{files.length} 个项目</span>
            </h3>
          </div>

          {/* 加载态 */}
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-card rounded-xl border border-border p-3 h-[52px] animate-pulse" />
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <AlertTriangle className="size-8 text-danger" />
              <p className="text-foreground text-sm font-medium">{error}</p>
              <Button size="sm" variant="outline" onClick={() => void refresh()}>重试</Button>
            </div>
          ) : files.length === 0 ? (
            <EmptyState icon={FileText} title="没有找到文件" description="尝试调整搜索条件或点击右上角上传文件" />
          ) : viewMode === "table" ? (
            /* 表格视图 */
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-10">
                      <Checkbox checked={allSelected} aria-label="全选" onCheckedChange={() => toggleSelectAll()} />
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
                  {files.map((file) => (
                    <TableRow key={file.id} className={cn("group", selectedFileIds.has(file.id) && "bg-accent/30")}>
                      <TableCell>
                        <Checkbox checked={selectedFileIds.has(file.id)} onCheckedChange={() => toggleSelectFile(file.id)} aria-label={`选择 ${file.name}`} />
                      </TableCell>
                      <TableCell>
                        <button type="button" onClick={() => handleOpenDetail(file.id)} className="flex items-center gap-2.5 hover:opacity-80 transition-opacity text-left">
                          <FileIcon type={file.type} className="size-5 shrink-0 text-muted-foreground" />
                          <span className="text-foreground truncate text-sm font-medium max-w-[320px]">{file.name}</span>
                        </button>
                      </TableCell>
                      <TableCell><FileTypeBadge type={file.type} /></TableCell>
                      <TableCell className="text-hint text-sm tabular-nums">{formatFileSize(file.size)}</TableCell>
                      <TableCell>
                        {file.relatedProjectName ? (
                          <button type="button"
                            onClick={(e) => { e.stopPropagation(); router.push(`/projects/${file.relatedProjectId}`); }}
                            className="text-brand-blue hover:underline text-sm truncate max-w-[140px] block text-left">
                            {file.relatedProjectName}
                          </button>
                        ) : <span className="text-hint text-sm">—</span>}
                      </TableCell>
                      <TableCell><ParseStatusBadge status={file.parseStatus} /></TableCell>
                      <TableCell className="text-hint text-sm">{formatRelativeDay(file.updatedAt)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button type="button" onClick={() => handleOpenDetail(file.id)} className="text-hint hover:text-foreground p-1 transition-colors" title="预览">
                            <Eye className="size-3.5" />
                          </button>
                          <button type="button" onClick={() => handleDownload(file.id)} className="text-hint hover:text-foreground p-1 transition-colors" title="下载">
                            <Download className="size-3.5" />
                          </button>
                          <DropdownMenu>
                            <DropdownMenuTrigger className="text-hint hover:text-foreground p-1 transition-colors">
                              <MoreHorizontal className="size-3.5" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-32">
                              <DropdownMenuItem onClick={() => handleOpenDetail(file.id)}><Eye className="size-3.5" />预览</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDownload(file.id)}><Download className="size-3.5" />下载</DropdownMenuItem>
                              <DropdownMenuItem variant="destructive" onClick={() => confirmDelete([file.id])}><Trash2 className="size-3.5" />删除</DropdownMenuItem>
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
            /* 卡片视图 */
            <div className="grid grid-cols-4 gap-4">
              {files.map((file) => (
                <div
                  key={file.id}
                  onClick={() => handleOpenDetail(file.id)}
                  className={cn("border-border bg-card hover:border-brand/30 hover:bg-accent/30 group relative cursor-pointer rounded-2xl border p-4 transition-all", selectedFileIds.has(file.id) && "border-brand/50 bg-accent/20")}
                >
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
                  <p className="text-foreground text-sm font-medium leading-snug line-clamp-1 mb-2">{file.name}</p>
                  <div className="flex items-center gap-2 mb-3">
                    <FileTypeBadge type={file.type} />
                    <span className="text-hint text-[11px]">{formatFileSize(file.size)}</span>
                  </div>
                  <div className="text-hint text-[11px] mb-3">{formatFullDateTime(file.updatedAt)}</div>
                  <div className="flex items-center justify-between">
                    <ParseStatusBadge status={file.parseStatus} />
                    <DropdownMenu>
                      <DropdownMenuTrigger onClick={(e) => e.stopPropagation()} className="text-hint hover:text-foreground p-1 transition-colors opacity-0 group-hover:opacity-100">
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-32">
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleOpenDetail(file.id); }}><Eye className="size-3.5" />预览</DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDownload(file.id); }}><Download className="size-3.5" />下载</DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onClick={(e) => { e.stopPropagation(); confirmDelete([file.id]); }}><Trash2 className="size-3.5" />删除</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 文件详情 Drawer */}
      <FileDetailDrawer
        file={detailFile}
        open={detailFileId !== null}
        onClose={() => setDetailFileId(null)}
        onDelete={(id) => confirmDelete([id])}
        onTagsChange={handleTagsChange}
      />

      {/* 文件上传 Sheet */}
      <FileUploadSheet
        open={showUploadSheet}
        onClose={() => setShowUploadSheet(false)}
        onSuccess={() => void refresh()}
        projects={projects}
      />

      {/* 删除确认弹窗 */}
      <DeleteConfirmDialog
        open={deleteTarget !== null}
        count={deleteTarget?.length ?? 0}
        onConfirm={() => void executeDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
