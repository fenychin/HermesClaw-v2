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
