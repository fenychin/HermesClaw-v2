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
  Bot,
  Sparkles,
  Plus,
} from "lucide-react";
import { useAgentStore } from "@/stores/agent-store";
import { useProjectStore } from "@/stores/project-store";
import { apiClient } from "@/lib/api-client";
import type { Agent, Project } from "@/types";
import { toast } from "sonner";
import { AgentConfigDrawer } from "@/components/workspace/AgentConfigDrawer";

// 模型配置从 src/config/models.ts 统一导入（单一数据源）
import { SELECTABLE_MODELS, type SelectableModel } from "@/config/models";

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

interface UploadedFile {
  name: string;
  url: string;
  size: string;
  content?: string;
}

interface CommandBoxProps {
  value: string;
  onChange: (value: string | ((prev: string) => string)) => void;
  /** 发送回调（Enter 或发送按钮触发，传出最终拼接附件后的 prompt） */
  onSubmit?: (finalPrompt: string) => void;
  /** 停止流式输出回调 */
  onStop?: () => void;
  /** 是否正在流式接收中 */
  isStreaming?: boolean;
  /** 错误信息 */
  error?: string | null;
  /** 外部触发聚焦（值变化时 focus textarea） */
  focusKey?: number;
  /** 触发智能体引导向导回调 */
  onStartWizard?: (initialPrompt: string) => void;
  /** 动态输入框 Placeholder */
  placeholder?: string;
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
  onStartWizard,
  placeholder,
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
  const [showAgentDrawer, setShowAgentDrawer] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // 已上传附件状态 (不展现在 textarea 内部，以 tag 形式在上方独立展现)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);

  // 语音权限提示（首次使用）
  const [voicePermissionDenied, setVoicePermissionDenied] = useState(false);

  /** 技能命令降级列表（API 不可用时兜底，与 .claude/skills/ft-* 目录对应） */
  const FALLBACK_SLASH_COMMANDS = [
    { name: "/ft-inquiry-sorter", label: "邮件解析与询盘分拣", desc: "解析入站邮件，提取询盘关键信息并分类" },
    { name: "/ft-inquiry-grading", label: "询盘智能分级", desc: "A/B/C 三级评分询盘" },
    { name: "/ft-inquiry-priority", label: "询盘优先级评估", desc: "四维度评分，辅助跟进决策" },
    { name: "/ft-outreach-email", label: "自动开发信生成", desc: "个性化外贸开发信草稿" },
    { name: "/ft-ab-testing", label: "开发信 A/B 测试", desc: "版本对比 + 打开率追踪 + 优胜推荐" },
    { name: "/ft-auto-reply", label: "自动回复草稿", desc: "多语种多风格回复草稿生成" },
    { name: "/ft-customer-profiling", label: "客户画像分析", desc: "多渠道客户画像构建" },
    { name: "/ft-cost-accounting", label: "成本核算", desc: "多贸易术语成本明细表" },
    { name: "/ft-quotation-pdf", label: "报价单 PDF 生成", desc: "多币种专业格式报价单" },
    { name: "/ft-quote-generator", label: "报价生成与优化", desc: "多贸易术语报价方案与版本管理" },
    { name: "/ft-document-parsing", label: "单证解析", desc: "提单/发票/装箱单审核" },
    { name: "/ft-follow-up-crm", label: "客户跟进管理", desc: "跟进提醒与话术建议" },
    { name: "/ft-competitor-analysis", label: "竞品动态分析", desc: "目标市场画像与竞品格局" },
  ];

  interface SlashCommand {
    name: string;
    label: string;
    desc: string;
  }

