"use client";

import { useSyncExternalStore } from "react";

/** 空订阅：挂载态不会变化，无需监听外部变更 */
const emptySubscribe = () => () => {};

/**
 * 判断是否已在客户端挂载，用于规避 SSR 水合不一致。
 * 使用 useSyncExternalStore 区分服务端 / 客户端快照，
 * 避免在 effect 中同步 setState（符合 React 19 规则）。
 */
export function useMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true, // 客户端快照
    () => false, // 服务端快照
  );
}
