"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  X,
  Upload,
  FileArchive,
  FolderTree,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  FileText,
  Download,
  Copy,
  Check,
} from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const NAME_REGEX = /^[a-z0-9-]+$/;

/** 期望的 zip 内目录结构 */
const EXPECTED_STRUCTURE = [
  "SKILL.md         ← 必须：技能定义文件",
  "prompts/          ← 可选：提示词模板",
  "schemas/          ← 可选：输入/输出 Schema",
  "agents/           ← 可选：关联 Agent 定义",
];

interface CreateSkillModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

export function CreateSkillModal({ open, onClose, onCreated }: CreateSkillModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);
  const [copiedTemplate, setCopiedTemplate] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 重置表单
  useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setZipFile(null);
      setSubmitting(false);
      setShowTemplate(false);
      setCopiedTemplate(false);
    }
  }, [open]);

  // 名称校验
  const nameError = name.length > 0 && !NAME_REGEX.test(name)
    ? "只能包含小写字母、数字和连字符（例：inquiry-sorter）"
    : null;

  const canSubmit = name.length > 0 && !nameError && description.trim().length > 0 && zipFile !== null && !submitting;

  // 拖拽处理
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith(".zip")) {
      setZipFile(file);
    }
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setZipFile(file);
  }, []);

  // 提交
  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !zipFile) return;
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("file", zipFile);
      formData.append("name", name);
      formData.append("description", description);
      await apiClient.installSkill(formData);
      toast.success(`技能「${name}」安装成功`);
      onCreated?.();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "安装失败";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, zipFile, name, description, onCreated, onClose]);

  // 生成 SKILL.md 模板
  const generatedSkillMd = useMemo(() => {
    if (!name || !description) return "";
    return `---\nname: ${name}\ndescription: ${description}\nversion: 1.0.0\n---\n\n# ${name}\n\n## Input\n\n## Output\n`;
  }, [name, description]);

  const handleCopyTemplate = useCallback(async () => {
    if (!generatedSkillMd) return;
    try {
      await navigator.clipboard.writeText(generatedSkillMd);
      setCopiedTemplate(true);
      toast.success("已复制 SKILL.md 模板");
      setTimeout(() => setCopiedTemplate(false), 2000);
    } catch {
      toast.error("复制失败");
    }
  }, [generatedSkillMd]);

  const handleDownloadTemplate = useCallback(() => {
    if (!generatedSkillMd) return;
    const blob = new Blob([generatedSkillMd], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "SKILL.md";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("SKILL.md 模板已下载");
  }, [generatedSkillMd]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* 弹窗 */}
      <div className="bg-card border-border relative z-10 w-full max-w-lg rounded-2xl border shadow-2xl animate-in zoom-in-95 duration-200">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-foreground text-base font-semibold">创建自定义技能</h2>
            <p className="text-muted-foreground text-xs mt-0.5">
              上传技能文件夹的 .zip 文件。必须包含带有名称和描述的 SKILL.md 前言。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-accent transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* 表单 */}
        <div className="px-6 py-4 space-y-4">
          {/* 技能名称 */}
          <div className="space-y-1.5">
            <label className="text-foreground text-xs font-medium">
              技能名称 <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="inquiry-sorter"
              className={cn(
                "w-full bg-accent/50 border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors",
                nameError ? "border-danger/50 focus:border-danger" : "border-border focus:border-brand/50",
              )}
              disabled={submitting}
            />
            {nameError ? (
              <p className="flex items-center gap-1 text-danger text-[11px]">
                <AlertTriangle className="size-3 shrink-0" />
                {nameError}
              </p>
            ) : name.length > 0 ? (
              <p className="flex items-center gap-1 text-success text-[11px]">
                <CheckCircle2 className="size-3 shrink-0" />
                格式正确 — 必须与 SKILL.md 前言中的 name 字段匹配
              </p>
            ) : (
              <p className="text-muted-foreground text-[11px]">
                必须与 SKILL.md 前言中的 name 字段匹配
              </p>
            )}
          </div>

          {/* 描述 */}
          <div className="space-y-1.5">
            <label className="text-foreground text-xs font-medium">
              描述 <span className="text-danger">*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="描述该技能的用途、输入与输出…"
              className="w-full bg-accent/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-brand/50 transition-colors resize-none h-24"
              disabled={submitting}
              maxLength={2000}
            />
            <span className="text-hint text-[10px] text-right block">
              {description.length} / 2000
            </span>
          </div>

          {/* zip 拖拽区 */}
          <div className="space-y-1.5">
            <label className="text-foreground text-xs font-medium">
              上传 .zip <span className="text-danger">*</span>
            </label>
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={cn(
                "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors",
                isDragOver
                  ? "border-brand bg-brand/5"
                  : zipFile
                    ? "border-success/50 bg-success/5"
                    : "border-border hover:border-brand/50 hover:bg-accent/30",
              )}
            >
              {zipFile ? (
                <div className="flex flex-col items-center gap-2">
                  <FileArchive className="size-8 text-success" />
                  <span className="text-sm font-medium text-foreground">{zipFile.name}</span>
                  <span className="text-hint text-xs">
                    {(zipFile.size / 1024).toFixed(1)} KB
                  </span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setZipFile(null); }}
                    className="text-muted-foreground hover:text-danger text-xs underline mt-1"
                    disabled={submitting}
                  >
                    移除
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="size-8 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    拖拽 .zip 文件到此处，或<span className="text-brand underline ml-1">点击选择</span>
                  </span>
                  <span className="text-hint text-[11px]">仅支持 .zip 格式</span>
                </div>
              )}
              <input
                ref={inputRef}
                type="file"
                accept=".zip"
                onChange={handleFileChange}
                className="hidden"
                disabled={submitting}
              />
            </div>
          </div>

          {/* 期望目录结构预览 */}
          <div className="bg-accent/20 border border-border rounded-xl p-3 space-y-1.5">
            <div className="flex items-center gap-1.5 text-foreground text-xs font-medium mb-1">
              <FolderTree className="size-3.5" />
              期望目录结构
            </div>
            {EXPECTED_STRUCTURE.map((line) => (
              <div
                key={line}
                className="text-muted-foreground text-[11px] font-mono pl-4"
              >
                {line}
              </div>
            ))}
          </div>

          {/* 生成 SKILL.md 模板 */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setShowTemplate((s) => !s)}
              disabled={!name || !description}
              className={cn(
                "w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium rounded-lg border transition-colors",
                !name || !description
                  ? "border-border text-muted-foreground cursor-not-allowed"
                  : "border-brand/30 text-brand hover:bg-brand/5",
              )}
            >
              <FileText className="size-3.5" />
              {showTemplate ? "隐藏 SKILL.md 模板" : "生成 SKILL.md 模板"}
            </button>

            {showTemplate && generatedSkillMd && (
              <div className="border border-border rounded-xl overflow-hidden bg-black/30">
                <div className="flex items-center justify-between px-3 py-2 border-b border-border/40 bg-accent/20">
                  <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
                    <FileText className="size-3.5 text-brand" />
                    SKILL.md 预览
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopyTemplate}
                      className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {copiedTemplate ? <Check className="size-3" /> : <Copy className="size-3" />}
                      {copiedTemplate ? "已复制" : "复制"}
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadTemplate}
                      className="inline-flex items-center gap-1 text-[10px] font-medium text-brand hover:text-brand/80 transition-colors"
                    >
                      <Download className="size-3" />
                      下载
                    </button>
                  </div>
                </div>
                <pre className="p-3 text-[11px] font-mono text-muted-foreground leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
                  {generatedSkillMd}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground rounded-lg border border-border hover:bg-accent transition-colors"
            disabled={submitting}
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={cn(
              "inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors",
              canSubmit
                ? "bg-brand text-white hover:bg-brand/90"
                : "bg-muted text-hint cursor-not-allowed",
            )}
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
            {submitting ? "上传中…" : "上传并创建"}
          </button>
        </div>
      </div>
    </div>
  );
}
