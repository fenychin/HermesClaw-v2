import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 截断文本为标题（默认 50 字）
 * —— 供 topics/useChat 等多处复用，消除重复的截断逻辑。
 */
export function truncateTitle(text: string, max = 50): string {
  return text.length > max ? text.slice(0, max) + "…" : text
}

/**
 * 使用 Intl.NumberFormat 格式化文件大小（字节 → 人类可读）
 * —— 统一入口，禁止在组件中重复定义（CLAUDE.md §4 / AGENTS.md §4.14）
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const size = bytes / Math.pow(k, i)
  return new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: size < 10 ? 1 : 0,
  }).format(size) + " " + units[i]
}
