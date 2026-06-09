"use client";

import { useEffect, useRef, KeyboardEvent } from "react";
import { Paperclip, Mic, Globe, AtSign } from "lucide-react";

/**
 * NewPageInput 组件的 Props 定义
 */
interface NewPageInputProps {
  /** 输入框的当前文本值 */
  value: string;
  /** 文本值改变时的回调函数 */
  onChange: (val: string) => void;
  /** 提交输入内容时的回调函数 */
  onSubmit: () => void;
  /** 组件是否处于禁用状态 */
  disabled?: boolean;
}

/**
 * 核心输入框组件
 * 提供一个圆角大卡片容器，内含自动高度文本框及工具栏按钮
 */
export function NewPageInput({
  value,
  onChange,
  onSubmit,
  disabled = false,
}: NewPageInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 监听输入值变化自动调整高度，介于 3 行到 12 行之间
  // 行高大约为 24px，3 行最小高度 72px，12 行最大高度 288px
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const newHeight = Math.min(Math.max(72, el.scrollHeight), 288);
    el.style.height = `${newHeight}px`;
  }, [value]);

  // 处理键盘回车发送（Shift + Enter 换行，Enter 发送）
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !disabled) {
        onSubmit();
      }
    }
  };

  const canSubmit = value.trim().length > 0 && !disabled;

  return (
    <div className="bg-card rounded-3xl border border-border p-4 shadow-lg transition-colors focus-within:border-primary/40">
      {/* 多行输入框，无边框与聚焦蓝色边框 */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="向 HermesClaw 发起任务、对话或创建项目..."
        disabled={disabled}
        className="w-full min-h-[72px] max-h-[288px] overflow-y-auto border-0 bg-transparent resize-none focus:ring-0 focus-visible:ring-0 focus:outline-none text-foreground text-base leading-relaxed placeholder:text-muted-foreground disabled:opacity-60"
        rows={3}
      />

      {/* 底部工具栏 */}
      <div className="flex justify-between items-center mt-3">
        {/* 左侧图标组 */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground transition-colors outline-none cursor-pointer"
            title="添加附件"
            disabled={disabled}
          >
            <Paperclip size={18} />
          </button>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground transition-colors outline-none cursor-pointer"
            title="语音输入"
            disabled={disabled}
          >
            <Mic size={18} />
          </button>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground transition-colors outline-none cursor-pointer"
            title="粘贴链接"
            disabled={disabled}
          >
            <Globe size={18} />
          </button>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground transition-colors outline-none cursor-pointer"
            title="@ 智能体"
            disabled={disabled}
          >
            <AtSign size={18} />
          </button>
        </div>

        {/* 右侧发送按钮 */}
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          className="bg-primary hover:bg-primary/90 disabled:bg-primary/45 rounded-xl px-4 py-1.5 text-white text-sm font-medium transition-all cursor-pointer disabled:cursor-not-allowed"
        >
          发送
        </button>
      </div>
    </div>
  );
}
