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
} from "lucide-react";
import { useAgentStore } from "@/stores/agent-store";
import { useProjectStore } from "@/stores/project-store";
import type { Agent, Project } from "@/types";

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
  onChange: (value: string) => void;
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
}: CommandBoxProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const agentBtnRef = useRef<HTMLButtonElement>(null);
  const projectBtnRef = useRef<HTMLButtonElement>(null);

  const [isFocused, setIsFocused] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<DropdownType>(null);
  const [agentSearch, setAgentSearch] = useState("");
  const [projectSearch, setProjectSearch] = useState("");

  // ---- 自动调整 textarea 高度 ----
  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(80, el.scrollHeight)}px`;
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

  // ---- 筛选列表（从 store 获取，支持 API 加载的数据） ----
  const storeAgents = useAgentStore((s) => s.agents);
  const storeProjects = useProjectStore((s) => s.projects);

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
          "w-full min-h-[80px] resize-none bg-transparent",
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
            className="text-hint hover:text-foreground hover:bg-accent rounded-lg p-1.5 transition-colors"
            title="上传附件"
          >
            <Paperclip className="size-4" />
          </button>

          {/* 语音输入 */}
          <button
            type="button"
            className="text-hint hover:text-foreground hover:bg-accent rounded-lg p-1.5 transition-colors"
            title="语音输入"
          >
            <Mic className="size-4" />
          </button>

          {/* 粘贴 URL */}
          <button
            type="button"
            className="text-hint hover:text-foreground hover:bg-accent rounded-lg p-1.5 transition-colors"
            title="粘贴链接"
          >
            <Link className="size-4" />
          </button>

          {/* @ 智能体 */}
          <div className="relative">
            <button
              ref={agentBtnRef}
              type="button"
              onClick={() =>
                setActiveDropdown(activeDropdown === "agent" ? null : "agent")
              }
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
                    {filteredAgents.length === 0 ? (
                      <p className="text-hint text-xs text-center py-4">
                        无匹配智能体
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
              onClick={() =>
                setActiveDropdown(
                  activeDropdown === "project" ? null : "project",
                )
              }
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
                    {filteredProjects.length === 0 ? (
                      <p className="text-hint text-xs text-center py-4">
                        无匹配项目
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
          <button
            type="button"
            className="text-hint hover:text-foreground hover:bg-accent rounded-lg p-1.5 transition-colors"
            title="/ 命令"
          >
            <Slash className="size-4" />
          </button>
        </div>

        {/* 右侧发送 / 停止按钮 */}
        {isStreaming ? (
          <Button
            size="icon"
            className="size-8 rounded-lg bg-danger hover:bg-danger/80 text-danger-foreground"
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
            {!value.trim() ? (
              <ArrowUp className="size-4" />
            ) : (
              <ArrowUp className="size-4" />
            )}
          </Button>
        )}
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
