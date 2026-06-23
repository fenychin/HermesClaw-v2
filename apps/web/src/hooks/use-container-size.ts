/**
 * useContainerSize — 容器尺寸监听 Hook
 *
 * 使用 ResizeObserver 追踪 DOM 容器尺寸变化。
 * 独立提取用于消除 use-knowledge-graph 和 use-nebula-render 中的重复逻辑。
 */
"use client"

import { useState, useEffect } from "react"

interface ContainerSize {
  width: number
  height: number
}

export function useContainerSize(
  containerRef: React.RefObject<HTMLDivElement | null> | undefined,
): ContainerSize {
  const [size, setSize] = useState<ContainerSize>({ width: 0, height: 0 })

  useEffect(() => {
    const container = containerRef?.current
    if (!container) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        if (width > 0 && height > 0) {
          setSize((prev) =>
            prev.width === Math.round(width) && prev.height === Math.round(height)
              ? prev
              : { width: Math.round(width), height: Math.round(height) },
          )
        }
      }
    })

    observer.observe(container)

    // 立即读取一次（ResizeObserver 首帧可能不触发）
    const rect = container.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) {
      setSize({ width: Math.round(rect.width), height: Math.round(rect.height) })
    }

    return () => observer.disconnect()
  }, [containerRef])

  return size
}
