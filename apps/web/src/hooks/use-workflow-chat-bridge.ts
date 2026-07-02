"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useUiStore } from "@/stores/ui-store";
import {
  buildWorkflowSystemPrompt,
  extractIndustryPackSkills,
} from "@/lib/workflow-system-prompt-factory";

// ═══════════════════════════════════════════════════════════════════
// 类型导出
// ═══════════════════════════════════════════════════════════════════

/** 触发工作流的入参 */
export interface WorkflowTriggerParams {
  workflowId: string;
  workflowTitle: string;
  contextPayload: Record<string, unknown>;
  industryPackId?: string;
}

/** Hook 返回值 */
export interface WorkflowChatBridge {
  /** 触发工作流 → 调度任务 → 注入 systemPrompt → 跳转聊天页面 */
  triggerWorkflow: (
    params: WorkflowTriggerParams,
  ) => Promise<void>;
  /** 正在触发中（含 API 调用 + 资源加载 + 导航准备） */
  isTriggering: boolean;
  /** 最近一次触发失败的错误信息，成功时自动清零 */
  error: string | null;
}

// ═══════════════════════════════════════════════════════════════════
// 内部常量
// ═══════════════════════════════════════════════════════════════════

/** AbortController timeout for Industry Pack API calls (ms) */
const INDUSTRY_PACK_FETCH_TIMEOUT_MS = 3000;

/** Industry Pack 能力 API 基础路径 */
const INDUSTRY_PACK_API_PREFIX = "/api/industry-packs";

// ═══════════════════════════════════════════════════════════════════
// 纯函数：从 Industry Pack API 获取 manifest 并提取 skills
// ═══════════════════════════════════════════════════════════════════

/**
 * 带 AbortController timeout 的 fetch 封装。
 * 超时或网络错误时返回 null（调用方降级为空列表）。
 */
async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      console.warn(`[useWorkflowChatBridge] 请求超时 (${timeoutMs}ms): ${url}`);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 从 Industry Pack API 加载 manifest 并提取技能 ID 列表。
 *
 * 优先使用 /api/industry-packs/{packId}/capabilities（VIEWER 即可访问），
 * 回退到 /api/industry-packs/{packId}（需要 ADMIN）。
 * 超时 3s，失败不阻断主流程，返回空数组。
 */
async function fetchIndustryPackSkills(
  packId: string,
): Promise<string[]> {
  // 优先：capabilities 端点（低权限要求 + 轻量响应）
  const manifest = await fetchWithTimeout(
    `${INDUSTRY_PACK_API_PREFIX}/${encodeURIComponent(packId)}/capabilities`,
    INDUSTRY_PACK_FETCH_TIMEOUT_MS,
  );

  if (manifest) {
    const skills = extractIndustryPackSkills(manifest);
    if (skills.length > 0) return skills;
  }

  // 回退：直接获取 pack 安装记录（需要 ADMIN，可能 403）
  const packRecord = await fetchWithTimeout(
    `${INDUSTRY_PACK_API_PREFIX}/${encodeURIComponent(packId)}`,
    INDUSTRY_PACK_FETCH_TIMEOUT_MS,
  );

  if (packRecord) {
    return extractIndustryPackSkills(packRecord);
  }

  return [];
}

// ═══════════════════════════════════════════════════════════════════
// 纯函数：API 调用
// ═══════════════════════════════════════════════════════════════════

interface WorkflowRunResult {
  runId: string;
}

/**
 * Step 1：创建 WorkflowRun
 * POST /api/workflows/run → { success: true, data: { runId, status, output } }
 */
async function createWorkflowRun(
  workflowId: string,
  inputs: Record<string, unknown>,
): Promise<WorkflowRunResult> {
  const res = await fetch("/api/workflows/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workflowId, inputs }),
  });

  if (!res.ok) {
    let serverMsg = `启动工作流失败 (${res.status})`;
    try {
      const errBody = await res.json();
      if (errBody.error) serverMsg = errBody.error;
    } catch {
      /* ignore parse errors */
    }
    throw new Error(serverMsg);
  }

  const json: Record<string, unknown> = await res.json();
  const data = json.data as Record<string, unknown> | undefined;

  if (!data?.runId) {
    throw new Error("工作流响应缺少 runId");
  }

  return { runId: String(data.runId) };
}

/**
 * Step 2：将任务写入 Hermes 调度管线（写入 AuditLog + 派生 Task）
 * POST /api/tasks/dispatch → { success, data: { taskId, workflowRunId, status, ... } }
 *
 * 注：此端点使用 RBAC 中间件注入 workspaceId / userId，
 * 请求体只需传 inputText（对齐 TaskDispatchSchema），
 * Hermes 内部会自行派生 TaskEnvelope 与 WorkflowRun。
 */