  // 技能命令列表（动态拉取 /api/skills，失败时降级为硬编码列表）
  const [slashCommands, setSlashCommands] = useState<SlashCommand[]>(FALLBACK_SLASH_COMMANDS);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getSkills()
      .then(({ skills }) => {
        if (cancelled || !Array.isArray(skills) || skills.length === 0) return;
        const mapped: SlashCommand[] = [];
        const seen = new Set<string>();
        for (const s of skills) {
          const skill = s as Record<string, unknown>;
          const name = String(skill.name ?? "");
          const description = String(skill.description ?? "");
          // 尝试从 inputSchema 提取 commandName，否则根据名称生成
          let cmdName: string;
          try {
            const schema = typeof skill.inputSchema === "string"
              ? JSON.parse(skill.inputSchema)
              : (skill.inputSchema as Record<string, unknown>) ?? {};
            cmdName = typeof schema.commandName === "string" && schema.commandName
              ? `/${schema.commandName}`
              : `/${name.toLowerCase().replace(/\s+/g, "-")}`;
          } catch {
            cmdName = `/${name.toLowerCase().replace(/\s+/g, "-")}`;
          }
          if (!seen.has(cmdName)) {
            seen.add(cmdName);
            mapped.push({ name: cmdName, label: name, desc: description || name });
          }
        }
        // 将降级列表中 API 未返回的内置命令合并进来
        for (const fb of FALLBACK_SLASH_COMMANDS) {
          if (!seen.has(fb.name)) {
            seen.add(fb.name);
            mapped.push(fb);
          }
        }
        setSlashCommands(mapped);
      })
      .catch(() => {
        // API 失败时保留降级列表，静默处理
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // ---- 监听输入框变化 ----
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    onChange(val);

    const selectionStart = e.target.selectionStart;
    const beforeCursor = val.slice(0, selectionStart);
    const match = beforeCursor.match(/@(\S*)$/);
    if (match) {
      setActiveDropdown("agent");
      setAgentSearch(match[1] || "");
      if (storeAgents.length === 0 && !agentLoading) {
        loadAgents();
      }
    } else {
      if (activeDropdown === "agent") {
        setActiveDropdown(null);
      }
    }
  };

  // ---- 点击 AtSign 按钮 ----
  const handleAtClick = () => {
    insertAtCursor("@");
    setActiveDropdown("agent");
    if (storeAgents.length === 0 && !agentLoading) {
      loadAgents();
    }
  };

  // ---- 选择智能体 ----
  const selectAgent = (agent: Agent) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const before = value.slice(0, start);
    const after = value.slice(start);
    const lastAtIdx = before.lastIndexOf("@");
    if (lastAtIdx !== -1) {
      const newValue = `${before.slice(0, lastAtIdx)}@${agent.name} ${after}`;
      onChange(newValue);
      requestAnimationFrame(() => {
        el.focus();
        const pos = lastAtIdx + agent.name.length + 2;
        el.setSelectionRange(pos, pos);
      });
    } else {
      insertAtCursor(`@${agent.name}`);
    }
    setActiveDropdown(null);
    setAgentSearch("");
  };

  // ---- 选择项目 ----
  const selectProject = (project: Project) => {
    insertAtCursor(`#${project.name}`);
    setActiveDropdown(null);
    setProjectSearch("");
  };

  // ---- 最终拼接并发送 ----
  const handleSendPrompt = useCallback(() => {
    if (!value.trim() || isStreaming) return;
    let finalPrompt = value.trim();
    if (uploadedFiles.length > 0) {
      const filesContext = uploadedFiles.map(file => {
        let text = `[📎 关联文件: ${file.name} (${file.size})](${file.url})`;
        if (file.content) {
          text += `\n\`\`\`\n${file.content}\n\`\`\``;
        }
        return text;
      }).join("\n\n");
      finalPrompt = `${finalPrompt}\n\n${filesContext}`;
    }
    onSubmit?.(finalPrompt);
    setUploadedFiles([]); // 发送后清空已上传附件
  }, [value, isStreaming, uploadedFiles, onSubmit]);

