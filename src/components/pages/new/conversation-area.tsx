"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Puzzle,
  FolderPlus,
  Trash2,
} from "lucide-react";
import type { Message } from "@/hooks/useChat";
import { MarkdownRenderer } from "@/components/common/markdown-renderer";

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

  // 自动滚底
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

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
                  <span className="text-[10px] font-bold text-white leading-none">
                    H
                  </span>
                </div>
              )}

              {/* 消息气泡 */}
              <div
                className={cn(
                  "px-4 py-3 text-sm leading-relaxed break-words max-w-[80%]",
                  isUser
                    ? "bg-violet-600 text-white rounded-2xl rounded-tr-sm ml-auto"
                    : "bg-[#18181B] border border-[#2A2A31] rounded-2xl rounded-tl-sm text-foreground",
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
              <span className="text-[10px] font-bold text-white leading-none">
                H
              </span>
            </div>

            {/* 流式气泡 + 光标 */}
            <div className="bg-[#18181B] border border-[#2A2A31] rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed text-foreground max-w-[80%]">
              <MarkdownRenderer content={streamingContent} />
              <span className="inline-block w-0.5 h-4 bg-violet-400 animate-pulse ml-0.5 align-text-bottom" />
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
              onClick={() => console.log("沉淀为技能", messages)}
            >
              <Puzzle className="size-3.5" />
              沉淀为技能
            </Button>

            <Button
              variant="ghost"
              size="xs"
              className="text-muted-foreground hover:text-foreground text-xs gap-1.5 h-7"
              onClick={() => {
                window.location.href = "/projects";
              }}
            >
              <FolderPlus className="size-3.5" />
              创建项目空间
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
