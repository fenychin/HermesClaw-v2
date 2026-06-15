import React, { type ReactNode } from "react"

interface SkeletonListProps {
  /** 骨架条目数 */
  count: number
  /** 每项骨架渲染函数，接收 0-based index */
  children: (index: number) => ReactNode
}

/**
 * 骨架列表占位组件
 * —— 消除 Array.from({ length: N }) 的重复样板
 * —— 用于加载中状态的骨架屏列表渲染
 *
 * @example
 *   <SkeletonList count={5}>
 *     {(i) => <Skeleton key={i} className="h-12 w-full rounded-xl mb-2" />}
 *   </SkeletonList>
 */
export function SkeletonList({ count, children }: SkeletonListProps) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <React.Fragment key={i}>
          {children(i)}
        </React.Fragment>
      ))}
    </>
  )
}
