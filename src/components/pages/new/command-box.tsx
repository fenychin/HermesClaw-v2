"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Paperclip,
  Mic,
  Link,
  AtSign,
  Hash,
  Slash,
  ArrowUp,
  Square,
  Search,
  X,
  AlertCircle,
  MicOff,
  Globe,
  Zap,
  ChevronDown,
} from "lucide-react";
import { useAgentStore } from "@/stores/agent-store";
import { useProjectStore } from "@/stores/project-store";
import type { Agent, Project } from "@/types";
import { toast } from "sonner";

// ============================================================
// 可选模型配置（Provider + 具体型号 → API modelId）
// ============================================================

export interface SelectableModel {
  id: string;
  provider: "anthropic" | "deepseek";
  label: string;
  version: string;
  color: string;
  modelId: string; // 传给 /api/chat 的实际模型名
  available: boolean;
}

export const SELECTABLE_MODELS: SelectableModel[] = [
  {
    id: "deepseek-v4-pro",
    provider: "deepseek",
    label: "DeepSeek",
    version: "V4 Pro",
    color: "bg-success",
    modelId: "deepseek-v4-pro",
    available: true,
  },
  {
    id: "deepseek-v4-flash",
    provider: "deepseek",
    label: "DeepSeek",
    version: "V4 Flash",
    color: "bg-success",
    modelId: "deepseek-v4-flash",
    available: true,
  },
  {
    id: "claude-sonnet-4-6",
    provider: "anthropic",
    label: "Claude",
    version: "Sonnet 4.6",
    color: "bg-warning",
    modelId: "claude-sonnet-4-6",
    available: true,
  },
  {
    id: "claude-haiku-4-5",
    provider: "anthropic",
    label: "Claude",
    version: "Haiku 4.5",
    color: "bg-warning",
    modelId: "claude-haiku-4-5",
    available: false,
  },
  {
    id: "claude-opus-4-8",
    provider: "anthropic",
    label: "Claude",
    version: "Opus 4.8",
    color: "bg-warning",
    modelId: "claude-opus-4-8",
    available: false,
  },
];

/** 默认选中的模型 */
export const DEFAULT_MODEL_ID = "deepseek-v4-pro";

/** 下拉弹窗类型 */
type DropdownType = "agent" | "project" | null;

/** 智能体运行状态 → Tailwind 色标 */
const STATUS_DOT: Record<string, string> = {
  running: "bg-success",
  idle: "bg-hint",
  error: "bg-danger",
  paused: "bg-warning",
};

/** 项目类型 → 中文标签 */
const PROJECT_TYPE_LABEL: Record<string, string> = {
  customer: "客户",
  order: "订单",
  exhibition: "展会",
  "product-line": "产品线",
};

interface CommandBoxProps {
  value: string;
  onChange: (value: string | ((prev: string) => string)) => void;
  /** 发送回调（Enter 或发送按钮触发） */
  onSubmit?: () => void;
  /** 停止流式输出回调 */
  onStop?: () => void;
  /** 是否正在流式接收中 */
  isStreaming?: boolean;
  /** 错误信息 */
  error?: string | null;
  /** 外部触发聚焦（值变化时 focus textarea） */
  focusKey?: number;
  /** 当前选中的模型 ID（如 "deepseek-v4-pro"） */
  selectedModelId?: string;
  /** 模型变更回调 */
  onModelChange?: (modelId: string) => void;
}

/**
 * 新话题核心输入组件
 * —— 支持文本输入、@智能体、#项目空间、/命令，
 *    流式对话中发送按钮切换为停止按钮，聚焦时带品牌光晕。
 */
