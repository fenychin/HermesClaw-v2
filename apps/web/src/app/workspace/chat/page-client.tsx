"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageTransition } from "@/components/common/PageTransition";
import { CommandBox } from "@/components/pages/new/command-box";
import { QuickCards } from "@/components/pages/new/quick-cards";
import { QuickWorkflowForm } from "@/components/pages/new/quick-workflow-form";
import { QuickTaskPanel } from "@/components/pages/new/quick-task-panel";
import { ConversationArea } from "@/components/pages/new/conversation-area";
import { SuggestionPanel } from "@/components/pages/new/suggestion-panel";
import { RecentPanel } from "@/components/pages/new/recent-panel";
import { RiskConfirmDialog } from "@/components/pages/new/risk-confirm-dialog";
import { TaskDispatchBanner } from "@/components/pages/new/task-dispatch-banner";
import { IndustryPackReminder } from "@/components/pages/new/industry-pack-reminder";
import { IndustryPackBadge } from "@/components/pages/new/industry-pack-badge";
import { WorkflowContextConfirmCard } from "@/components/pages/new/workflow-context-confirm-card";
import { useChat } from "@/hooks/useChat";
import { SELECTABLE_MODELS } from "@/config/models";
import { useUiStore } from "@/stores/ui-store";
import { useAgentStore } from "@/stores/agent-store";
import { ModelSelectorInline } from "@/components/workspace/ModelSelectorInline";
import { useModelPreference } from "@/hooks/use-model-preference";
import { toast } from "sonner";
import { NewAgentDialog } from "@/app/workspace/agents/_components/new-agent-dialog";

// 翻译用的能力常量映射
const AVAILABLE_SKILLS = [
  { id: "ft-inquiry-sorter", label: "邮件解析与询盘分拣" },
  { id: "ft-inquiry-grading", label: "询盘智能分级" },
  { id: "ft-inquiry-priority", label: "询盘优先级评估" },
  { id: "ft-outreach-email", label: "自动开发信生成" },
  { id: "ft-customer-profiling", label: "客户画像分析" },
  { id: "ft-cost-accounting", label: "产品参数提取与成本核算" },
  { id: "ft-quote-generator", label: "外贸报价生成与优化" },
  { id: "ft-document-parsing", label: "单证解析与合规检查" },
  { id: "ft-follow-up-crm", label: "客户跟进管理与 CRM 同步" },
  { id: "ft-competitor-analysis", label: "竞品分析与市场画像" }
];

const AVAILABLE_CONNECTORS = [
  { id: "email-connector", label: "邮件收发连接器" }
];

/**
 * 新话题页面（超级入口）— PRD §10.2
 * —— 简约居中布局：输入框 + 双排快捷入口 | 右侧 AI 建议
 * —— 支持 ?load=conversationId 自动加载历史对话（从 /recent 跳转）
 */
export default function NewTopicPage() {
  return (
    <Suspense fallback={null}>
      <NewTopicPageInner />
    </Suspense>
  );
}

