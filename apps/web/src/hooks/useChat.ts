"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { apiClient } from "@/lib/api-client";
import { parseSSEStream } from "@/lib/sse-parser";
import { truncateTitle } from "@/lib/utils";
import { toast } from "sonner";
import {
  queuePendingConversation,
  getPendingCount,
  flushPendingConversations,
  getFlushFailures,
} from "@/lib/server/pending-conversations";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  trace?: any; // To store the reasoning trace object directly for display
}

/**
 * 流式对话 Hook
 * —— 封装 POST /api/chat 的 SSE 流读取（复用共享 parseSSEStream）、状态管理和中断控制。
 *    对话完成后自动持久化到数据库。
 *
 * @returns
 *  - messages         完整的对话消息列表
 *  - isStreaming      是否正在流式接收中
 *  - streamingContent 当前正在流式输出的文本（用于实时渲染）
 *  - error            最近的错误信息
 *  - sendMessage      发送一条用户消息并开始流式对话
 *  - stopStreaming    中断当前流式响应
 *  - clearMessages    清空对话历史
 *  - loadConversation 从数据库加载历史对话
 *  - pendingCount     本地待回放队列积压数（>0 表示有未同步的历史记录）
 *  - flushPending     手动触发回放（挂载/网络恢复/保存成功后自动，通常无需手动）
 */
