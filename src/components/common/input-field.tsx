"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================
// 共享类型
// ============================================================

export interface InputFieldDef {
  key: string
  label: string
  /** 输入类型（仅 text / textarea / select 有视觉呈现，其余类型回退为 text） */
  type: string
  required?: boolean
  placeholder?: string
  options?: { label: string; value: string }[]
}

// ============================================================
// InputField 组件
// ============================================================

/**
 * 通用输入控件（text / textarea / select）
 * —— 供工作流执行器、询盘快捷入口、设置页等所有业务表单复用
 */
export function InputField({
  input,
  value,
  onChange,
  disabled,
}: {
  input: InputFieldDef
  value: string
  onChange: (key: string, value: string) => void
  disabled?: boolean
}) {
  const baseClass = cn(
    "w-full bg-background border border-border rounded-xl px-3 py-2",
    "text-foreground text-sm placeholder:text-hint",
    "focus:outline-none focus:border-primary/60 transition-colors",
    disabled && "opacity-50 cursor-not-allowed",
  );

  if (input.type === "textarea") {
    return (
      <div className="space-y-1.5">
        <label className="text-muted-foreground text-xs font-medium">
          {input.label}
          {input.required && <span className="text-danger ml-0.5">*</span>}
        </label>
        <textarea
          rows={4}
          placeholder={input.placeholder}
          value={value}
          onChange={(e) => onChange(input.key, e.target.value)}
          disabled={disabled}
          className={cn(baseClass, "resize-none")}
        />
      </div>
    );
  }

  if (input.type === "select") {
    return (
      <div className="space-y-1.5">
        <label className="text-muted-foreground text-xs font-medium">
          {input.label}
          {input.required && <span className="text-danger ml-0.5">*</span>}
        </label>
        <div className="relative">
          <select
            value={value}
            onChange={(e) => onChange(input.key, e.target.value)}
            disabled={disabled}
            className={cn(baseClass, "appearance-none cursor-pointer pr-8")}
          >
            <option value="">请选择...</option>
            {input.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 size-3.5 text-hint pointer-events-none" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <label className="text-muted-foreground text-xs font-medium">
        {input.label}
        {input.required && <span className="text-danger ml-0.5">*</span>}
      </label>
      <input
        type="text"
        placeholder={input.placeholder}
        value={value}
        onChange={(e) => onChange(input.key, e.target.value)}
        disabled={disabled}
        className={baseClass}
      />
    </div>
  );
}