function NewTopicPageInner() {
  const router = useRouter();
  const {
    messages,
    isStreaming,
    streamingContent,
    error,
    conversationId,
    sendMessage,
    stopStreaming,
    clearMessages,
    loadConversation,
    currentTrace,
  } = useChat();

  // 从 Zustand ui-store 读取/写入输入态（PRD §10.2 要求）
  const input = useUiStore((s) => s.newTopicInput);
  const setInput = useUiStore((s) => s.setNewTopicInput);
  const pendingSystemPrompt = useUiStore((s) => s.newTopicPendingSystemPrompt);
  const setPendingSystemPrompt = useUiStore((s) => s.setNewTopicPendingSystemPrompt);
  const clearNewTopicInput = useUiStore((s) => s.clearNewTopicInput);
  const storeSetModelId = useUiStore((s) => s.setNewTopicModelId);

  // 模型选择偏好 Hook（localStorage 恢复 + 持久化，同步到 Zustand ui-store）
  const { selectedModelId, handleModelChange, getApiModelId } = useModelPreference(
    storeSetModelId,
  );

  // 从 /recent 点击跳转时通过 ?load=conversationId 自动加载历史对话
  const searchParams = useSearchParams();
  useEffect(() => {
    const loadId = searchParams.get("load");
    if (loadId) {
      loadConversation(loadId);
    }
  }, [searchParams, loadConversation]);

  // 从其他页面（如智能体仓库）点击对话跳转时通过 ?agent=agentId 自动在输入框最前面引入智能体名称
  useEffect(() => {
    const agentId = searchParams.get("agent");
    if (agentId) {
      fetch(`/api/agents/${agentId}`)
        .then((res) => res.json())
        .then((json) => {
          if (json.success) {
            const agent = json.data?.agent || json.agent;
            if (agent && agent.name) {
              const prefix = `@${agent.name} `;
              setInput((prev) => {
                if (!prev.startsWith(prefix)) {
                  return prefix + prev;
                }
                return prev;
              });
            }
          }
        })
        .catch((err) => console.error("获取智能体详情失败", err));
    }
  }, [searchParams, setInput]);

  const hasMessages = messages.length > 0;

  // 快捷任务面板折叠态（仅空态展示）
  const [showQuickTask, setShowQuickTask] = useState(false);
  const [activeWorkflowKey, setActiveWorkflowKey] = useState<string | null>(null);

  // L3 风险确认弹窗状态
  const [confirmationDialog, setConfirmationDialog] = useState<{
    open: boolean;
    riskLevel: string;
    automationLevel: string;
    message: string;
    pendingInput: string;
    pendingSystemPrompt?: string;
    pendingModelId?: string;
  } | null>(null);

  // 当前任务上下文（dispatch 返回后用于 UI 回显）
  const [currentTaskContext, setCurrentTaskContext] = useState<{
    taskId: string;
    workflowRunId: string;
    actionType: string;
    riskLevel: string;
    automationLevel: string;
    fallback?: boolean;
    durationMs?: number;
  } | null>(null);

  // 手动关闭 banner 后隐藏
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // 弹出智能体自进化向导 Dialog 状态
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardDescription, setWizardDescription] = useState("");

  const handleStartWizard = useCallback((prompt: string) => {
    // 自动抓取当前输入内容，若为空则提供一个贴近外贸核算场景的默认需求描述
    const trimmed = prompt.trim();
    const reqText = trimmed || "帮我自动分析入站询盘，计算FOB成本，然后自动生成开发信草稿";
    
    setWizardDescription(reqText);
    setIsWizardOpen(true);
  }, []);

  const handleDirectActivateAgent = useCallback(async (
    spec: { name: string; role: string; description: string; bindSkills: string[]; bindConnectors: string[] },
    requirement: string
  ) => {
    // 1. 调用 useAgentStore 创建智能体，保存至数据库中
    const agentPayload = {
      name: spec.name,
      role: spec.role,
      description: spec.description,
      status: "idle" as const,
      source: "custom" as const,
      category: ["外贸定制"],
      bindSkills: spec.bindSkills,
      bindConnectors: spec.bindConnectors,
      memoryPermission: "read" as const,
      automationLevel: "L2" as const,
      canDo: [],
      cannotDo: [],
      statsJson: {}
    };

    await useAgentStore.getState().createAgent(agentPayload);
    const newAgentId = useAgentStore.getState().selectedAgentId;
    if (!newAgentId) {
      throw new Error("创建智能体失败，未能获得智能体 ID");
    }

    // 2. 翻译绑定的技能和连接器
    const skillsText = spec.bindSkills.length > 0
      ? spec.bindSkills.map(sid => {
          const matched = AVAILABLE_SKILLS.find(s => s.id === sid);
          return matched ? matched.label : sid;
        }).join("、")
      : "无外部技能";

    const connectorsText = spec.bindConnectors.length > 0
      ? spec.bindConnectors.map(cid => {
          const matched = AVAILABLE_CONNECTORS.find(c => c.id === cid);
          return matched ? matched.label : cid;
        }).join("、")
      : "无外部通道";

    // 3. 在当前会话中“接棒”对话，自动发送指令触发新创建智能体的首次工作计划流式输出
    const prompt = `🎉 智能体「${spec.name}」已收藏并成功激活！请你正式接管后续对话，自我介绍并提供第一步实操工作计划。`;

    const systemPrompt = `你现在已不再是 Hermes 架构专家，你已经是刚刚被用户成功收藏激活的专属外贸智能体「${spec.name}」，你的角色定位是「${spec.role}」。
你当前的配置为：
- 绑定的外贸技能模块：[${skillsText}]
- 绑定的数据连接通道：[${connectorsText}]

请你立即以该智能体的身份在对话中回复。内容必须包含：
1. **【自述与角色定位】**：向用户热情地打个招呼，介绍你的职责和具备的专业外贸能力。
2. **【首步行动计划】**：针对之前提出的业务需求：“${requirement}”，结合你绑定的技能（如 ${skillsText}），告诉用户为了完成这个任务，你将如何具体开展第一步工作（例如：需要用户提供什么询盘或产品数据），并承诺将以最高的效率协助。
3. 表态已做好准备，等待用户的下一步指令。

请直接以极度专业的商务外贸数字员工身份回复，文字流式输出，格式为 Markdown。`;

    const apiModelId = getApiModelId();
    sendMessage(prompt, systemPrompt, apiModelId);
  }, [sendMessage, getApiModelId]);

  // 点击卡片时触发工作流表单
  const handleWorkflowSelect = useCallback((cardKey: string) => {
    setActiveWorkflowKey(cardKey);
  }, []);

  // 工作流表单提交：直接调用 sendMessage
  const handleWorkflowSubmit = useCallback(
    (prompt: string, systemPrompt?: string) => {
      const apiModelId = getApiModelId();
      setActiveWorkflowKey(null);
      sendMessage(prompt, systemPrompt, apiModelId);
    },
    [sendMessage, getApiModelId],
  );

  // 返回卡片列表
  const handleWorkflowBack = useCallback(() => {
    setActiveWorkflowKey(null);
  }, []);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isStreaming) return;
    const apiModelId = getApiModelId();

    // 解析输入中的 @智能体、#项目、/命令
    const agentMentions = input.match(/@(\S+)/g)?.map((m: string) => m.slice(1)) ?? [];
    const projectRefs = input.match(/#(\S+)/g)?.map((m: string) => m.slice(1)) ?? [];
    const slashCommands = input.match(/\/ft-\S+/g) ?? [];

    // 构建增强的 system prompt（合并命令、智能体上下文）
    let enhancedSystemPrompt = pendingSystemPrompt;
    if (slashCommands.length > 0) {
      const cmdContext = `用户触发了以下技能命令: ${slashCommands.join(", ")}。请按对应技能的职责处理请求。`;
      enhancedSystemPrompt = enhancedSystemPrompt
        ? `${enhancedSystemPrompt}\n\n${cmdContext}`
        : cmdContext;
    }
    if (agentMentions.length > 0) {
      const agentCtx = `用户 @提及了以下智能体: ${agentMentions.join(", ")}。请以协作模式与这些智能体配合。`;
      enhancedSystemPrompt = enhancedSystemPrompt
        ? `${enhancedSystemPrompt}\n\n${agentCtx}`
        : agentCtx;
    }
    if (projectRefs.length > 0) {
      const projectCtx = `用户引用了以下项目空间: ${projectRefs.join(", ")}。请将结果关联至对应项目。`;
      enhancedSystemPrompt = enhancedSystemPrompt
        ? `${enhancedSystemPrompt}\n\n${projectCtx}`
        : projectCtx;
    }

    const trimmedInput = input.trim();

    // ═══ 阶段 1: TaskEnvelope 写入闭环 ═══
    let taskId: string | undefined;
    let workflowRunId: string | undefined;

    try {
      const dispatchRes = await fetch("/api/tasks/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputText: trimmedInput }),
      });

      if (dispatchRes.ok) {
        const json = await dispatchRes.json();
        if (json.success && json.data) {
          taskId = json.data.taskId;
          workflowRunId = json.data.workflowRunId;
          setCurrentTaskContext({
            taskId: taskId!,
            workflowRunId: workflowRunId!,
            actionType: json.data.envelope.actionType,
            riskLevel: json.data.envelope.riskLevel,
            automationLevel: json.data.envelope.automationLevel,
            fallback: json.data.fallback,
            durationMs: json.data.durationMs,
          });
          setBannerDismissed(false);
        }
      } else if (dispatchRes.status === 409) {
        // L3 — 需用户确认
        const json = await dispatchRes.json();
        setConfirmationDialog({
          open: true,
          riskLevel: json.riskLevel || "L3",
          automationLevel: json.automationLevel || "L3",
          message: json.error || "该操作存在高风险，确认后将立即生效且无法撤销",
          pendingInput: trimmedInput,
          pendingSystemPrompt: enhancedSystemPrompt,
          pendingModelId: apiModelId,
        });
        return; // 保留输入，等用户确认/取消
      } else if (dispatchRes.status === 403) {
        // L4 — 硬拒绝
        const json = await dispatchRes.json();
        toast.error("风险过高，无法自动执行", {
          description: json.error || "请简化需求后重试，或通过人工审批通道发起",
        });
        return; // 不发送，保留输入让用户修改
      }
      // 其他错误（500 等）→ 降级继续
    } catch (err) {
      // 网络错误 → 降级继续（仍可对话，只是无 taskId）
      console.warn("[handleSend] /api/tasks/dispatch 网络失败，降级为直接对话:", err);
    }

    // ═══ 阶段 2: 发送对话消息 ═══
    sendMessage(trimmedInput, enhancedSystemPrompt, apiModelId, taskId, workflowRunId);
    clearNewTopicInput();

    // 关闭工作流上下文确认卡片
    setWorkflowContextCard(null);
  }, [input, isStreaming, sendMessage, pendingSystemPrompt, getApiModelId, clearNewTopicInput]);

  // L3 确认后重试 dispatch
  const handleConfirmedSend = useCallback(async () => {
    if (!confirmationDialog) return;
    const { pendingInput, pendingSystemPrompt, pendingModelId } = confirmationDialog;
    setConfirmationDialog(null);

    let taskId: string | undefined;
    let workflowRunId: string | undefined;

    try {
      const dispatchRes = await fetch("/api/tasks/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputText: pendingInput, confirmed: true }),
      });

      if (dispatchRes.ok) {
        const json = await dispatchRes.json();
        if (json.success && json.data) {
          taskId = json.data.taskId;
          workflowRunId = json.data.workflowRunId;
          setCurrentTaskContext({
            taskId: taskId!,
            workflowRunId: workflowRunId!,
            actionType: json.data.envelope.actionType,
            riskLevel: json.data.envelope.riskLevel,
            automationLevel: json.data.envelope.automationLevel,
            fallback: json.data.fallback,
          });
          setBannerDismissed(false);
        }
      } else {
        const json = await dispatchRes.json().catch(() => ({}));
        toast.error(json.error || "任务分发失败", {
          description: "将降级为直接对话模式",
        });
      }
    } catch (err) {
      console.warn("[handleConfirmedSend] dispatch 重试失败:", err);
    }

    sendMessage(pendingInput, pendingSystemPrompt, pendingModelId, taskId, workflowRunId);
    clearNewTopicInput();
  }, [confirmationDialog, sendMessage, clearNewTopicInput]);

  // ═══════════════════════════════════════════════════════════════
  // [Hermes] 工作流聊天桥接：从 URL 参数 ?workflowRunId=&intent=
  // 预填提示词到输入框 → 清除 URL 参数 → 等待用户确认并手动发送
  //
  // 设计原则：绝不自动发送！必须等用户确认上下文并手动点击发送。
  // ═══════════════════════════════════════════════════════════════
  const workflowAutoTriggeredRef = useRef(false);

  // 上下文确认卡片状态（URL 参数已清除，从 ref 读取持久化值）
  const [workflowContextCard, setWorkflowContextCard] = useState<{
    intent: string;
    workflowRunId: string;
  } | null>(null);

  // Effect: 读取 URL 参数 → 预填提示词 → 展示确认卡片 → 清除 URL
  useEffect(() => {
    const workflowRunId = searchParams.get("workflowRunId");
    const intent = searchParams.get("intent");

    if (!workflowRunId || workflowAutoTriggeredRef.current) return;

    workflowAutoTriggeredRef.current = true;

    // 构建预填提示词 — 不包含"请直接开始"，用户可编辑
    const autoPrompt = `请执行工作流 [${
      intent ?? "未指定"
    }]。工作流运行实例：${workflowRunId}`;

    setInput(autoPrompt);

    // 展示上下文确认卡片
    setWorkflowContextCard({
      intent: intent ?? "未指定",
      workflowRunId,
    });

    // 清除 URL 参数防止刷新重新预填
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("workflowRunId");
    nextParams.delete("intent");
    const qs = nextParams.toString();
    router.replace(`/workspace/chat${qs ? `?${qs}` : ""}`);
  }, [searchParams, setInput, router]);

  // 用户手动发送后关闭确认卡片（在 handleSend 内部 setWorkflowContextCard(null)）

  // L3 确认取消 — 保留输入
  const handleCancelConfirmation = useCallback(() => {
    setConfirmationDialog(null);
  }, []);

  const handleQuickActionSelect = useCallback(
    (prompt: string, systemPrompt?: string) => {
      setInput(prompt);
      setPendingSystemPrompt(systemPrompt);
    },
    [setInput, setPendingSystemPrompt],
  );

  const handleSuggestionSelect = useCallback((text: string) => {
    setInput(text);
  }, [setInput]);

  const handleMentionAgent = useCallback(
    (agentName: string) => {
      setInput((prev: string) => {
        const trimmed = prev.trimEnd();
        return trimmed ? `${trimmed} @${agentName} ` : `@${agentName} `;
      });
    },
    [setInput],
  );

  return (
    <PageTransition>
      <div className="h-full flex bg-background">
        {/* 左栏：整个中栏设为可滚动 */}
        <div className="flex-1 min-w-0 min-h-0 overflow-y-auto flex flex-col relative">
          {/* 顶部操作控制栏（常驻） */}
          <div className="sticky top-0 flex justify-between items-center px-4 md:px-8 py-3 bg-background/95 backdrop-blur z-20 shrink-0">
            {/* 左侧：模型选择器 */}
            <ModelSelectorInline
              value={selectedModelId}
              onChange={handleModelChange}
              disabled={isStreaming}
            />

            {/* 右侧：有对话消息时显示新对话按钮 */}
            {hasMessages && (
              <Button onClick={clearMessages} variant="outline" size="sm" className="gap-1.5 rounded-full">
                <Plus className="size-3.5" />
                新对话
              </Button>
            )}
          </div>

          {/* 行业包未安装提醒 — 仅在未安装任何行业包时展示 */}
          <IndustryPackReminder />

          {/* 工作流上下文确认卡片 — 预填模式下展示 */}
          {workflowContextCard && (
            <WorkflowContextConfirmCard
              intent={workflowContextCard.intent}
              workflowRunId={workflowContextCard.workflowRunId}
            />
          )}

          {/* 对话历史 — 移除内部滚动，改为由外层容器滚动 */}
          {hasMessages && (
            <div className="flex-1 px-4 md:px-8 pt-6 pb-2">
              <div className="max-w-2xl mx-auto">
                {/* 任务分发 Banner — 回显 taskId / automationLevel / riskLevel */}
                {currentTaskContext && !bannerDismissed && (
                  <div className="mb-4">
                    <TaskDispatchBanner
                      taskId={currentTaskContext.taskId}
                      workflowRunId={currentTaskContext.workflowRunId}
                      actionType={currentTaskContext.actionType}
                      riskLevel={currentTaskContext.riskLevel}
                      automationLevel={currentTaskContext.automationLevel}
                      fallback={currentTaskContext.fallback}
                      durationMs={currentTaskContext.durationMs}
                      onDismiss={() => {
                        setBannerDismissed(true);
                        setTimeout(() => setCurrentTaskContext(null), 300);
                      }}
                    />
                  </div>
                )}
                <ConversationArea
                  messages={messages}
                  isStreaming={isStreaming}
                  streamingContent={streamingContent}
                  currentTrace={currentTrace}
                  conversationId={conversationId}
                  onClearMessages={clearMessages}
                  onEditMessage={setInput}
                  onActivateAgent={handleDirectActivateAgent}
                />
              </div>
            </div>
          )}

          {/* 输入框 + 快捷入口 — 使用 sticky 悬浮在底部 */}
          <div
            className={cn(
              "px-4 md:px-8 w-full",
              hasMessages
                ? "sticky bottom-0 shrink-0 pb-6 pt-2 bg-background/95 backdrop-blur z-10"
                : "flex-1 flex flex-col items-center justify-center min-h-full",
            )}
          >
            <>
              <div className="w-full max-w-2xl mx-auto">
                <CommandBox
                  value={input}
                  onChange={setInput}
                  onSubmit={handleSend}
                  onStop={stopStreaming}
                  isStreaming={isStreaming}
                  error={error}
                  onStartWizard={!hasMessages ? handleStartWizard : undefined}
                  headerExtra={<IndustryPackBadge />}
                />
              </div>

              {/* 快捷入口：仅空状态展示，置于输入框下方 */}
              {!hasMessages && (
                <div className="w-full max-w-2xl mx-auto mt-5 space-y-4">
                  <AnimatePresence mode="wait">
                    {activeWorkflowKey ? (
                      <motion.div
                        key="workflow-form"
                        initial={{ opacity: 0, y: 16, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.97 }}
                        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                      >
                        <QuickWorkflowForm
                          cardKey={activeWorkflowKey}
                          onSubmit={handleWorkflowSubmit}
                          onBack={handleWorkflowBack}
                        />
                      </motion.div>
                    ) : (
                      <motion.div
                        key="quick-cards"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -12, scale: 0.96 }}
                        transition={{ duration: 0.2 }}
                      >
                        <QuickCards
                          onSelect={handleQuickActionSelect}
                          onWorkflowSelect={handleWorkflowSelect}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </>
          </div>
        </div>

        <aside className="w-64 xl:w-72 shrink-0 border-l border-border overflow-y-auto hidden xl:flex flex-col p-3">
          <SuggestionPanel
            onSelectSuggestion={handleSuggestionSelect}
            onMentionAgent={handleMentionAgent}
          />
          {/* 分隔线 */}
          <div className="border-t border-border my-3" />
          <RecentPanel />
        </aside>
      </div>

      {/* L3 风险确认弹窗 */}
      {confirmationDialog && (
        <RiskConfirmDialog
          open={confirmationDialog.open}
          riskLevel={confirmationDialog.riskLevel}
          automationLevel={confirmationDialog.automationLevel}
          message={confirmationDialog.message}
          onConfirm={handleConfirmedSend}
          onCancel={handleCancelConfirmation}
        />
      )}

      {/* 智能体自进化向导弹窗 */}
      <NewAgentDialog
        open={isWizardOpen}
        onOpenChange={setIsWizardOpen}
        defaultDescription={wizardDescription}
      />
    </PageTransition>
  );
}
