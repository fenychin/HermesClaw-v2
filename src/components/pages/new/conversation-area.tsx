"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Puzzle,
  FolderPlus,
  Trash2,
  Loader2,
  CheckCircle2,
  ArrowUpRight,
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
  const router = useRouter();

  // 沉淀为技能 / 创建项目 — 异步状态
  const [savingSkill, setSavingSkill] = useState(false);
  const [createdSkillId, setCreatedSkillId] = useState<string | null>(null);
  const [creatingProject, setCreatingProject] = useState(false);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);

  // 自动滚底
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  /** 沉淀为技能：收集对话内容，创建技能记录 */
  const handleSaveAsSkill = useCallback(async () => {
    if (savingSkill || createdSkillId) return;
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

      const result = await apiClient.createSkill({
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

      const skill = (result as { skill?: { id?: string } }).skill;
      const skillId = skill?.id;
      if (skillId) {
        setCreatedSkillId(skillId);
      } else {
        setCreatedSkillId("__no_id__"); // 成功但无 ID，仍展示成功态
      }
      toast.success("技能已沉淀", {
        description: `「${skillName}」已保存至智慧大脑`,
      });
    } catch (err) {
      toast.error("沉淀技能失败", {
        description: err instanceof Error ? err.message : "请稍后重试",
      });
    } finally {
      setSavingSkill(false);
    }
  }, [messages, savingSkill, createdSkillId]);

  /** 创建项目空间：从对话内容提取关键信息并创建项目 */
  const handleCreateProject = useCallback(async () => {
    if (creatingProject || createdProjectId) return;
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

      const project = (result as { project?: { id?: string } }).project;
      const projectId = project?.id;
      if (projectId) {
        setCreatedProjectId(projectId);
        toast.success("项目已创建", {
          description: `「${projectName}」已创建，点击"查看项目"进入`,
        });
      } else {
        toast.error("项目创建异常", {
          description: "未获取到项目 ID，请查看项目列表",
        });
      }
    } catch (err) {
      toast.error("创建项目失败", {
        description: err instanceof Error ? err.message : "请稍后重试",
      });
    } finally {
      setCreatingProject(false);
    }
  }, [messages, creatingProject, createdProjectId]);

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
    // 跟随父容器高度（max-h-[30vh]），不主动撑开；内容溢出时内部滚动
    <div className="h-full overflow-y-auto">
      <div className="space-y-6 py-3">
        <AnimatePresence initial={false}>
          {messages.map((msg) => {
            const isUser = msg.role === "user";

            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className={cn("flex", isUser ? "justify-end" : "justify-start")}
              >
                {isUser ? (
                  // 用户消息：右对齐灰色气泡
                  <div className="max-w-[85%] rounded-2xl bg-accent px-4 py-2.5 text-sm leading-relaxed text-foreground break-words whitespace-pre-wrap">
                    {msg.content || "…"}
                  </div>
                ) : (
                  // AI 消息：全宽、无边框、纯 Markdown
                  <div className="w-full min-w-0 text-sm leading-relaxed text-foreground break-words">
                    <MarkdownRenderer content={msg.content || "…"} />
                  </div>
                )}
              </motion.div>
            );
          })}

          {/* 流式输出中的 AI 消息（全宽 + 光标） */}
          {isStreaming && streamingContent && (
            <motion.div
              key="streaming-bubble"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-start"
            >
              <div className="w-full min-w-0 text-sm leading-relaxed text-foreground break-words">
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
              onClick={createdSkillId ? () => router.push("/brain/skills") : handleSaveAsSkill}
              disabled={savingSkill}
            >
              {savingSkill ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : createdSkillId ? (
                <CheckCircle2 className="size-3.5 text-success" />
              ) : (
                <Puzzle className="size-3.5" />
              )}
              {savingSkill
                ? "沉淀中…"
                : createdSkillId
                  ? "已沉淀"
                  : "沉淀为技能"}
            </Button>
            {createdSkillId && (
              <Button
                variant="ghost"
                size="xs"
                className="text-brand-blue hover:text-brand-blue/80 text-xs gap-1 h-7"
                onClick={() => router.push("/brain/skills")}
              >
                查看技能
                <ArrowUpRight className="size-3" />
              </Button>
            )}

            <Button
              variant="ghost"
              size="xs"
              className="text-muted-foreground hover:text-foreground text-xs gap-1.5 h-7"
              onClick={createdProjectId ? () => router.push(`/projects/${createdProjectId}`) : handleCreateProject}
              disabled={creatingProject}
            >
              {creatingProject ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : createdProjectId ? (
                <CheckCircle2 className="size-3.5 text-success" />
              ) : (
                <FolderPlus className="size-3.5" />
              )}
              {creatingProject
                ? "创建中…"
                : createdProjectId
                  ? "已创建"
                  : "创建项目空间"}
            </Button>
            {createdProjectId && (
              <Button
                variant="ghost"
                size="xs"
                className="text-brand-blue hover:text-brand-blue/80 text-xs gap-1 h-7"
                onClick={() => router.push(`/projects/${createdProjectId}`)}
              >
                查看项目
                <ArrowUpRight className="size-3" />
              </Button>
            )}

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
    </div>
  );
}
