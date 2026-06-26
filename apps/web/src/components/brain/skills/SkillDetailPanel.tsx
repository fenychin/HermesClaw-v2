"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import {
  Puzzle,
  Play,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Eye,
  Edit3,
  Trash2,
  Save,
  X,
  FileText,
  Code2,
  Check,
  Copy,
  Activity,
} from "lucide-react";
import { StatusBadge } from "@/components/common/status-badge";
import { AutomationLevelBadge } from "@/components/common/agent-status-badge";
import { apiClient } from "@/lib/api-client";
import type { Skill, SkillSource } from "@/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { MarkdownRenderer } from "@/components/common/markdown-renderer";

type ValidationLevel = "error" | "warning" | "suggestion";

interface LocalValidationMessage {
  level: ValidationLevel;
  message: string;
}

interface LocalValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
  items: LocalValidationMessage[];
}

/** 客户端安全的 SKILL.md frontmatter 校验（与 SDK skill-validator 逻辑一致，但无 fs 依赖） */
function validateSkillMdLocally(content: string): LocalValidationResult {
  const items: LocalValidationMessage[] = [];
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const fm: Record<string, any> = {};
  if (fmMatch) {
    for (const line of fmMatch[1].split(/\r?\n/)) {
      const kv = line.match(/^([\w-]+):\s*(.*)$/);
      if (kv) fm[kv[1]] = kv[2].trim();
    }
  }

  const name = fm["name"];
  const description = fm["description"];
  const version = fm["version"];
  const tools = content.includes("tools:") ? fm["tools"] : undefined;

  // error: name
  if (!name) items.push({ level: "error", message: "缺少必填字段 name（技能名称）" });
  else if (!/^[a-z0-9-]+$/.test(name)) items.push({ level: "error", message: `技能名称 "${name}" 不合法：只能包含小写字母、数字和连字符（例：inquiry-sorter）` });

  // error: description
  if (!description || description.trim().length === 0) items.push({ level: "error", message: "缺少必填字段 description（技能描述）" });
  else if (description.trim().length < 10) items.push({ level: "suggestion", message: `描述过短（${description.trim().length} 字符），建议至少 10 字符` });

  // warning: version
  if (!version || version.trim().length === 0) {
    items.push({ level: "warning", message: "建议添加 version 字段声明技能版本（例如：version: 1.0.0）" });
  }

  // warning: tools 格式
  if (tools !== undefined && tools !== null) {
    try {
      const parsed = typeof tools === "string" ? JSON.parse(tools) : tools;
      if (!Array.isArray(parsed)) {
        items.push({ level: "warning", message: "tools 字段必须为数组格式" });
      }
    } catch {
      items.push({ level: "warning", message: "tools 字段格式无法解析，必须为数组" });
    }
  }

  const errors = items.filter((i) => i.level === "error").map((i) => i.message);
  const warnings = items.filter((i) => i.level === "warning").map((i) => i.message);
  const suggestions = items.filter((i) => i.level === "suggestion").map((i) => i.message);

  return { valid: errors.length === 0, errors, warnings, suggestions, items };
}

/** 来源中文标签 */
const SOURCE_LABEL: Record<SkillSource, string> = {
  BUILTIN: "内置",
  CUSTOM: "自定义",
  EXTERNAL: "外部安装",
};

/** 测试结果 JSON 展示 Modal */
interface TestResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: any;
  skillName: string;
}

function TestResultModal({ isOpen, onClose, result, skillName }: TestResultModalProps) {
  const [copied, setCopied] = useState(false);
  if (!isOpen || !result) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    setCopied(true);
    toast.success("已复制到剪贴板");
    setTimeout(() => setCopied(false), 2000);
  };

  const isSuccess = result.ok || result.success !== false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-card border border-border w-full max-w-2xl rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Modal 头部 */}
        <div className="px-6 py-4 border-b border-border/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={cn(
              "p-1 rounded-full shrink-0",
              isSuccess ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
            )}>
              {isSuccess ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}
            </span>
            <h3 className="font-semibold text-foreground">
              技能「{skillName}」测试报告
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Modal 内容 */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground bg-accent/40 px-3 py-2 rounded-lg">
            <span>状态: <strong className={isSuccess ? "text-success" : "text-danger"}>{isSuccess ? "测试成功" : "测试失败"}</strong></span>
            <span>执行时间: {new Date().toLocaleTimeString()}</span>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-muted-foreground text-[10px] font-bold uppercase tracking-wide">
                JSON 输出载荷
              </label>
              <button
                type="button"
                onClick={handleCopy}
                className="text-[10px] text-brand hover:underline font-semibold flex items-center gap-1"
              >
                {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                {copied ? "已复制" : "复制完整 JSON"}
              </button>
            </div>
            <pre className="bg-black/40 text-foreground font-mono text-xs p-4 rounded-xl overflow-auto max-h-[50vh] border border-white/5 leading-relaxed whitespace-pre-wrap">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        </div>

        {/* Modal 底部 */}
        <div className="px-6 py-4 border-t border-border/60 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="bg-brand text-white text-xs font-semibold rounded-lg px-4 py-2 hover:bg-brand/90 transition-colors"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
}