async function dispatchWorkflowTask(
  workflowTriggerText: string,
): Promise<void> {
  const res = await fetch("/api/tasks/dispatch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      inputText: workflowTriggerText,
    }),
  });

  if (!res.ok) {
    let serverMsg = `任务调度失败 (${res.status})`;
    try {
      const errBody = await res.json();
      if (errBody.error) serverMsg = errBody.error;
    } catch {
      /* ignore parse errors */
    }
    throw new Error(serverMsg);
  }
}

// ═══════════════════════════════════════════════════════════════════
// Hook
// ═══════════════════════════════════════════════════════════════════

/**
 * 工作流聊天桥接 Hook
 *
 * 职责（对齐工作台重构契约）：
 * 1. 调用 POST /api/workflows/run 创建工作流运行实例
 * 2. 调用 POST /api/tasks/dispatch 写入审计与派生 Task
 * 3. 加载行业包 manifest → extractIndustryPackSkills()
 * 4. 调用 buildWorkflowSystemPrompt() 生成专业工作流级 systemPrompt
 * 5. 将 systemPrompt 注入 useUiStore.newTopicPendingSystemPrompt
 * 6. 跳转至 /workspace/chat 并携带 workflowRunId / workflowId / intent / industryPackId
 *
 * 约束：
 * - 所有外部请求必须有 try/catch
 * - Industry Pack API 调用必须设置 AbortController timeout 3s
 * - Industry Pack 获取失败不阻断主流程，降级为空 skills 列表
 * - systemPrompt 写入必须在 router.push 之前完成
 * - 跳转前必须先完成 /api/tasks/dispatch 写入
 * - 不在 Hook 内直接调用 LLM
 *
 * @example
 * ```tsx
 * const { triggerWorkflow, isTriggering, error } = useWorkflowChatBridge();
 *
 * await triggerWorkflow({
 *   workflowId: "wf-inquiry-grading",
 *   workflowTitle: "询盘智能分级",
 *   contextPayload: { inquiryId: "inq-123", workspaceId: "ws-1" },
 *   industryPackId: "foreign-trade",
 * });
 * ```
 */
export function useWorkflowChatBridge(): WorkflowChatBridge {
  const router = useRouter();
  const setNewTopicPendingSystemPrompt = useUiStore(
    (s) => s.setNewTopicPendingSystemPrompt,
  );

  const [isTriggering, setIsTriggering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isTriggeringRef = useRef(false);

  const triggerWorkflow = useCallback(
    async (params: WorkflowTriggerParams) => {
      const {
        workflowId,
        workflowTitle,
        contextPayload,
        industryPackId,
      } = params;

      if (isTriggeringRef.current) return;
      isTriggeringRef.current = true;

      setIsTriggering(true);
      setError(null);

      // ── Step 1: 启动工作流 ──────────────────────────────
      let runResult: WorkflowRunResult;

      try {
        runResult = await createWorkflowRun(workflowId, contextPayload);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "工作流启动失败";
        setError(msg);
        setIsTriggering(false);
        isTriggeringRef.current = false;
        return;
      }

      const { runId } = runResult;

      // ── Step 2: 加载行业包 manifest → 提取技能列表 ─────
      let industryPackSkills: string[] = [];

      if (industryPackId) {
        try {
          industryPackSkills = await fetchIndustryPackSkills(industryPackId);
        } catch (err) {
          console.warn(
            `[使用工作流聊天桥接] 加载行业包技能失败，降级为空技能列表:`,
            err,
          );
          industryPackSkills = [];
        }
      }

      // ── Step 3: 调度任务（写 AuditLog + 派生 Task） ─────
      const workflowTriggerText = `执行工作流「${workflowTitle}」`;

      try {
        await dispatchWorkflowTask(workflowTriggerText);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "任务调度写入失败";
        setError(msg);
        setIsTriggering(false);
        isTriggeringRef.current = false;
        return;
      }

      // ── Step 4: 构建专业工作流级 systemPrompt ───────────
      const systemPrompt = buildWorkflowSystemPrompt({
        workflowId,
        workflowTitle,
        industryPackId,
        industryPackSkills,
        contextPayload,
        workflowRunId: runId,
      });

      // ── Step 5: 注入 store（必须在跳转前）───────────────
      setNewTopicPendingSystemPrompt(systemPrompt);

      // ── Step 6: 跳转 ───────────────────────────────────
      const queryParams = new URLSearchParams({
        workflowRunId: runId,
        workflowId,
        intent: workflowId,
      });
      if (industryPackId) {
        queryParams.set("industryPackId", industryPackId);
      }
      router.push(`/workspace/chat?${queryParams.toString()}`);

      setIsTriggering(false);
      isTriggeringRef.current = false;
    },
    [router, setNewTopicPendingSystemPrompt],
  );

  return { triggerWorkflow, isTriggering, error };
}
