"use client";

import { useState, useEffect, useRef } from "react";
import {
  Bot,
  User,
  Paperclip,
  Mic,
  Link as LinkIcon,
  AtSign,
  Hash,
  Slash,
  ArrowUp,
  Compass,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  sender?: string;
  content: string;
  time: string;
}

interface ChatSession {
  id: string;
  title: string;
  time: string;
  messages: ChatMessage[];
}

interface ProjectChatProps {
  activeSession: ChatSession;
  setSessions: React.Dispatch<React.SetStateAction<ChatSession[]>>;
}

/**
 * ProjectChat 组件
 * 负责中间栏的会话主体。宽度限定为 w-full max-w-2xl mx-auto
 * 输入对话框采用与新话题 CommandBox 完全一致的设计风格与大小
 */
export function ProjectChat({
  activeSession,
  setSessions,
}: ProjectChatProps) {
  const [inputValue, setInputValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 自动滚动到最新消息
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeSession.messages]);

  // 发送消息
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}-u`,
      role: "user",
      content: inputValue.trim(),
      time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
    };

    // 更新消息流，并模拟 AI 的应答
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id === activeSession.id) {
          return {
            ...s,
            messages: [...s.messages, userMsg],
          };
        }
        return s;
      })
    );

    setInputValue("");

    // 自动重置高度
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    // 延迟 1 秒追加助理应答
    setTimeout(() => {
      const assistantMsg: ChatMessage = {
        id: `msg-${Date.now()}-a`,
        role: "assistant",
        sender: "HermesClaw",
        content: "收到您的指令。我已获取右侧配置面板中的系统指令限制（can_do / cannot_do 规则）与关联的参考文件作为上下文，正在为您在后台进行处理。",
        time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
      };

      setSessions((prev) =>
        prev.map((s) => {
          if (s.id === activeSession.id) {
            const isTempTitle = s.title.startsWith("新开会话") || s.title === "新开会话...";
            const newTitle = isTempTitle 
              ? (userMsg.content.length > 18 ? userMsg.content.slice(0, 16) + "..." : userMsg.content)
              : s.title;

            return {
              ...s,
              title: newTitle,
              messages: [...s.messages, assistantMsg],
            };
          }
          return s;
        })
      );
    }, 1000);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e);
    }
  };

  // 动态调整文本域高度
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.max(80, el.scrollHeight)}px`;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden p-6">
      {/* 限制宽度的双向排布 */}
      <div className="w-full max-w-2xl mx-auto flex flex-col flex-1 min-h-0 space-y-4">
        
        {/* 顶部欢迎或状态条 */}
        <PageHeader
          title="项目智能会话"
          description="与专属智能员工实时联通"
        />

        {/* 对话气泡滚动区域 */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin">
          {activeSession.messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[320px] text-center space-y-3">
              <div className="bg-accent/40 size-12 rounded-full flex items-center justify-center">
                <Compass className="size-6 text-muted-foreground animate-pulse" />
              </div>
              <div>
                <h4 className="text-foreground text-sm font-semibold">在此项目空间开始会话</h4>
                <p className="text-muted-foreground text-xs max-w-[280px] mt-1 leading-relaxed">
                  在下方输入框发送问题或指令。HermesClaw 将结合右侧的 Prompt 约束和绑定资料库解答。
                </p>
              </div>
            </div>
          ) : (
            activeSession.messages.map((msg) => {
              const isAI = msg.role === "assistant";
              return (
                <div
                  key={msg.id}
                  className={cn(
                    "flex gap-3 max-w-[85%]",
                    isAI ? "justify-start" : "justify-end ml-auto"
                  )}
                >
                  {isAI && (
                    <div className="bg-primary size-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                      <Bot className="size-4 text-white" />
                    </div>
                  )}
                  <div
                    className={cn(
                      "rounded-2xl p-4 text-xs leading-relaxed shadow-sm border",
                      isAI
                        ? "bg-card border-border text-foreground rounded-tl-xs"
                        : "bg-primary border-primary text-white rounded-tr-xs"
                    )}
                  >
                    {isAI && (
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="font-semibold text-primary">{msg.sender}</span>
                        <span className="text-hint text-[9px] scale-90">数字员工</span>
                      </div>
                    )}
                    <p className="whitespace-pre-line">{msg.content}</p>
                    <span
                      className={cn(
                        "block text-[9px] mt-2 text-right font-light",
                        isAI ? "text-hint" : "text-white/60"
                      )}
                    >
                      {msg.time}
                    </span>
                  </div>
                  {!isAI && (
                    <div className="bg-accent size-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 border border-border">
                      <User className="size-4 text-muted-foreground" />
                    </div>
                  )}
                </div>
              );
            })
          )}
          <div ref={chatEndRef} />
        </div>

        {/* 核心对话输入框 (高度模拟 CommandBox，保持大小与设计风格一致) */}
        <div className="shrink-0 pb-2">
          {/* 对话输入卡片 */}
          <form
            onSubmit={handleSendMessage}
            className={cn(
              "bg-card rounded-card border p-5 transition-all relative flex flex-col gap-2",
              isFocused
                ? "ring-1 ring-primary/40 border-primary/40"
                : "border-border hover:border-hint/60"
            )}
          >
            <p className="text-muted-foreground text-sm mb-2 select-none">
              今天要完成什么？
            </p>
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={handleInput}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              onKeyDown={handleKeyDown}
              placeholder="输入需求、粘贴询盘、@调用智能体…"
              rows={1}
              className="w-full min-h-[80px] resize-none bg-transparent text-foreground placeholder:text-hint text-sm outline-none border-none leading-relaxed"
            />

            {/* 底部工具栏 */}
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="text-hint hover:text-foreground hover:bg-accent rounded-lg p-1.5 transition-colors"
                  title="上传附件"
                >
                  <Paperclip className="size-4" />
                </button>
                <button
                  type="button"
                  className="text-hint hover:text-foreground hover:bg-accent rounded-lg p-1.5 transition-colors"
                  title="语音输入"
                >
                  <Mic className="size-4" />
                </button>
                <button
                  type="button"
                  className="text-hint hover:text-foreground hover:bg-accent rounded-lg p-1.5 transition-colors"
                  title="粘贴链接"
                >
                  <LinkIcon className="size-4" />
                </button>
                <button
                  type="button"
                  className="text-hint hover:text-foreground hover:bg-accent rounded-lg p-1.5 transition-colors"
                  title="@ 智能体"
                >
                  <AtSign className="size-4" />
                </button>
                <button
                  type="button"
                  className="text-hint hover:text-foreground hover:bg-accent rounded-lg p-1.5 transition-colors"
                  title="# 项目空间"
                >
                  <Hash className="size-4" />
                </button>
                <button
                  type="button"
                  className="text-hint hover:text-foreground hover:bg-accent rounded-lg p-1.5 transition-colors"
                  title="/ 命令"
                >
                  <Slash className="size-4" />
                </button>
              </div>

              <Button
                type="submit"
                disabled={!inputValue.trim()}
                size="icon"
                className="size-8 rounded-lg bg-primary hover:bg-primary/80 text-primary-foreground flex items-center justify-center shrink-0"
                title="发送"
              >
                <ArrowUp className="size-4" />
              </Button>
            </div>
          </form>
        </div>

      </div>
    </div>
  );
}