  // ---- 快捷键 ----
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Enter 发送（无 Shift 时）
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendPrompt();
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
      // 以 Tag 形式追加到状态中，不再污染 input textarea
      setUploadedFiles(prev => [...prev, {
        name: fileName,
        url: uploaded.url,
        size: `${sizeMB}MB`,
        content: extracted?.ok && extracted.content ? extracted.content : undefined
      }]);
      toast.success(`已成功上传并关联知识库: ${fileName}`);
    } catch (err) {
      toast.dismiss(toastId);
      toast.error("文件上传失败", {
        description: err instanceof Error ? err.message : "请稍后重试",
      });
      // 降级关联一个空 url
      setUploadedFiles(prev => [...prev, {
        name: fileName,
        url: "#",
        size: `${sizeMB}MB`
      }]);
    }
    e.target.value = "";
  };

  // ---- 语音录入（Web Speech API，使用 isFinal 区分中间/最终结果） ----
  // 记录最后一次 final 结果在输入框中的起始位置，用于仅更新 interim 区域
  const lastFinalLengthRef = useRef(0);

  const toggleRecording = () => {
    toast.info("语音输入功能正在开发中，敬请期待…", {
      description: "下一版本将接入专业级 AI 语音大模型，提供精准的高速语音解析。",
    });
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
      (a.status === "running" || a.status === "idle") &&
      (!agentSearch ||
        a.name.toLowerCase().includes(agentSearch.toLowerCase()) ||
        a.role.includes(agentSearch)),
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
      {/* Popover 下拉菜单 */}
      <AnimatePresence>
        {activeDropdown === "agent" && (
          <Popover>
            <div className="p-2 border-b border-border bg-muted/20">
              <input
                type="text"
                value={agentSearch}
                onChange={(e) => setAgentSearch(e.target.value)}
                placeholder="搜索智能体..."
                className="w-full bg-background border border-border rounded px-2 py-1 text-xs outline-none text-foreground"
                autoFocus
              />
            </div>
            <div className="max-h-60 overflow-y-auto p-1">
              {agentLoading ? (
                <div className="text-xs text-muted-foreground p-3 text-center">加载中...</div>
              ) : filteredAgents.length === 0 ? (
                <div className="text-xs text-muted-foreground p-3 text-center">未找到智能体</div>
              ) : (
                filteredAgents.map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => selectAgent(agent)}
                    className="w-full flex items-center justify-between p-2 hover:bg-accent rounded-lg text-left text-xs transition-colors"
                  >
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground">{agent.name}</span>
                      <span className="text-[10px] text-muted-foreground">{agent.role}</span>
                    </div>
                    <span className="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded font-medium">
                      {agent.industryId === "foreign-trade" ? "外贸" : "自定义"}
                    </span>
                  </button>
                ))
              )}
            </div>
          </Popover>
        )}
      </AnimatePresence>

      {/* 顶部提示行 */}
      <p className="text-muted-foreground text-sm mb-2 select-none">
        今天要完成什么？
      </p>

      {/* 输入区 */}
      {uploadedFiles.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2 px-1">
          {uploadedFiles.map((file, idx) => (
            <div key={idx} className="flex items-center gap-1.5 bg-accent/40 text-xs px-2.5 py-1 rounded-lg border border-border/40 text-foreground/80 max-w-xs shrink-0 select-none">
              <Paperclip className="size-3 text-primary shrink-0" />
              <span className="truncate max-w-[120px] font-medium">{file.name}</span>
              <span className="text-[10px] text-muted-foreground shrink-0">({file.size})</span>
              <button
                type="button"
                onClick={() => setUploadedFiles(prev => prev.filter((_, i) => i !== idx))}
                className="text-muted-foreground hover:text-danger transition-colors ml-1 shrink-0"
                title="移除文件"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleTextareaChange}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || "输入需求、粘贴询盘、@调用智能体…"}
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
            <Plus className="size-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileChange}
            className="hidden"
            aria-hidden="true"
          />

          {/* 调用智能体 */}
          <button
            type="button"
            onClick={handleAtClick}
            className={cn(
              "text-hint hover:text-foreground hover:bg-accent rounded-lg p-1.5 transition-colors",
              activeDropdown === "agent" && "text-primary bg-primary/10"
            )}
            title="调用智能体"
          >
            <AtSign className="size-4" />
          </button>



        </div>

        {/* 右侧：模型选择器 + 语音输入 + 发送 / 停止按钮 */}
        <div className="flex items-center gap-2">

          {/* 语音输入按钮（置于中间，突出重要性） */}
          <button
            type="button"
            onClick={toggleRecording}
            className={cn(
              "size-8 flex items-center justify-center rounded-lg transition-colors shrink-0",
              isRecording
                ? "text-danger bg-danger/10 animate-pulse"
                : "text-hint hover:text-foreground hover:bg-accent",
            )}
            title={isRecording ? "停止录音" : voicePermissionDenied ? "语音输入（需麦克风权限）" : "语音输入"}
          >
            {isRecording ? <MicOff className="size-4" /> : <Mic className="size-4" />}
          </button>

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
              onClick={handleSendPrompt}
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

      {/* 新建智能体入口底座 */}
      {onStartWizard && (
        <div className={cn(
          "border-t border-border/60 mt-4 pt-3 mx-[-16px] mb-[-16px] px-4 py-2.5 bg-accent/10 rounded-b-2xl",
          "flex items-center justify-between text-xs select-none"
        )}>
          <button
            type="button"
            onClick={() => onStartWizard(value)}
            className="text-muted-foreground hover:text-primary flex items-center gap-1.5 transition-colors group font-medium"
          >
            <Bot className="size-3.5 text-primary group-hover:rotate-12 transition-transform" />
            <span>简单描述需求，由此智能引导创建专属智能体 →</span>
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onStartWizard(value)}
              className="text-[10px] font-semibold text-primary hover:text-white bg-primary/10 hover:bg-primary border border-primary/30 rounded-lg px-2.5 py-1 flex items-center gap-1 transition-all shadow-sm shrink-0"
            >
              <Sparkles className="size-3" />
              <span>新建智能体</span>
            </button>
            <span className="text-hint text-[10px] scale-90 origin-right shrink-0">
              Hermes 自进化向导
            </span>
          </div>
        </div>
      )}

      {showAgentDrawer && (
        <AgentConfigDrawer
          onClose={() => setShowAgentDrawer(false)}
        />
      )}
    </motion.div>
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
