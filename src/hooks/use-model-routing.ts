"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ==============================
// 类型定义
// ==============================

/** 任务类型（与 model-router.ts TaskType 对齐） */
export type TaskType = "chat" | "workflow" | "analysis" | "generation";
/** Provider 标识 */
export type LlmProvider = "anthropic" | "deepseek";

/** 模型路由配置 */
export interface ModelRoutingSettings {
  /** 默认模型（路由 fallback） */
  defaultModel: string;
  /** 各 taskType 的 Provider 偏好 */
  taskProviderMap: Partial<Record<TaskType, LlmProvider>>;
}

// ==============================
// API 调用
// ==============================

async function fetchModelRouting(): Promise<ModelRoutingSettings> {
  const res = await fetch("/api/workspace/settings");
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? "获取模型路由配置失败");
  return json.data as ModelRoutingSettings;
}

async function updateModelRouting(
  payload: ModelRoutingSettings,
): Promise<ModelRoutingSettings> {
  const res = await fetch("/api/workspace/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? "保存模型路由配置失败");
  return json.data as ModelRoutingSettings;
}

// ==============================
// TanStack Query Hooks
// ==============================

/** 读取模型路由配置 */
export function useModelRouting() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["model-routing"],
    queryFn: fetchModelRouting,
    staleTime: 60_000,
  });
  return { settings: data ?? null, isLoading, error };
}

/** 更新模型路由配置 mutation */
export function useUpdateModelRouting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ModelRoutingSettings) => updateModelRouting(payload),
    onSuccess: (data) => {
      queryClient.setQueryData(["model-routing"], data);
      queryClient.invalidateQueries({ queryKey: ["model-routing"] });
    },
  });
}
