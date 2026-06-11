"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Puzzle,
  FolderPlus,
  Trash2,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import type { Message } from "@/hooks/useChat";
import { MarkdownRenderer } from "@/components/common/markdown-renderer";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";

interface ConversationAreaProps {
  /** 完整对话消息列表 */
  messages: Message[];
  /** 是否正在流式接收 */
  isStreaming: boolean;
  /** 当前流式输出文本（未沉淀到 messages） */
  streamingContent: string;
  /** 清空对话回调 */
  onClearMessages: () => void;
}

/**
 * 对话区域组件
 * —— 展示用户与 AI 的对话气泡，支持流式输出光标动画，
 *    对话结束后提供沉淀/创建项目/清空操作栏。
 */
export function ConversationArea({
  messages,
  isStreaming,
  streamingContent,
  onClearMessages,
}: ConversationAreaProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // 沉淀为技能 / 创建项目 — 异步状态
  const [savingSkill, setSavingSkill] = useState(false);
  const [skillSaved, setSkillSaved] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [projectCreated, setProjectCreated] = useState<string | null>(null);

  // 自动滚底
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  /** 沉淀为技能：收集对话内容，创建技能记录 */
  const handleSaveAsSkill = useCallback(async () => {
    if (savingSkill || skillSaved) return;
    setSavingSkill(true);
    try {
      // 提取对话中最后一条用户消息作为技能名
      const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
      const skillName = lastUserMsg
        ? lastUserMsg.content.slice(0, 40).replace(/\n/g, " ")
        : "对话沉淀技能";

      // 收集所有 AI 回复作为技能描述/内容
      const aiContent = messages
        .filter((m) => m.role === "assistant")
        .map((m) => m.content)
        .join("\n\n---\n\n");

      await apiClient.createSkill({
        name: `对话沉淀: ${skillName}`,
        description: aiContent.slice(0, 800) || "从对话中沉淀的技能",
        category: "custom:对话沉淀",
        inputSchema: JSON.stringify({
          role: skillName,
          capabilities: ["根据对话上下文执行对应任务", "复用已有对话中的经验"],
          commandName: skillName.toLowerCase().replace(/\s+/g, "-").slice(0, 30),
        }),
        outputSchema: JSON.stringify({
          constraints: ["信息不足时主动询问", "不得执行高风险操作"],
          disableModelInvocation: false,
        }),
      });

      setSkillSaved(true);
      setTimeout(() => setSkillSaved(false), 3000);
    } catch (err) {
      toast.error("沉淀技能失败", {
        description: err instanceof Error ? err.message : "请稍后重试",
      });
    } finally {
      setSavingSkill(false);
    }
  }, [messages, savingSkill, skillSaved]);

  /** 创建项目空间：从对话内容提取关键信息并创建项目 */
  const handleCreateProject = useCallback(async () => {
    if (creatingProject || projectCreated) return;
    setCreatingProject(true);
    try {
      const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
      const projectName = lastUserMsg
        ? lastUserMsg.content.slice(0, 50).replace(/\n/g, " ")
        : "新项目空间";

      // 从 AI 回复中提取可能的下一步行动
      const lastAiMsg = [...messages].reverse().find((m) => m.role === "assistant");
      const nextActions = lastAiMsg
        ? lastAiMsg.content
            .split("\n")
            .filter((line) => line.trim().startsWith("- ") || line.trim().startsWith("• "))
            .slice(0, 5)
            .map((line) => line.trim().replace(/^[-•]\s*/, ""))
        : [];

      const result = await apiClient.createProject({
        name: projectName,
        type: "customer",
        owner: "当前用户",
        nextActions,
        tags: ["从对话创建"],
      });

      const createdId = (result.project as { id: string })?.id;
      if (createdId) {
        setProjectCreated(createdId);
        // 延迟跳转到新项目空间
        setTimeout(() => {
          window.location.href = `/projects/${createdId}`;
        }, 800);
      }
    } catch (err) {
      toast.error("创建项目失败", {
        description: err instanceof Error ? err.message : "请稍后重试，将跳转到项目列表",
      });
      // 降级：仍然跳转到项目列表
      window.location.href = "/projects";
    } finally {
      setCreatingProject(false);
    }
  }, [messages, creatingProject, projectCreated]);

  // 空状态
  if (messages.length === 0 && !streamingContent) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center mx-auto">
            <span className="text-primary text-sm font-bold">H</span>
          </div>
          <p className="text-hint text-sm">
            在下方输入你的需求，开始与 AI 对话
          </p>
        </div>
      </div>
    );
  }

  // 是否显示沉淀操作栏：流式结束 + 至少一轮对话（2 条消息）
  const showActionBar = !isStreaming && messages.length >= 2;

  return (
    <div className="max-h-[50vh] overflow-y-auto mb-4 space-y-4 px-1">
      <AnimatePresence initial={false}>
        {messages.map((msg) => {
          const isUser = msg.role === "user";

          return (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className={cn(
                "flex gap-2.5",
                isUser ? "justify-end" : "justify-start",
              )}
            >
              {/* AI 头像（H 字母，紫色小圆图标） */}
              {!isUser && (
                <div className="size-4 rounded-full bg-primary flex items-center justify-center shrink-0 mt-1">
                  <span className="text-[10px] font-bold text-primary-foreground leading-none">
                    H
                  </span>
                </div>
              )}

              {/* 消息气泡 */}
              <div
                className={cn(
                  "px-4 py-3 text-sm leading-relaxed break-words max-w-[80%]",
                  isUser
                    ? "bg-primary text-primary-foreground rounded-2xl rounded-tr-sm ml-auto"
                    : "bg-card border border-border rounded-2xl rounded-tl-sm text-foreground",
                )}
              >
                {isUser ? (
                  <span>{msg.content || "…"}</span>
                ) : (
                  <MarkdownRenderer content={msg.content || "…"} />
                )}
              </div>
            </motion.div>
          );
        })}

        {/* 流式输出中的 AI 消息气泡（未沉淀） */}
        {isStreaming && streamingContent && (
          <motion.div
            key="streaming-bubble"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-2.5 justify-start"
          >
            {/* AI 头像 */}
            <div className="size-4 rounded-full bg-primary flex items-center justify-center shrink-0 mt-1">
              <span className="text-[10px] font-bold text-primary-foreground leading-none">
                H
              </span>
            </div>

            {/* 流式气泡 + 光标 */}
            <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed text-foreground max-w-[80%]">
              <MarkdownRenderer content={streamingContent} />
              <span className="inline-block w-0.5 h-4 bg-primary animate-pulse ml-0.5 align-text-bottom" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 消息沉淀操作栏 */}
      <AnimatePresence>
        {showActionBar && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            className="flex items-center gap-1 pt-1"
          >
            <Button
              variant="ghost"
              size="xs"
              className="text-muted-foreground hover:text-foreground text-xs gap-1.5 h-7"
              onClick={handleSaveAsSkill}
              disabled={savingSkill}
            >
              {savingSkill ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : skillSaved ? (
                <CheckCircle2 className="size-3.5 text-success" />
              ) : (
                <Puzzle className="size-3.5" />
              )}
              {skillSaved ? "已沉淀" : "沉淀为技能"}
            </Button>

            <Button
              variant="ghost"
              size="xs"
              className="text-muted-foreground hover:text-foreground text-xs gap-1.5 h-7"
              onClick={handleCreateProject}
              disabled={creatingProject}
            >
              {creatingProject ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : projectCreated ? (
                <CheckCircle2 className="size-3.5 text-success" />
              ) : (
                <FolderPlus className="size-3.5" />
              )}
              {projectCreated ? "已创建" : "创建项目空间"}
            </Button>

            <Button
              variant="ghost"
              size="xs"
              className="text-danger hover:text-danger text-xs gap-1.5 h-7 ml-auto"
              onClick={onClearMessages}
            >
              <Trash2 className="size-3.5" />
              清空对话
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 自动滚底锚点 */}
      <div ref={bottomRef} />
    </div>
  );
}
