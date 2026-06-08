"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Bot, User } from "lucide-react";
import type { ChatMessage } from "@/types/chat";

interface ChatMessagesProps {
  messages: ChatMessage[];
  isStreaming?: boolean;
}

/**
 * 对话气泡列表
 * —— 用户消息右对齐，AI 消息左对齐，自动滚底。
 *    流式输出时 AI 消息底部有闪烁光标。
 */
export function ChatMessages({ messages, isStreaming }: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // 自动滚底
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 空状态
  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-2">
          <Bot className="size-10 text-hint mx-auto" />
          <p className="text-hint text-sm">在下方输入你的需求，开始与 AI 对话</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-1 py-4 space-y-4">
      <AnimatePresence initial={false}>
        {messages.map((msg, i) => {
          const isUser = msg.role === "user";
          const isLast = i === messages.length - 1;
          const isStreamingLast = isLast && !isUser && isStreaming;

          return (
            <motion.div
              key={`msg-${i}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}
            >
              {/* AI 头像 */}
              {!isUser && (
                <div className="size-7 rounded-lg bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="size-4 text-primary" />
                </div>
              )}

              {/* 消息气泡 */}
              <div
                className={cn(
                  "max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
                  "whitespace-pre-wrap break-words",
                  isUser
                    ? "bg-accent text-foreground rounded-br-lg"
                    : "bg-card border border-border text-foreground rounded-bl-lg",
                )}
              >
                {msg.content || (isStreamingLast ? "" : "…")}
                {/* 流式输出闪烁光标 */}
                {isStreamingLast && (
                  <span className="inline-block w-0.5 h-4 bg-primary ml-0.5 align-text-bottom animate-pulse" />
                )}
              </div>

              {/* 用户头像 */}
              {isUser && (
                <div className="size-7 rounded-lg bg-accent flex items-center justify-center shrink-0 mt-0.5">
                  <User className="size-4 text-muted-foreground" />
                </div>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* 自动滚底锚点 */}
      <div ref={bottomRef} />
    </div>
  );
}
