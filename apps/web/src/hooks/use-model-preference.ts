"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  SELECTABLE_MODELS,
  DEFAULT_MODEL_ID,
  type SelectableModel,
} from "@/config/models";

const LS_MODEL_KEY = "hermes-selected-model";

/** 从 localStorage 恢复上次选择的模型 ID（仅客户端可用） */
function loadSavedModel(): string {
  try {
    if (typeof window === "undefined") return DEFAULT_MODEL_ID;
    const saved = localStorage.getItem(LS_MODEL_KEY);
    if (saved && SELECTABLE_MODELS.some((m) => m.id === saved && m.available)) {
      return saved;
    }
  } catch { /* localStorage 不可用时忽略 */ }
  return DEFAULT_MODEL_ID;
}

export interface UseModelPreferenceReturn {
  /** 当前选中的模型 ID */
  selectedModelId: string;
  /** 设置模型并持久化到 localStorage */
  setSelectedModelId: (id: string) => void;
  /** 模型变更回调（含 localStorage 持久化），直接传给 CommandBox.onModelChange */
  handleModelChange: (modelId: string) => void;
  /** 获取选中模型的 API modelId（传给 /api/chat） */
  getApiModelId: () => string | undefined;
  /** 可选模型列表（暴露给调用方检查可用性） */
  models: SelectableModel[];
}

/**
 * 模型选择偏好 Hook
 * —— 管理当前选中的模型 ID，从 localStorage 恢复并持久化。
 *    供 /new 页面和 project-chat 组件共用，消除重复。
 *
 *  水合安全：初始值固定为 DEFAULT_MODEL_ID（SSR/CSR 一致），
 *  localStorage 恢复延迟到 useEffect（仅客户端执行）。
 *
 * @param syncToExternal 可选的回调，当模型变更时同步到外部 store（如 Zustand）
 */
export function useModelPreference(syncToExternal?: (id: string) => void): UseModelPreferenceReturn {
  // 固定初始值保证 SSR/CSR 首帧一致，避免水合报错
  const [selectedModelId, setSelectedModelIdState] = useState<string>(DEFAULT_MODEL_ID);
  const syncRef = useRef(syncToExternal);

  // 保持 syncToExternal 引用最新
  useEffect(() => {
    syncRef.current = syncToExternal;
  });

  // 挂载后：从 localStorage 恢复 + 同步到外部 store（仅客户端执行）
  useEffect(() => {
    const saved = loadSavedModel();
    if (saved !== DEFAULT_MODEL_ID) {
      // queueMicrotask 延迟 setState：避免 effect 内同步 setState 触发 ESLint 告警，
      // 同时保证在下一帧渲染前完成更新，用户无闪烁
      queueMicrotask(() => {
        setSelectedModelIdState(saved);
        syncRef.current?.(saved);
      });
    }
  }, []);

  const persistAndSync = useCallback((modelId: string) => {
    setSelectedModelIdState(modelId);
    try { localStorage.setItem(LS_MODEL_KEY, modelId); } catch { /* noop */ }
    syncRef.current?.(modelId);
  }, []);

  const handleModelChange = persistAndSync;
  const setSelectedModelId = persistAndSync;

  const getApiModelId = useCallback(() => {
    const model = SELECTABLE_MODELS.find((m) => m.id === selectedModelId);
    return model?.modelId;
  }, [selectedModelId]);

  return {
    selectedModelId,
    setSelectedModelId,
    handleModelChange,
    getApiModelId,
    models: SELECTABLE_MODELS,
  };
}