export function CommandBox({
  value,
  onChange,
  onSubmit,
  onStop,
  isStreaming = false,
  error = null,
  focusKey,
  selectedModelId,
  onModelChange,
}: CommandBoxProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const agentBtnRef = useRef<HTMLButtonElement>(null);
  const projectBtnRef = useRef<HTMLButtonElement>(null);

  const [isFocused, setIsFocused] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<DropdownType>(null);
  const [agentSearch, setAgentSearch] = useState("");
  const [projectSearch, setProjectSearch] = useState("");

  // 语音录入状态（Web Speech API）
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // URL 粘贴弹窗
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlValue, setUrlValue] = useState("");
  const urlInputRef = useRef<HTMLInputElement>(null);

  // /命令 弹窗
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 语音权限提示（首次使用）
  const [voicePermissionDenied, setVoicePermissionDenied] = useState(false);

  // 可用技能命令列表（/ft-*，与 .claude/skills/ft-*/ 目录同步）
  // ⚠️ 新增/删除 skill 时须同步更新此列表（AGENTS.md §4.14）
  const SLASH_COMMANDS = [
    { name: "/ft-inquiry-sorter", label: "邮件解析与询盘分拣", desc: "解析入站邮件，提取询盘关键信息并分类" },
    { name: "/ft-inquiry-grading", label: "询盘智能分级", desc: "A/B/C 三级评分询盘" },
    { name: "/ft-inquiry-priority", label: "询盘优先级评估", desc: "四维度评分，辅助跟进决策" },
    { name: "/ft-outreach-email", label: "自动开发信生成", desc: "个性化外贸开发信草稿" },
    { name: "/ft-ab-testing", label: "开发信 A/B 测试", desc: "版本对比 + 打开率追踪 + 优胜推荐" },
    { name: "/ft-auto-reply", label: "自动回复草稿", desc: "多语种多风格回复草稿生成" },
    { name: "/ft-customer-profiling", label: "客户画像分析", desc: "多渠道客户画像构建" },
    { name: "/ft-cost-accounting", label: "成本核算", desc: "多贸易术语成本明细表" },
    { name: "/ft-quotation-pdf", label: "报价单 PDF 生成", desc: "多币种专业格式报价单" },
    { name: "/ft-document-parsing", label: "单证解析", desc: "提单/发票/装箱单审核" },
    { name: "/ft-follow-up-crm", label: "客户跟进管理", desc: "跟进提醒与话术建议" },
    { name: "/ft-competitor-analysis", label: "竞品动态分析", desc: "目标市场画像与竞品格局" },
  ];

  // ---- 自动调整 textarea 高度 ----
  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(40, el.scrollHeight)}px`;
  }, []);

  useEffect(() => {
    autoResize();
  }, [value, autoResize]);

  // ---- 外部触发聚焦 ----
  useEffect(() => {
    if (focusKey !== undefined && focusKey > 0) {
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
    }
  }, [focusKey]);

  // ---- 点击外部关闭下拉弹窗 ----
  useEffect(() => {
    if (!activeDropdown) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current?.contains(e.target as Node)) return;
      setActiveDropdown(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [activeDropdown]);

  // ---- 在光标位置插入文本 ----
  const insertAtCursor = (text: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const before = value.slice(0, start);
    const after = value.slice(end);
    const newValue = `${before}${text} ${after}`;
    onChange(newValue);
    // 恢复焦点并将光标放到插入文本后
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + text.length + 1;
      el.setSelectionRange(pos, pos);
    });
  };

  // ---- 选择智能体 ----
  const selectAgent = (agent: Agent) => {
    insertAtCursor(`@${agent.name}`);
    setActiveDropdown(null);
    setAgentSearch("");
  };

  // ---- 选择项目 ----
  const selectProject = (project: Project) => {
    insertAtCursor(`#${project.name}`);
    setActiveDropdown(null);
    setProjectSearch("");
  };

  // ---- 快捷键 ----
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Enter 发送（无 Shift 时）
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !isStreaming) {
        onSubmit?.();
      }
    }
  };

  // ---- 文件上传（真实上传到服务端） ----
  const handleFileUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fileName = file.name;
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);

    // 1. 上传文件到服务端（含自动文本提取）
    const toastId = toast.loading(`上传中: ${fileName}…`);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/files/upload", {
        method: "POST",
        body: formData,
      });

      const json = await res.json() as {
        success: boolean;
        data?: {
          file: {
            name: string;
            url: string;
            size: number;
            type: string;
            extracted?: { ok: boolean; content?: string; note?: string };
          };
        };
        error?: string;
      };

      if (!res.ok || !json.success) {
        throw new Error(json.error || "上传失败");
      }

      const uploaded = json.data!.file;
      toast.dismiss(toastId);

      const extracted = uploaded.extracted;
      if (extracted?.ok && extracted.content) {
        // 服务端已提取文本 → 直接附在消息中供 AI 分析
        toast.success(`已上传并分析: ${fileName}`);
        insertAtCursor(
          `[📎 ${fileName} (${sizeMB}MB)](${uploaded.url})\n` +
          `\`\`\`\n${extracted.content}\n\`\`\`\n`,
        );
      } else if (extracted && !extracted.ok) {
        // 提取失败（如图片、扫描PDF等）→ 插入链接 + 说明
        toast.success(`已上传: ${fileName}`);
        insertAtCursor(
          `[📎 ${fileName} (${sizeMB}MB)](${uploaded.url})\n` +
          `> 注：${extracted.note || "此文件内容暂无法自动解析"}\n`,
        );
      } else {
        // 无提取结果（旧版兼容）
        toast.success(`已上传: ${fileName}`);
        insertAtCursor(`[📎 ${fileName} (${sizeMB}MB)](${uploaded.url})`);
      }
    } catch (err) {
      toast.dismiss(toastId);
      toast.error("文件上传失败", {
        description: err instanceof Error ? err.message : "请稍后重试",
      });
      // 降级：仅附文件名（不阻断用户流程）
      insertAtCursor(`[📎 ${fileName} (${sizeMB}MB)]`);
    }
    e.target.value = "";
  };

  // ---- 语音录入（Web Speech API，使用 isFinal 区分中间/最终结果） ----
  // 记录最后一次 final 结果在输入框中的起始位置，用于仅更新 interim 区域
  const lastFinalLengthRef = useRef(0);

  const toggleRecording = async () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }

    // 检测浏览器 SpeechRecognition API 支持
    const SpeechRecognitionAPI =
      (window as unknown as { SpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      toast.error("当前浏览器不支持语音识别", {
        description: "请使用 Chrome 或 Edge 浏览器",
      });
      return;
    }

    try {
      const recognition = new SpeechRecognitionAPI();
      recognitionRef.current = recognition;

      // 配置：中文识别
      recognition.lang = "zh-CN";
      recognition.interimResults = true;
      recognition.continuous = false; // 单段识别更稳定，避免 isFinal 管理复杂度
      recognition.maxAlternatives = 1;

      // 记录识别开始前的基础文本（不含之前可能残留的语音文本）
      const baseText = value;
      lastFinalLengthRef.current = baseText.length;

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let finalText = "";
        let interimText = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalText += result[0].transcript;
          } else {
            interimText += result[0].transcript;
          }
        }

        // 用原生 isFinal 状态管理：基础文本 + 已确认文本 + (中间文本)
        const base = value.slice(0, lastFinalLengthRef.current);
        if (finalText) {
          // final 结果：追加到基础文本末尾
          const newBase = `${base} ${finalText}`.trim();
          onChange(newBase);
          lastFinalLengthRef.current = newBase.length;
        } else if (interimText) {
          // interim 结果：在基础文本后临时展示
          onChange(`${base} ${interimText}`.trim());
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error === "no-speech") {
          toast.info("未检测到语音", { description: "请靠近麦克风再试一次" });
        } else if (event.error === "not-allowed") {
          setVoicePermissionDenied(true);
          toast.error("麦克风权限被拒绝", {
            description: "请在浏览器设置中允许麦克风访问后重试",
          });
        } else if (event.error === "aborted") {
          // 用户手动停止，无提示
        } else {
          toast.error("语音识别出错", { description: event.error || "未知错误" });
        }
        setIsRecording(false);
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognition.start();
      setIsRecording(true);
      toast.success("正在聆听…", { description: "说话内容将自动转为文字" });
    } catch (err) {
      const msg = err instanceof DOMException && err.name === "NotAllowedError"
        ? "麦克风权限被拒绝，请在浏览器设置中允许后重试"
        : "请检查浏览器麦克风权限设置";
      toast.error("无法启动语音识别", { description: msg });
      setVoicePermissionDenied(true);
    }
  };

  // ---- URL 粘贴（元数据 + 全文内容抓取，供 AI 分析） ----
  const [urlFetching, setUrlFetching] = useState(false);

  const handleUrlPaste = async () => {
    if (!urlValue.trim()) return;
    let url = urlValue.trim();
    if (!/^https?:\/\//i.test(url)) {
      url = `https://${url}`;
    }
    setUrlFetching(true);
    try {
      // 第一步：抓取页面元数据（标题 + 描述）
      const metaRes = await fetch(`/api/fetch-meta?url=${encodeURIComponent(url)}`);
      let title = "";
      let desc = "";
      if (metaRes.ok) {
        const meta = await metaRes.json() as { title?: string; description?: string };
        title = meta.title || "";
        desc = meta.description ? ` — ${meta.description.slice(0, 200)}` : "";
      }

      // 第二步：抓取全文可读内容（供 LLM 分析）
      let pageContent = "";
      try {
        const contentRes = await fetch(
          `/api/fetch-content?url=${encodeURIComponent(url)}&maxChars=8000`,
        );
        if (contentRes.ok) {
          const contentData = await contentRes.json() as { content?: string };
          if (contentData.content && !contentData.content.startsWith("[")) {
            pageContent = contentData.content;
          }
        }
      } catch {
        // 内容抓取失败不阻断——降级为仅插入链接
      }

      // 构建最终插入文本：链接 + 正文内容
      if (title) {
        const linkText = `[🌐 ${title}${desc}](${url})`;
        if (pageContent) {
          insertAtCursor(
            `${linkText}\n\n> 以下为网页全文（供 AI 分析参考）：\n\n${pageContent}`,
          );
        } else {
          insertAtCursor(linkText);
        }
      } else {
        insertAtCursor(url);
      }
    } catch {
      // 网络错误时直接插入 URL
      insertAtCursor(url);
    } finally {
      setUrlFetching(false);
      setShowUrlInput(false);
      setUrlValue("");
    }
  };

  // ---- /命令 选择 ----
  const handleSlashCommand = (command: string) => {
    insertAtCursor(`${command} `);
    setShowSlashMenu(false);
  };

  // ---- 筛选列表（从 store 获取，首开下拉时自动触发加载） ----
  const agentLoading = useAgentStore((s) => s.loading);
  const agentError = useAgentStore((s) => s.error);
  const storeAgents = useAgentStore((s) => s.agents);
  const loadAgents = useAgentStore((s) => s.loadAgents);

  const projectLoading = useProjectStore((s) => s.loading);
  const projectError = useProjectStore((s) => s.error);
  const storeProjects = useProjectStore((s) => s.projects);
  const loadProjects = useProjectStore((s) => s.loadProjects);

  // 打开 @ / # 下拉时，若 store 无数据且未加载中则触发拉取
  const openAgentDropdown = () => {
    const next = activeDropdown === "agent" ? null : "agent";
    setActiveDropdown(next);
    setShowUrlInput(false);
    setShowSlashMenu(false);
    if (next === "agent" && storeAgents.length === 0 && !agentLoading) {
      loadAgents();
    }
  };

  const openProjectDropdown = () => {
    const next = activeDropdown === "project" ? null : "project";
    setActiveDropdown(next);
    setShowUrlInput(false);
    setShowSlashMenu(false);
    if (next === "project" && storeProjects.length === 0 && !projectLoading) {
      loadProjects();
    }
  };

  const filteredAgents = storeAgents.filter(
    (a) =>
      !agentSearch ||
      a.name.toLowerCase().includes(agentSearch.toLowerCase()) ||
      a.role.includes(agentSearch),
  );

  const filteredProjects = storeProjects.filter(
    (p) =>
      !projectSearch ||
      p.name.toLowerCase().includes(projectSearch.toLowerCase()),
  );

  // ---- 聚焦光晕 ----
  const ringClass = isFocused
    ? "ring-1 ring-primary/40 border-primary/40"
    : "border-border hover:border-hint/60";

  const canSend = value.trim().length > 0 && !isStreaming;

  return (
    <motion.div
      ref={containerRef}
      initial={{ y: 16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={cn(
        "bg-card rounded-2xl border p-4 transition-all relative",
        ringClass,
      )}
    >
      {/* 顶部提示行 */}
      <p className="text-muted-foreground text-sm mb-2 select-none">
        今天要完成什么？
      </p>

      {/* 输入区 */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onKeyDown={handleKeyDown}
        placeholder="输入需求、粘贴询盘、@调用智能体…"
        rows={1}
        readOnly={isStreaming}
        className={cn(
          "w-full min-h-[40px] resize-none bg-transparent",
          "text-foreground placeholder:text-hint text-sm",
          "outline-none border-none",
          "leading-relaxed",
          isStreaming && "opacity-60 cursor-not-allowed",
        )}
      />

      {/* 底部工具栏 */}
      <div className="flex items-center justify-between mt-2">
        {/* 左侧图标按钮组 */}
        <div className="flex items-center gap-1">
          {/* 上传附件 */}
          <button
            type="button"
            onClick={handleFileUpload}
            className="text-hint hover:text-foreground hover:bg-accent rounded-lg p-1.5 transition-colors"
            title="上传附件"
          >
            <Paperclip className="size-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileChange}
            className="hidden"
            aria-hidden="true"
          />

          {/* 语音输入 */}
          <button
            type="button"
            onClick={toggleRecording}
            className={cn(
              "rounded-lg p-1.5 transition-colors",
              isRecording
                ? "text-danger bg-danger/10 animate-pulse"
                : "text-hint hover:text-foreground hover:bg-accent",
            )}
            title={isRecording ? "停止录音" : voicePermissionDenied ? "语音输入（需麦克风权限）" : "语音输入"}
          >
            {isRecording ? <MicOff className="size-4" /> : <Mic className="size-4" />}
          </button>

          {/* 粘贴 URL */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowUrlInput(!showUrlInput);
                setShowSlashMenu(false);
                setActiveDropdown(null);
              }}
              className={cn(
                "rounded-lg p-1.5 transition-colors",
                showUrlInput
                  ? "text-primary bg-primary/10"
                  : "text-hint hover:text-foreground hover:bg-accent",
              )}
              title="粘贴链接"
            >
              <Link className="size-4" />
            </button>

            {/* URL 输入弹窗 */}
            <AnimatePresence>
              {showUrlInput && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.96 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="absolute bottom-full left-0 mb-2 w-72 bg-popover border border-border rounded-xl shadow-2xl z-50 overflow-hidden"
                >
                  <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
                    <Globe className="size-3.5 text-hint shrink-0" />
                    <input
                      ref={urlInputRef}
                      autoFocus
                      value={urlValue}
                      onChange={(e) => setUrlValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleUrlPaste();
                        if (e.key === "Escape") setShowUrlInput(false);
                      }}
                      placeholder="粘贴或输入 URL…"
                      className="flex-1 bg-transparent text-sm text-foreground placeholder:text-hint outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleUrlPaste}
                      disabled={!urlValue.trim() || urlFetching}
                      className="text-primary hover:text-primary/80 text-xs font-medium disabled:opacity-40 shrink-0"
                    >
                      {urlFetching ? "获取中…" : "插入"}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* @ 智能体 */}
          <div className="relative">
            <button
              ref={agentBtnRef}
              type="button"
              onClick={openAgentDropdown}
              className={cn(
                "rounded-lg p-1.5 transition-colors",
                activeDropdown === "agent"
                  ? "text-primary bg-primary/10"
                  : "text-hint hover:text-foreground hover:bg-accent",
              )}
              title="@ 智能体"
            >
              <AtSign className="size-4" />
            </button>

            {/* 智能体下拉弹窗 */}
            <AnimatePresence>
              {activeDropdown === "agent" && (
                <Popover>
                  {/* 搜索框 */}
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
                    <Search className="size-3.5 text-hint shrink-0" />
                    <input
                      autoFocus
                      value={agentSearch}
                      onChange={(e) => setAgentSearch(e.target.value)}
                      placeholder="搜索智能体…"
                      className="flex-1 bg-transparent text-sm text-foreground placeholder:text-hint outline-none"
                    />
                    {agentSearch && (
                      <button
                        type="button"
                        onClick={() => setAgentSearch("")}
                        className="text-hint hover:text-foreground"
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </div>

                  {/* 列表 */}
                  <div className="max-h-56 overflow-y-auto py-1">
                    {agentLoading ? (
                      <p className="text-hint text-xs text-center py-4 animate-pulse">
                        加载中…
                      </p>
                    ) : agentError ? (
                      <p className="text-danger text-xs text-center py-4">
                        加载失败，请重试
                      </p>
                    ) : filteredAgents.length === 0 ? (
                      <p className="text-hint text-xs text-center py-4">
                        {storeAgents.length === 0 ? "暂无智能体" : "无匹配智能体"}
                      </p>
                    ) : (
                      filteredAgents.map((agent) => (
                        <button
                          key={agent.id}
                          type="button"
                          onClick={() => selectAgent(agent)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-accent transition-colors text-left"
                        >
                          {/* 状态圆点 */}
                          <span
                            className={cn(
                              "size-2 rounded-full shrink-0",
                              STATUS_DOT[agent.status] ?? "bg-hint",
                            )}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-foreground text-sm font-medium truncate">
                              {agent.name}
                            </p>
                            <p className="text-hint text-xs truncate">
                              {agent.role}
                            </p>
                          </div>
                          <span className="text-hint text-xs shrink-0">
                            @
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </Popover>
              )}
            </AnimatePresence>
          </div>

          {/* # 项目空间 */}
          <div className="relative">
            <button
              ref={projectBtnRef}
              type="button"
              onClick={openProjectDropdown}
              className={cn(
                "rounded-lg p-1.5 transition-colors",
                activeDropdown === "project"
                  ? "text-primary bg-primary/10"
                  : "text-hint hover:text-foreground hover:bg-accent",
              )}
              title="# 项目空间"
            >
              <Hash className="size-4" />
            </button>

            {/* 项目下拉弹窗 */}
            <AnimatePresence>
              {activeDropdown === "project" && (
                <Popover>
                  {/* 搜索框 */}
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
                    <Search className="size-3.5 text-hint shrink-0" />
                    <input
                      autoFocus
                      value={projectSearch}
                      onChange={(e) => setProjectSearch(e.target.value)}
                      placeholder="搜索项目…"
                      className="flex-1 bg-transparent text-sm text-foreground placeholder:text-hint outline-none"
                    />
                    {projectSearch && (
                      <button
                        type="button"
                        onClick={() => setProjectSearch("")}
                        className="text-hint hover:text-foreground"
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </div>

                  {/* 列表 */}
                  <div className="max-h-56 overflow-y-auto py-1">
                    {projectLoading ? (
                      <p className="text-hint text-xs text-center py-4 animate-pulse">
                        加载中…
                      </p>
                    ) : projectError ? (
                      <p className="text-danger text-xs text-center py-4">
                        加载失败，请重试
                      </p>
                    ) : filteredProjects.length === 0 ? (
                      <p className="text-hint text-xs text-center py-4">
                        {storeProjects.length === 0 ? "暂无项目" : "无匹配项目"}
                      </p>
                    ) : (
                      filteredProjects.map((project) => (
                        <button
                          key={project.id}
                          type="button"
                          onClick={() => selectProject(project)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-accent transition-colors text-left"
                        >
                          {/* 项目首字图标 */}
                          <span className="size-7 rounded-md bg-accent flex items-center justify-center text-xs font-semibold text-muted-foreground shrink-0">
                            {project.name.charAt(0)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-foreground text-sm font-medium truncate">
                              {project.name}
                            </p>
                            <p className="text-hint text-xs truncate">
                              {PROJECT_TYPE_LABEL[project.type] ?? project.type}
                              {" · "}
                              {project.owner}
                            </p>
                          </div>
                          <span className="text-hint text-xs shrink-0">
                            #
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </Popover>
              )}
            </AnimatePresence>
          </div>

          {/* / 命令 */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowSlashMenu(!showSlashMenu);
                setShowUrlInput(false);
                setActiveDropdown(null);
              }}
              className={cn(
                "rounded-lg p-1.5 transition-colors",
                showSlashMenu
                  ? "text-primary bg-primary/10"
                  : "text-hint hover:text-foreground hover:bg-accent",
              )}
              title="/ 命令"
            >
              <Slash className="size-4" />
            </button>

            {/* 技能命令下拉 */}
            <AnimatePresence>
              {showSlashMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.96 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="absolute bottom-full right-0 mb-2 w-64 bg-popover border border-border rounded-xl shadow-2xl z-50 overflow-hidden"
                >
                  <div className="max-h-72 overflow-y-auto py-1">
                    <p className="text-hint text-[10px] font-bold px-3 py-1.5 uppercase tracking-wider">
                      技能命令
                    </p>
                    {SLASH_COMMANDS.map((cmd) => (
                      <button
                        key={cmd.name}
                        type="button"
                        onClick={() => handleSlashCommand(cmd.name)}
                        className="w-full flex items-start gap-2.5 px-3 py-2.5 hover:bg-accent transition-colors text-left"
                      >
                        <Zap className="size-3.5 text-primary mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-foreground text-sm font-medium truncate">
                            {cmd.name}
                          </p>
                          <p className="text-hint text-xs truncate leading-tight mt-0.5">
                            {cmd.desc}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* 右侧：模型选择器 + 发送 / 停止按钮 */}
        <div className="flex items-center gap-2">
          {/* 模型选择器（紧凑行内下拉） */}
          {onModelChange && selectedModelId && (
            <ModelSelectorInline
              value={selectedModelId}
              onChange={onModelChange}
              disabled={isStreaming}
            />
          )}

          {isStreaming ? (
            <Button
              size="icon"
              className="size-8 rounded-lg bg-danger hover:bg-danger/80 text-primary-foreground"
              onClick={onStop}
              title="停止生成"
            >
              <Square className="size-3.5 fill-current" />
            </Button>
          ) : (
            <Button
              size="icon"
              className="size-8 rounded-lg bg-primary hover:bg-primary/80 text-primary-foreground"
              disabled={!canSend}
              onClick={() => onSubmit?.()}
              title="发送"
            >
              <ArrowUp className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {/* 错误提示条 */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="mt-3 flex items-center gap-2 bg-danger/10 border border-danger/30 rounded-lg px-3 py-2 text-danger text-xs"
          >
            <AlertCircle className="size-3.5 shrink-0" />
            <span>{error}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ============================================================
// 行内模型选择器（Provider + 具体型号选择）
// ============================================================

interface ModelSelectorInlineProps {
  value: string; // model ID (e.g. "deepseek-v4-pro")
  onChange: (modelId: string) => void;
  disabled?: boolean;
}

function ModelSelectorInline({ value, onChange, disabled }: ModelSelectorInlineProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const current = SELECTABLE_MODELS.find((m) => m.id === value) ?? SELECTABLE_MODELS[0];

  // 按 Provider 分组
  const groups = SELECTABLE_MODELS.reduce((acc, m) => {
    if (!acc[m.provider]) acc[m.provider] = [];
    acc[m.provider].push(m);
    return acc;
  }, {} as Record<string, SelectableModel[]>);

  const providerLabels: Record<string, string> = {
    anthropic: "Anthropic",
    deepseek: "DeepSeek",
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs transition-colors",
          "hover:bg-accent border border-border",
          disabled && "opacity-50 cursor-not-allowed",
        )}
        title={`${current.label} ${current.version}`}
      >
        <span className={cn("size-2 rounded-full shrink-0", current.color)} />
        <span className="text-muted-foreground font-medium">{current.label}</span>
        <span className="text-hint text-[10px] hidden sm:inline">{current.version}</span>
        <ChevronDown className={cn("size-3 text-hint transition-transform", open && "rotate-180")} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            className="absolute bottom-full right-0 mb-2 w-56 bg-popover border border-border rounded-xl shadow-2xl z-50 overflow-hidden"
          >
            <div className="py-1">
              <p className="text-hint text-[10px] font-bold px-3 py-1.5 uppercase tracking-wider">
                选择模型
              </p>
              {Object.entries(groups).map(([provider, models]) => (
                <div key={provider} className="mb-1 last:mb-0">
                  <p className="text-hint text-[9px] px-3 py-0.5 uppercase tracking-wider opacity-60">
                    {providerLabels[provider] ?? provider}
                  </p>
                  {models.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      disabled={!m.available}
                      onClick={() => {
                        if (!m.available) return;
                        onChange(m.id);
                        setOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2 text-left transition-colors",
                        m.id === value ? "bg-accent" : "hover:bg-accent",
                        !m.available && "opacity-40 cursor-not-allowed",
                      )}
                    >
                      <span className={cn("size-2.5 rounded-full shrink-0", m.color)} />
                      <div className="flex-1 min-w-0">
                        <p className="text-foreground text-sm font-medium flex items-center gap-2">
                          {m.version}
                          {m.id === value && (
                            <span className="text-success text-[9px] font-normal">✓ 当前</span>
                          )}
                        </p>
                      </div>
                      {!m.available && (
                        <span className="text-hint text-[9px] shrink-0">需 API Key</span>
                      )}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================
// 微型 Popover 组件
// ============================================================

interface PopoverProps {
  children: React.ReactNode;
}

/**
 * 命令框下拉弹窗
 * —— 从底部工具栏向上弹出，含搜索与列表
 */
function Popover({ children }: PopoverProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.96 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className="absolute bottom-full left-0 mb-2 w-64 bg-popover border border-border rounded-xl shadow-2xl z-50 overflow-hidden"
    >
      {children}
    </motion.div>
  );
}