export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [currentTrace, setCurrentTrace] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  /** 当前持久化对话 ID（ref 供回调闭包，state 供组件消费） */
  const conversationIdRef = useRef<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);

  // PERF: 用 ref 持有 messages 最新值，避免 sendMessage 因 messages 变化而重建，
  // 防止每条消息发送/接收后触发 CommandBox / QuickCards 全量重渲染
  const messagesRef = useRef<Message[]>(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // PERF: 同理，用 ref 持有 isStreaming 避免 sendMessage 在流式开始/结束时重建
  const isStreamingRef = useRef(isStreaming);
  useEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);

  /** 本地待回放队列积压数（lazy init 直接读 localStorage，避免 effect 同步 setState） */
  const [pendingCount, setPendingCount] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    return getPendingCount();
  });

  // 同步 count 的 flush 封装（含连续失败感知）
  const flush = useCallback(async () => {
    const startCount = getPendingCount();
    const flushed = await flushPendingConversations();
    const endCount = getPendingCount();

    if (startCount !== endCount) {
      setPendingCount(endCount);
    }

    if (flushed === 0 && getFlushFailures() >= 3) {
      toast.error("历史对话同步失败", {
        description: "已积压多条对话未同步，请检查网络后刷新页面",
      });
    }
  }, []);

  // 挂载时：尝试回放积压对话（计数已在 lazy init 就绪，此处只 flush）
  // flush 内部 setState 仅在异步成功后触发，非同步级联渲染
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    flush().catch(() => {});
  }, [flush]);

  // 网络恢复时：刷新计数并回放
  useEffect(() => {
    const onOnline = () => {
      setPendingCount(getPendingCount());
      flush().catch(() => {});
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [flush]);

  /**
   * 将当前对话持久化到数据库
   * —— 首次调用时创建 conversation，后续调用追加消息
   */
  const persistConversation = useCallback(
    async (userContent: string, assistantContent: string, traceObj?: any) => {
      try {
        if (!conversationIdRef.current) {
          const title = truncateTitle(userContent);
          const result = await apiClient.createConversation(title);
          conversationIdRef.current = result.conversation.id;
          setConversationId(result.conversation.id);
        }

        await apiClient.addMessage(
          conversationIdRef.current,
          "user",
          userContent,
        );
        try {
          await apiClient.addMessage(
            conversationIdRef.current,
            "assistant",
            assistantContent,
            traceObj,
          );
        } catch (assistantErr) {
          // 如果带 trace 保存消息失败，可能是因为 trace 数据在某些边界情况下不满足 Zod/数据库约束，
          // 此时采取 Fail-safe 策略：剥离 trace 并重新尝试仅保存 AI 的核心文本回复，以避免用户数据丢失。
          console.warn("[useChat] 带 trace 保存 assistant 消息失败，正在尝试无 trace 降级保存:", assistantErr);
          await apiClient.addMessage(
            conversationIdRef.current,
            "assistant",
            assistantContent,
          );
        }
        // 本次保存成功 → 尝试回放之前积压的失败对话 + 通知侧边栏/面板刷新
        flush().catch(() => {});
        window.dispatchEvent(new CustomEvent("conversation-saved"));
      } catch (err) {
        console.error("[useChat] persistConversation 失败", err);
        toast.error("对话保存失败", {
          description: "已暂存本地，网络恢复后自动同步",
        });
        // 两阶段写入可能部分失败（createConversation 成功但 addMessage 失败）
        // → 重置 conversationIdRef，避免下次追加到无消息的孤对话
        conversationIdRef.current = null;
        setConversationId(null);
        queuePendingConversation({
          userContent,
          assistantContent,
          time: Date.now(),
        });
        setPendingCount(getPendingCount());
      }
    },
    [flush],
  );

  const sendMessage = useCallback(
    async (content: string, systemPrompt?: string, modelId?: string) => {
      if (!content.trim() || isStreamingRef.current) return;

      const userMessage: Message = {
        id: Date.now().toString(),
        role: "user",
        content: content.trim(),
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsStreaming(true);
      setStreamingContent("");
      setError(null);

      abortControllerRef.current = new AbortController();

      let fullContent = "";
      let traceObj: any = undefined;

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [...messagesRef.current, userMessage].map((m) => ({
              role: m.role,
              content: m.content,
            })),
            systemPrompt,
            modelId,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          let serverMsg = `服务器错误 (${response.status})`;
          try { const errBody = await response.json(); if (errBody.error) serverMsg = errBody.error; } catch {}
          throw new Error(serverMsg);
        }
        if (!response.body) throw new Error("响应流为空");

        const reader = response.body.getReader();

        // 复用共享 SSE 解析器（替换手写 ReadableStream 读取）
        await parseSSEStream(reader, {
          onData: (json) => {
            const parsed = json as { text?: string; type?: string; trace?: any; reasoning?: string; error?: unknown };
            if (parsed.text) {
              fullContent += parsed.text;
              setStreamingContent(fullContent);
            } else if (parsed.reasoning) {
              if (traceObj && traceObj.steps && traceObj.steps.length > 0) {
                // 深拷贝确保触发 React 渲染
                const newTrace = JSON.parse(JSON.stringify(traceObj));
                // 将推理过程追加到最后一个步骤（模型推理与生成步骤）
                const lastStep = newTrace.steps[newTrace.steps.length - 1];
                lastStep.reasoning = (lastStep.reasoning || "") + parsed.reasoning;
                traceObj = newTrace;
                setCurrentTrace(newTrace);
              }
            } else if (parsed.type === "trace" && parsed.trace) {
              const newTrace = parsed.trace;
              if (traceObj && traceObj.steps && newTrace.steps) {
                newTrace.steps.forEach((newStep: any) => {
                  const oldStep = traceObj.steps.find(
                    (s: any) => s.id === newStep.id || s.type === newStep.type,
                  );
                  if (oldStep && oldStep.reasoning && !newStep.reasoning) {
                    newStep.reasoning = oldStep.reasoning;
                  }
                });
              }
              traceObj = newTrace;
              setCurrentTrace(traceObj);
            } else if (parsed.error) {
              const errMsg = typeof parsed.error === "string" ? parsed.error : JSON.stringify(parsed.error);
              setError(errMsg);
              abortControllerRef.current?.abort();
            }
          },
        });

        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: fullContent,
          timestamp: new Date(),
          trace: traceObj,
        };
        setMessages((prev) => [...prev, assistantMessage]);
        setStreamingContent("");
        setCurrentTrace(null);

        // 对话完成后持久化到数据库（后台异步，不阻塞 UI）
        void persistConversation(content.trim(), fullContent, traceObj);
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== "AbortError") {
          setError(err.message || "对话失败，请重试");
        }
        // 用户主动停止（AbortError）：持久化已接收的部分 AI 回复，避免丢失
        if (err instanceof Error && err.name === "AbortError" && fullContent) {
          const partialMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: fullContent,
            timestamp: new Date(),
            trace: traceObj,
          };
          setMessages((prev) => [...prev, partialMessage]);
          setStreamingContent("");
          setCurrentTrace(null);
          void persistConversation(content.trim(), fullContent, traceObj);
        }
      } finally {
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    },
    [persistConversation],
  );

  const stopStreaming = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    messagesRef.current = [];
    isStreamingRef.current = false;
    setStreamingContent("");
    setCurrentTrace(null);
    setError(null);
    conversationIdRef.current = null;
  }, []);

  /**
   * 从数据库加载历史对话（含重试）
   * —— 用于 /recent → /new?load= 跳转恢复会话
   */
  const loadConversation = useCallback(async (conversationId: string) => {
    setError(null);
    const MAX_RETRIES = 2;
    let lastErr: unknown;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const data = await apiClient.getConversation(conversationId);
        const conv = (data as { conversation: { id: string; messages: Array<{ id: string; role: string; content: string; createdAt: string }> } }).conversation;
        if (!conv?.messages) return;

        const loaded: Message[] = conv.messages.map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          timestamp: new Date(m.createdAt),
          trace: (m as any).trace || undefined,
        }));
        setMessages(loaded);
        setStreamingContent("");
        conversationIdRef.current = conv.id;
        setConversationId(conv.id);
        return; // 成功，退出
      } catch (err) {
        lastErr = err;
        if (attempt < MAX_RETRIES) {
          // 等待后重试（300ms 快速重试，减少导航等待感）
          await new Promise((r) => setTimeout(r, 300));
        }
      }
    }

    toast.error("加载对话失败", {
      description: lastErr instanceof Error ? lastErr.message : "请稍后重试",
    });
  }, []);

  const sendWorkflowRun = useCallback(
    async (agentId: string, input: string) => {
      if (!input.trim() || isStreamingRef.current) return;

      const userMessage: Message = {
        id: Date.now().toString(),
        role: "user",
        content: input.trim(),
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsStreaming(true);
      setStreamingContent("正在规划任务...");
      setError(null);
      setCurrentTrace(null);

      try {
        const response = await fetch("/api/workflow-runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId,
            input: input.trim(),
            idempotencyKey: `idem-${crypto.randomUUID()}`,
          }),
        });

        if (!response.ok) {
          let serverMsg = `启动工作流失败 (${response.status})`;
          try {
            const errBody = await response.json();
            if (errBody.error) serverMsg = errBody.error;
          } catch {}
          throw new Error(serverMsg);
        }

        const data = await response.json();
        const resData = data.data;
        if (!resData) throw new Error("启动工作流响应格式不正确");

        if (resData.status === "pending_approval") {
          setIsStreaming(false);
          setStreamingContent("");
          const assistantMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: `⚠️ 高危动作等待审批中...\n审批单号: ${resData.checkpointId}`,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, assistantMessage]);
          void persistConversation(input.trim(), assistantMessage.content);
          return;
        }

        const runId = resData.workflowRunId;
        if (!runId) throw new Error("未获取到工作流运行 ID");

        let completed = false;
        let pollCount = 0;
        const maxPolls = 180; // 3分钟

        while (!completed && pollCount < maxPolls) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          pollCount++;

          const statusRes = await fetch(`/api/workflow-runs/${runId}/status`);
          if (!statusRes.ok) continue;

          const statusData = await statusRes.json();
          const statusResult = statusData.data;
          if (!statusResult) continue;

          const status = statusResult.status;
          const progress = statusResult.progress;
          const currentNodeId = statusResult.currentNodeId;

          let displayMsg = `正在执行工作流 (ID: ${runId})...\n进度: ${progress}%\n`;
          if (currentNodeId) {
            displayMsg += `当前节点: ${currentNodeId}\n`;
          }
          if (statusResult.steps) {
            const stepDetails = statusResult.steps
              .map((s: any) => `- 节点 ${s.nodeId} (${s.nodeType}): ${s.status}`)
              .join("\n");
            displayMsg += `节点执行轨迹:\n${stepDetails}`;
          }

          setStreamingContent(displayMsg);

          if (status === "completed" || status === "failed" || status === "cancelled") {
            completed = true;
            setIsStreaming(false);
            setStreamingContent("");

            let finalContent = `工作流执行完成 (ID: ${runId})\n`;
            if (status === "failed") {
              finalContent = `❌ 工作流执行失败: ${statusResult.errorMessage || "未知错误"}\n`;
            } else if (status === "cancelled") {
              finalContent = `⚠️ 工作流已被取消\n`;
            }

            if (statusResult.steps) {
              const completedSteps = statusResult.steps.filter((s: any) => s.status === "completed");
              if (completedSteps.length > 0) {
                finalContent += `\n输出结果摘要:\n`;
                completedSteps.forEach((s: any) => {
                  if (s.outputData) {
                    finalContent += `\n**节点 ${s.nodeId} 输出:**\n${typeof s.outputData === "object" ? JSON.stringify(s.outputData, null, 2) : s.outputData}\n`;
                  }
                });
              }
            }

            const assistantMessage: Message = {
              id: (Date.now() + 1).toString(),
              role: "assistant",
              content: finalContent,
              timestamp: new Date(),
            };
            setMessages((prev) => [...prev, assistantMessage]);
            void persistConversation(input.trim(), finalContent);
          }
        }
      } catch (err: any) {
        setError(err.message || "工作流执行失败");
        setIsStreaming(false);
        setStreamingContent("");
      }
    },
    [isStreamingRef, persistConversation]
  );

  return {
    messages,
    isStreaming,
    streamingContent,
    error,
    sendMessage,
    sendWorkflowRun,
    stopStreaming,
    clearMessages,
    loadConversation,
    /** 当前持久化对话 ID（用于跨页面关联，如创建项目时链接对话） */
    conversationId,
    /** 本地待回放对话积压数（>0 表示有未同步的历史记录） */
    pendingCount,
    /** 手动触发回放（通常无需调用——挂载/网络恢复/每次保存成功自动触发） */
    flushPending: flush,
    currentTrace,
  };
}