interface SkillDetailPanelProps {
  skill: Skill;
  selectedFilePath: string | null;
  onSkillUpdated?: (updated: Skill) => void;
  onSkillDeleted?: (skillId: string) => void;
  onSelectFilePath?: (path: string | null) => void;
}

export function SkillDetailPanel({
  skill,
  selectedFilePath,
  onSkillUpdated,
  onSkillDeleted,
  onSelectFilePath,
}: SkillDetailPanelProps) {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [testing, setTesting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);

  // 物理文件状态
  const [fileContent, setFileContent] = useState<string>("");
  const [loadingFile, setLoadingFile] = useState(false);
  const [fileMode, setFileMode] = useState<"preview" | "source">("preview");

  // 预览模式下剔除 Markdown 前言
  const displayContent = useMemo(() => {
    if (selectedFilePath?.endsWith(".md") && fileMode === "preview") {
      return fileContent.replace(/^---[\s\S]*?---\r?\n?/, "");
    }
    return fileContent;
  }, [fileContent, selectedFilePath, fileMode]);

  // CapabilityRegistry 状态
  const [capStatus, setCapStatus] = useState<{
    version: string;
    status: string;
    healthStatus: string;
  } | null>(null);
  const [loadingCap, setLoadingCap] = useState(false);

  // 测试结果 Modal 状态
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testResultPayload, setTestResultPayload] = useState<any>(null);

  // 绑定 Agent 信息
  const [boundAgents, setBoundAgents] = useState<{ id: string; name: string }[] | null>(null);
  const [loadingBoundAgents, setLoadingBoundAgents] = useState(false);

  // SKILL.md 一键复制状态
  const [copiedMd, setCopiedMd] = useState(false);

  // 编辑表单状态
  const [editName, setEditName] = useState(skill.name);
  const [editDescription, setEditDescription] = useState(skill.description);
  const [editVersion, setEditVersion] = useState(skill.version);
  const [editCategory, setEditCategory] = useState(skill.category);

  // 校验状态（编辑时实时校验 SKILL.md 格式）
  const nameValidation = useMemo(() => {
    if (mode !== "edit") return null;
    const md = [
      "---",
      `name: ${editName}`,
      `description: ${editDescription}`,
      `version: ${editVersion}`,
      "---",
    ].join("\n");
    return validateSkillMdLocally(md);
  }, [mode, editName, editDescription, editVersion]);

  // SDK warnings（来自服务端响应）
  const [sdkWarnings, setSdkWarnings] = useState<string[]>([]);

  // 重置表单
  const resetForm = useCallback(() => {
    setEditName(skill.name);
    setEditDescription(skill.description);
    setEditVersion(skill.version);
    setEditCategory(skill.category);
  }, [skill]);

  // 取消编辑
  const handleCancelEdit = useCallback(() => {
    resetForm();
    setMode("view");
  }, [resetForm]);

  // 获取物理文件内容
  useEffect(() => {
    if (!selectedFilePath) {
      setFileContent("");
      return;
    }
    const loadContent = async () => {
      setLoadingFile(true);
      try {
        const res = await apiClient.getSkillFileContent(skill.id, selectedFilePath);
        setFileContent(res.content || "");
      } catch (err) {
        toast.error("读取物理文件失败");
        setFileContent("读取文件失败，或文件在磁盘上不存在。");
      } finally {
        setLoadingFile(false);
      }
    };
    loadContent();
  }, [skill.id, selectedFilePath]);

  // 自动尝试加载 SKILL.md
  useEffect(() => {
    if (!selectedFilePath && skill.fileTree?.some((f) => f.path === "SKILL.md")) {
      onSelectFilePath?.("SKILL.md");
    }
  }, [skill, selectedFilePath, onSelectFilePath]);

  // 拉取已绑定 Agent 列表
  useEffect(() => {
    if (mode !== "view") {
      setBoundAgents(null);
      return;
    }
    const loadBoundAgents = async () => {
      setLoadingBoundAgents(true);
      try {
        const res = await apiClient.getAgents({ skillId: skill.id });
        const agents = (res.agents as Array<{ id: string; name: string }>) || [];
        setBoundAgents(agents.map((a) => ({ id: a.id, name: a.name })));
      } catch {
        setBoundAgents([]);
      } finally {
        setLoadingBoundAgents(false);
      }
    };
    loadBoundAgents();
  }, [skill.id, mode]);

  // 拉取 CapabilityRegistry 状态
  const fetchCapStatus = useCallback(async () => {
    setLoadingCap(true);
    try {
      const res = await fetch(`/api/capabilities?skillId=${skill.name}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setCapStatus(json.data);
        } else {
          setCapStatus(null);
        }
      } else {
        setCapStatus(null);
      }
    } catch {
      setCapStatus(null);
    } finally {
      setLoadingCap(false);
    }
  }, [skill.name]);

  useEffect(() => {
    fetchCapStatus();
  }, [fetchCapStatus]);

  // 保存编辑
  const handleSave = useCallback(async () => {
    setSaving(true);
    setSdkWarnings([]);
    try {
      const result = (await apiClient.updateSkill(skill.id, {
        name: editName,
        description: editDescription,
        version: editVersion,
        category: editCategory,
      })) as { skill?: Skill; warnings?: string[] };
      onSkillUpdated?.((result?.skill ?? result) as Skill);
      if (result?.warnings && result.warnings.length > 0) {
        setSdkWarnings(result.warnings);
      } else {
        setSdkWarnings([]);
      }
      setMode("view");
      toast.success("技能信息已更新");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "保存失败";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }, [skill.id, editName, editDescription, editVersion, editCategory, onSkillUpdated]);

  // 测试技能
  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResultPayload(null);
    try {
      const result = await apiClient.testSkill(skill.id);
      setTestResultPayload(result);
      setTestModalOpen(true);
      toast.success("测试执行完毕");
    } catch (err: unknown) {
      const apiErr = err as { status?: number; message?: string };
      if (apiErr.status === 409 && skill.automationLevel === "L3") {
        const confirmed = confirm(
          `「${skill.name}」为 L3 需人工确认技能，测试后将立即生效且无法撤销。确认执行测试？`,
        );
        if (confirmed) {
          try {
            const retryResult = await apiClient.testSkill(skill.id, true);
            setTestResultPayload(retryResult);
            setTestModalOpen(true);
            toast.success("测试已确认执行完毕");
          } catch (retryErr: unknown) {
            const retryApiErr = retryErr as { message?: string };
            setTestResultPayload({ success: false, message: retryApiErr.message ?? "确认后测试请求失败" });
            setTestModalOpen(true);
          }
        } else {
          toast.warning("已取消测试（L3 需人工确认）");
        }
      } else {
        setTestResultPayload({ success: false, message: apiErr.message ?? "测试请求失败" });
        setTestModalOpen(true);
      }
    } finally {
      setTesting(false);
    }
  }, [skill.id, skill.automationLevel, skill.name]);

  // 删除技能
  const handleDelete = useCallback(async () => {
    if (!confirm(`确认删除「${skill.name}」？此操作不可撤销。`)) return;
    setDeleting(true);
    try {
      await apiClient.deleteSkill(skill.id);
      toast.success(`技能「${skill.name}」已删除`);
      onSkillDeleted?.(skill.id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "删除失败";
      if (msg.includes("智能体使用")) {
        toast.error(msg);
      } else {
        toast.error("删除技能失败");
      }
    } finally {
      setDeleting(false);
    }
  }, [skill.id, skill.name, onSkillDeleted]);

  // 切换启用/停用
  const handleToggleStatus = useCallback(async () => {
    const newStatus = skill.status === "active" ? "inactive" : "active";
    try {
      const result = await apiClient.updateSkill(skill.id, { status: newStatus });
      onSkillUpdated?.(result as unknown as Skill);
      toast.success(newStatus === "active" ? "技能已启用" : "技能已停用");
    } catch {
      toast.error("状态切换失败");
    }
  }, [skill.id, skill.status, onSkillUpdated]);

  // 复制 SKILL.md 完整原文（含 frontmatter）
  const handleCopySkillMd = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(fileContent);
      setCopiedMd(true);
      toast.success("已复制 SKILL.md 完整原文");
      setTimeout(() => setCopiedMd(false), 2000);
    } catch {
      toast.error("复制失败");
    }
  }, [fileContent]);

  // ==========================================
  // 情况 1: 展示物理文件内容
  // ==========================================
  if (selectedFilePath) {
    return (
      <div className="space-y-4 animate-fade-in flex flex-col h-full min-h-[500px]">
        {/* 顶部面包屑与模式 Tab */}
        <div className="flex items-center justify-between border-b border-border/40 pb-3 gap-3">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground min-w-0">
            <span className="font-semibold text-foreground/80 truncate">{skill.name}</span>
            <span>/</span>
            <span className="font-mono text-xs bg-accent/40 px-2 py-0.5 rounded text-foreground truncate">{selectedFilePath}</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* SKILL.md 快捷跳转 */}
            {skill.fileTree?.some((f) => f.path === "SKILL.md") && selectedFilePath !== "SKILL.md" && (
              <button
                type="button"
                onClick={() => onSelectFilePath?.("SKILL.md")}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground bg-accent/40 hover:bg-accent/60 rounded-lg px-2.5 py-1.5 transition-colors"
              >
                <FileText className="size-3" />
                SKILL.md
              </button>
            )}

            {/* 一键复制完整原文（含 frontmatter） */}
            {selectedFilePath.endsWith(".md") && fileMode === "preview" && (
              <button
                type="button"
                onClick={handleCopySkillMd}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:text-brand/80 bg-brand/10 hover:bg-brand/15 rounded-lg px-2.5 py-1.5 transition-colors"
              >
                {copiedMd ? <Check className="size-3" /> : <Copy className="size-3" />}
                {copiedMd ? "已复制" : "复制完整原文"}
              </button>
            )}

            {selectedFilePath.endsWith(".md") && (
              <div className="flex gap-1 bg-accent/40 rounded-lg p-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setFileMode("preview")}
                  className={cn(
                    "px-2.5 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1",
                    fileMode === "preview"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Eye className="size-3" />
                  预览
                </button>
                <button
                  type="button"
                  onClick={() => setFileMode("source")}
                  className={cn(
                    "px-2.5 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1",
                    fileMode === "source"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Code2 className="size-3" />
                  源码
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 文件渲染核心 */}
        <div className="flex-1 min-h-0">
          {loadingFile ? (
            <div className="min-h-[300px] flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="size-6 animate-spin text-brand" />
              <span className="text-xs">加载物理文件中…</span>
            </div>
          ) : selectedFilePath.endsWith(".md") && fileMode === "preview" ? (
            <div className="prose prose-sm dark:prose-invert max-h-[70vh] overflow-y-auto border border-border/40 rounded-2xl p-6 bg-accent/5 leading-relaxed">
              <MarkdownRenderer content={displayContent} />
            </div>
          ) : (
            <pre className="font-mono text-xs overflow-auto bg-black/40 border border-white/5 p-4 rounded-xl max-h-[70vh] leading-relaxed whitespace-pre-wrap">
              {fileContent}
            </pre>
          )}
        </div>
      </div>
    );
  }

  // ==========================================
  // 情况 2: 展示技能基本信息与测试面板
  // ==========================================
  return (
    <div className="space-y-6">
      {/* ---- 标题行 ---- */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5 min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-foreground text-lg font-semibold truncate max-w-xs">
              {mode === "edit" ? (
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="bg-accent/50 border border-border rounded-lg px-2 py-1 text-lg font-semibold w-48 focus:border-brand/50 outline-none"
                  disabled={saving}
                />
              ) : (
                skill.name
              )}
            </h2>
            <AutomationLevelBadge level={skill.automationLevel} />
            <span className="bg-accent text-muted-foreground rounded-md px-2 py-0.5 text-[10px] font-mono">
              {mode === "edit" ? (
                <input
                  type="text"
                  value={editVersion}
                  onChange={(e) => setEditVersion(e.target.value)}
                  className="bg-transparent w-16 text-[10px] outline-none"
                  disabled={saving}
                />
              ) : (
                skill.version
              )}
            </span>
            <span className="bg-accent text-muted-foreground rounded-md px-2 py-0.5 text-[10px]">
              {SOURCE_LABEL[skill.source]}
            </span>
            {skill.isValid === false && (
              <span className="inline-flex items-center gap-1 rounded-full border border-warning/20 bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning">
                校验未通过
              </span>
            )}
            <StatusBadge
              status={skill.status === "active" ? "running" : skill.status === "inactive" ? "idle" : "paused"}
            />
          </div>

          {/* CapRegistry 状态条 */}
          {capStatus && (
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground bg-accent/30 rounded-lg px-2.5 py-1 w-fit border border-border/30">
              <Activity className="size-3 text-hint shrink-0 animate-pulse" />
              <span>能力注册表:</span>
              <strong className="font-mono">{capStatus.version}</strong>
              <span>|</span>
              <span className={cn(
                "font-bold",
                capStatus.healthStatus === "healthy" ? "text-success" :
                capStatus.healthStatus === "degraded" ? "text-warning" : "text-danger"
              )}>
                {capStatus.healthStatus === "healthy" ? "健康 (healthy)" :
                 capStatus.healthStatus === "degraded" ? "降级 (degraded)" : "已下线 (yanked)"}
              </span>
            </div>
          )}
        </div>

        {/* 操作按钮组 */}
        <div className="flex shrink-0 items-center gap-2">
          {(skill.source === "CUSTOM" || skill.source === "EXTERNAL") && mode === "view" && (
            <>
              {skill.source === "CUSTOM" && (
                <button
                  type="button"
                  onClick={() => setMode("edit")}
                  className="inline-flex items-center gap-1.5 border border-border hover:bg-accent rounded-lg px-2.5 py-1.5 text-xs transition-colors font-medium text-muted-foreground hover:text-foreground"
                >
                  <Edit3 className="size-3" />
                  编辑
                </button>
              )}
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 border border-danger/20 text-danger hover:bg-danger/5 rounded-lg px-2.5 py-1.5 text-xs transition-colors font-medium disabled:opacity-60"
              >
                {deleting ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
                删除
              </button>
            </>
          )}
          {mode === "edit" && (
            <>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || (nameValidation?.valid === false)}
                className="inline-flex items-center gap-1.5 bg-brand text-white rounded-lg px-2.5 py-1.5 text-xs transition-colors font-medium disabled:opacity-50"
              >
                {saving ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />}
                保存
              </button>
              <button
                type="button"
                onClick={handleCancelEdit}
                disabled={saving}
                className="inline-flex items-center gap-1.5 border border-border rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-60"
              >
                <X className="size-3" />
                取消
              </button>
            </>
          )}

          {/* 启用/停用开关 */}
          <span className="text-muted-foreground text-xs ml-2">
            {skill.status === "active" ? "已启用" : "已停用"}
          </span>
          <button
            type="button"
            onClick={handleToggleStatus}
            className={cn(
              "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
              skill.status === "active" ? "bg-brand" : "bg-muted",
            )}
            role="switch"
            aria-checked={skill.status === "active"}
          >
            <span
              className={cn(
                "pointer-events-none inline-block size-5 rounded-full bg-white shadow transition-transform",
                skill.status === "active" ? "translate-x-5" : "translate-x-0",
              )}
            />
          </button>
        </div>
      </div>

      {/* 编辑模式下的实时校验提示 */}
      {mode === "edit" && nameValidation && (
        <div className="space-y-1">
          {nameValidation.errors.map((e, i) => (
            <div
              key={`err-${i}`}
              className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger"
            >
              <AlertTriangle className="mt-0.5 size-3 shrink-0" />
              {e}
            </div>
          ))}
          {nameValidation.warnings.map((w, i) => (
            <div
              key={`warn-${i}`}
              className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning"
            >
              <AlertTriangle className="mt-0.5 size-3 shrink-0" />
              {w}
            </div>
          ))}
          {nameValidation.suggestions.map((s, i) => (
            <div
              key={`sug-${i}`}
              className="flex items-start gap-2 rounded-lg border border-hint/30 bg-hint/5 px-3 py-2 text-xs text-hint"
            >
              {s}
            </div>
          ))}
        </div>
      )}

      {/* SDK warnings 提示横幅 */}
      {mode === "view" && sdkWarnings.length > 0 && (
        <div className="space-y-1.5 rounded-xl border border-warning/30 bg-warning/5 p-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-warning">
            <AlertTriangle className="size-3.5" />
            SKILL.md 规范提示
          </div>
          <ul className="list-disc list-inside text-xs text-warning/90 space-y-0.5">
            {sdkWarnings.map((w, i) => (
              <li key={`sdk-warn-${i}`}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 描述 */}
      <div>
        {mode === "edit" ? (
          <div className="space-y-1">
            <label className="text-muted-foreground text-[10px] font-bold uppercase tracking-wide">
              描述
            </label>
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              className="w-full bg-accent/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground resize-none h-24 focus:border-brand/50 outline-none"
              disabled={saving}
              maxLength={2000}
            />
            <span className="text-hint text-[10px] text-right block">
              {editDescription.length} / 2000
            </span>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm leading-relaxed">
            {skill.description}
          </p>
        )}
      </div>

      {/* 已绑定 Agent */}
      {mode === "view" && (
        <div className="space-y-2">
          <h3 className="text-foreground text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5">
            <Puzzle className="size-3.5" />
            已绑定智能体
          </h3>
          {loadingBoundAgents ? (
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <Loader2 className="size-3 animate-spin" />
              加载中…
            </div>
          ) : boundAgents && boundAgents.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {boundAgents.map((agent) => (
                <span
                  key={agent.id}
                  className="inline-flex items-center gap-1 bg-accent/60 text-foreground rounded-md px-2.5 py-1 text-xs border border-border/40"
                >
                  {agent.name}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground/70 text-xs italic">
              暂未绑定至任何智能体
            </p>
          )}
        </div>
      )}

      {mode === "edit" && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-muted-foreground text-[10px] font-bold uppercase tracking-wide">
              分类
            </label>
            <input
              type="text"
              value={editCategory}
              onChange={(e) => setEditCategory(e.target.value)}
              className="w-full bg-accent/50 border border-border rounded-lg px-2 py-1.5 text-sm outline-none focus:border-brand/50"
              disabled={saving}
            />
          </div>
        </div>
      )}

      {/* 统计指标 */}
      {skill.stats && mode === "view" && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-accent/30 border border-border/50 rounded-xl p-3 flex flex-col">
            <span className="text-muted-foreground text-[10px] uppercase font-bold tracking-wide">
              最近执行统计
            </span>
            <span className="text-foreground text-lg font-bold mt-1">
              {skill.stats.callCount} 次调用
            </span>
          </div>
          <div className="bg-accent/30 border border-border/50 rounded-xl p-3 flex flex-col">
            <span className="text-muted-foreground text-[10px] uppercase font-bold tracking-wide">
              执行成功率
            </span>
            <span
              className={cn(
                "text-lg font-bold mt-1",
                skill.stats.successRate >= 0.9 ? "text-success" : "text-warning",
              )}
            >
              {(skill.stats.successRate * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      )}

      {/* 输入/输出规格 */}
      {mode === "view" && (
        <>
          <div>
            <h3 className="text-foreground mb-2 text-xs font-semibold uppercase tracking-wide">
              输入规格
            </h3>
            <pre className="bg-black/30 text-muted-foreground overflow-x-auto rounded-lg border border-white/5 p-3 font-mono text-xs leading-relaxed max-h-48">
              {(() => {
                try {
                  return JSON.stringify(JSON.parse(skill.inputSchema), null, 2);
                } catch {
                  return skill.inputSchema;
                }
              })()}
            </pre>
          </div>
          <div>
            <h3 className="text-foreground mb-2 text-xs font-semibold uppercase tracking-wide">
              输出规格
            </h3>
            <pre className="bg-black/30 text-muted-foreground overflow-x-auto rounded-lg border border-white/5 p-3 font-mono text-xs leading-relaxed max-h-48">
              {(() => {
                try {
                  return JSON.stringify(JSON.parse(skill.outputSchema), null, 2);
                } catch {
                  return skill.outputSchema;
                }
              })()}
            </pre>
          </div>
        </>
      )}

      {/* 适用场景 */}
      {skill.scenarios && skill.scenarios.length > 0 && mode === "view" && (
        <div>
          <h3 className="text-foreground mb-2 text-xs font-semibold uppercase tracking-wide">
            适用场景
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {skill.scenarios.map((s) => (
              <span key={s} className="bg-accent text-muted-foreground rounded-md px-2.5 py-1 text-xs">
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 测试区域 */}
      <div className="border-border border-t pt-4 space-y-3">
        <button
          type="button"
          onClick={handleTest}
          disabled={testing}
          className="text-muted-foreground hover:text-foreground hover:bg-accent inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition-colors disabled:opacity-60"
        >
          {testing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Play className="size-4" />
          )}
          {testing ? "测试中…" : "测试技能"}
        </button>
      </div>

      {/* 测试报告 Modal */}
      <TestResultModal
        isOpen={testModalOpen}
        onClose={() => setTestModalOpen(false)}
        result={testResultPayload}
        skillName={skill.name}
      />
    </div>
  );
}
