import { useState } from 'react'

/**
 * 复制文本到剪贴板的 Hook
 * @param timeout 复制成功后的提示持续时间（毫秒）
 */
export function useClipboard(timeout = 2000) {
  const [copied, setCopied] = useState(false)

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), timeout)
    } catch (err) {
      console.error('Failed to copy: ', err)
    }
  }

  return { copied, copy }
}
