"use client";

import { Suspense, useCallback, useEffect, useState, useMemo, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Plus, Sparkles, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageTransition } from "@/components/common/PageTransition";
import { CommandBox } from "@/components/pages/new/command-box";
import { QuickCards } from "@/components/pages/new/quick-cards";
import { QuickWorkflowForm } from "@/components/pages/new/quick-workflow-form";
import { QuickTaskPanel } from "@/components/pages/new/quick-task-panel";
import { ConversationArea } from "@/components/pages/new/conversation-area";
import { SuggestionPanel } from "@/components/pages/new/suggestion-panel";
import { useChat } from "@/hooks/useChat";
import { SELECTABLE_MODELS } from "@/config/models";
import { useUiStore } from "@/stores/ui-store";
import { useAgentStore } from "@/stores/agent-store";
import { ModelSelectorInline } from "@/components/workspace/ModelSelectorInline";
import { useModelPreference } from "@/hooks/use-model-preference";
import { toast } from "sonner";
import { RiskConfirmDialog } from "@/components/pages/new/risk-confirm-dialog";
import { TaskDispatchBanner } from "@/components/pages/new/task-dispatch-banner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import QuickActionCustomizer from "@/components/chat/quick-action-customizer";
import Link from "next/link";

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

const CARD_KEY_TO_SKILL_ID: Record<string, string> = {
  "inquiry-grade": "inquiry-grade",
  "dev-letter": "dev-letter",
  "quote-gen": "quote-gen",
  "customer-profile": "customer-profile",
  "project-space": "project-space",
  "agent-dispatch": "agent-dispatch"
};

function NewTopicPageInner() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const processedAgentQueryRef = useRef<string | null>(null);

  const {
    messages,
    isStreaming,
    streamingContent,
    error,
    conversationId,
    sendMessage,
    sendWorkflowRun,
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

  const handleMentionAgent = useCallback(
    (agentName: string) => {
      setInput((prev: string) => {
        const trimmed = prev.trimEnd();
        const mentionStr = `@${agentName}`;
        if (trimmed.includes(mentionStr)) {
          // 如果输入框正好就是该提及，或者已在该提及结尾，避免重复提及
          if (trimmed === mentionStr || trimmed.endsWith(` ${mentionStr}`)) {
            return prev;
          }
        }
        return trimmed ? `${trimmed} ${mentionStr} ` : `${mentionStr} `;
      });
    },
    [setInput],
  );

  // 快捷卡片动态加载
  const { data: quickActionsData, isLoading: quickActionsLoading } = useQuery({
    queryKey: ["quick-actions"],
    queryFn: async () => {
      const res = await fetch("/api/brain/quick-actions");
      const data = await res.json();
      return data.data;
    }
  });

  // 查询已安装包，用于行业属性提醒及多开检测
  const { data: installedPacksData } = useQuery<any[]>({
    queryKey: ["installed-packs"],
    queryFn: async () => {
      const res = await fetch("/api/industry-packs");
      const json = await res.json();
      return json.packs || json.data?.packs || [];
    }
  });

  const activePacks = useMemo(() => {
    return (installedPacksData || [])
      .filter((p: any) => p.status === "installed")
      .filter((p: any) => {
        const targetInd = p.manifest?.targetIndustry || p.manifest?.industry;
        return targetInd && targetInd !== "general";
      });
  }, [installedPacksData]);

  const [isCustomizerOpen, setIsCustomizerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("all");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem("active_pack_id");
      if (cached) setActiveTab(cached);
    }
  }, []);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      localStorage.setItem("active_pack_id", tab);
    }
  };

  // 场景 Tab 计算
  const availablePacks = useMemo(() => {
    const packs = new Set<string>();
    quickActionsData?.allAvailable?.forEach((a: any) => {
      if (a.packId) packs.add(a.packId);
    });
    return Array.from(packs);
  }, [quickActionsData?.allAvailable]);

  // 按场景/行业包过滤卡片
  const filteredQuickActions = useMemo(() => {
    if (activeTab === "all") {
      return quickActionsData?.quickActions || [];
    }
    const all = quickActionsData?.allAvailable || [];
    return all.filter((a: any) => a.packId === activeTab);
  }, [quickActionsData?.quickActions, quickActionsData?.allAvailable, activeTab]);

  // 判断是否无行业包已安装
  const hasNoPacks = useMemo(() => {
    return activePacks.length === 0;
  }, [activePacks]);

  // 动态输入框 Placeholder
  const placeholderText = useMemo(() => {
    if (quickActionsData?.allAvailable && quickActionsData.allAvailable.length > 0) {
      const firstPack = quickActionsData.allAvailable[0];
      if (firstPack.packId === "foreign-trade") {
        return "粘贴外贸询盘邮件，或直接输入指令进行询盘分析、开发信写作...";
      }
      return `输入需求以运行 ${firstPack.packId} 行业的专属指令...`;
    }
    return "输入需求、粘贴询盘、@调用智能体…";
  }, [quickActionsData?.allAvailable]);

  // 从 /recent 点击跳转时通过 ?load=conversationId 自动加载历史对话
  useEffect(() => {
    const loadId = searchParams.get("load");
    if (loadId) {
      loadConversation(loadId);
    }
  }, [searchParams, loadConversation]);

  // 从智能体库点击“对话”跳转过来时，根据 ?agent=agentId 预填 @提及 智能体
  useEffect(() => {
    const agentId = searchParams.get("agent");
    if (agentId) {
      if (processedAgentQueryRef.current !== agentId) {
        processedAgentQueryRef.current = agentId;
        const agents = useAgentStore.getState().agents;
        const cached = agents.find((a) => a.id === agentId);
        if (cached) {
          handleMentionAgent(cached.name);
        } else {
          // 后台获取特定智能体名称进行提及
          fetch(`/api/agents/${agentId}`)
            .then((res) => res.json())
            .then((json) => {
              const agentData = json.agent || json.data?.agent;
              if (agentData?.name) {
                handleMentionAgent(agentData.name);
              }
            })
            .catch((err) => console.error("根据 id 加载提及智能体失败:", err));
        }
      }
    } else {
      processedAgentQueryRef.current = null;
    }
  }, [searchParams, handleMentionAgent]);

  const hasMessages = messages.length > 0;
  const [activeWorkflowKey, setActiveWorkflowKey] = useState<string | null>(null);

  // L3 风险确认弹窗状态
  const [confirmationDialog, setConfirmationDialog] = useState<{
    open: boolean; riskLevel: string; automationLevel: string; message: string;
    pendingInput: string; pendingSystemPrompt?: string; pendingModelId?: string;
  } | null>(null);

  // 当前任务上下文（dispatch 返回后用于 UI Banner 回显）
  const [currentTaskContext, setCurrentTaskContext] = useState<{
    taskId: string; workflowRunId: string; actionType: string;
    riskLevel: string; automationLevel: string; fallback?: boolean; durationMs?: number;
  } | null>(null);

  const [bannerDismissed, setBannerDismissed] = useState(false);

  // 全局居中磨砂虚化提示弹窗状态（PRD 对齐，做明显提示）
  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: "info" | "warning" | "error";
  }>({
    isOpen: false,
    title: "",
    message: "",
    type: "warning",
  });

  const showAlert = useCallback((title: string, message: string, type: "info" | "warning" | "error" = "warning") => {
    setAlertModal({
      isOpen: true,
      title,
      message,
      type,
    });
  }, []);

  const handleStartWizard = useCallback((prompt: string) => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      showAlert(
        "请输入智能体业务需求",
        "请先在输入框中输入您想让智能体帮您完成的工作（例如：'帮我自动分析入站询盘并计算 FOB 成本'），然后再点击新建智能体。",
        "warning"
      );
      requestAnimationFrame(() => {
        const textarea = document.querySelector("textarea");
        if (textarea) {
          (textarea as HTMLTextAreaElement).focus();
        }
      });
      return;
    }
    
    // 自动清理会话并切换到对话状态
    clearMessages();
    
    // 构造用户端发送的消息
    const userPrompt = `🤖 [智能体自进化] 申请创建专属智能体，核心业务需求为：\n"${trimmed}"`;
    
    // 构造指令以让大模型按规范在聊天中流式输出规划并附带配置数据载荷
    const skillsListText = AVAILABLE_SKILLS.map(s => `- ${s.id} (${s.label})`).join("\n");
    const connectorsListText = AVAILABLE_CONNECTORS.map(c => `- ${c.id} (${c.label})`).join("\n");

    const systemPrompt = `你现在是 Hermes 智能体进化架构专家（Agent Architect）。
用户正向你申请利用 AI-first 的演化逻辑创建一个专属的外贸数字员工（智能体）。

请你针对用户的核心需求进行业务诊断与架构规划，并直接在对话框中流式输出你的回复。
你的回复必须为 Markdown 格式，且包含以下结构：
1. **【名称与角色推荐】**：根据需求，为新智能体取一个简短亮眼的名字（Name，如“开发信专家 Leon”），并定义其扮演角色（Role，如“多语种营销文案师”）和工作描述（Description）。
2. **【能力绑定建议】**：分析系统支持的 Skills 和 Connectors 列表，给出最适合当前场景的组件绑定建议和合理理由。
3. **【三域安全策略推荐（系统合规边界）**】：
   - **自动化授权等级**：推荐合理的自动化授权等级（L1/L2/L3/L4）。默认推荐 L2。如果该智能体涉及物理写操作（如调用 email-connector 物理发信），必须建议选择 L3 级（自动执行低风险动作，高危写操作触发人工审批）；如果涉及只读分析，建议选择 L2 级（半自动，AI 生成，人类手动触发）。
   - **记忆权限**：推荐 "read" (只读) 或 "read-write" (读写) 权限。
   - **任务安全边界**：定义清晰的允许执行的动作列表（canDo，如：解析询盘、生成开发信草稿、核算 FOB 成本） and 禁止执行的高危动作列表（cannotDo，如：向外部账户转账、私自更改价格模板、物理删除核心客户数据等）。
4. **【实操运行方案预览】**：针对该需求，现场进行一次模拟执行，为用户生成一份高保真且有代表性的业务方案样例（如 FOB 核算明细表，或一份外贸开发信模板）。
5. **【数据载荷载入（核心关键）**】：你必须在你的输出正文的最尾端（不要有任何 markdown 块包裹，单独成行），输出一行隐藏的 HTML 数据载荷，其内容必须包含根据你规划得出的智能体完整配置 JSON。格式必须严格如下：
   <!-- AGENT_SPEC_JSON: {"name": "推荐名称", "role": "推荐角色", "description": "推荐描述", "bindSkills": ["技能ID"], "bindConnectors": ["连接器ID"], "automationLevel": "L2或L3", "memoryPermission": "read或read-write", "canDo": ["允许项1"], "cannotDo": ["禁用项1"]} -->

系统支持的 Skills 技能列表：
${skillsListText}

系统支持的 Connectors 连接器列表：
${connectorsListText}

请注意：隐藏注释的数据载荷（AGENT_SPEC_JSON）格式必须完全合法且字段齐全，以便前端系统自动解析出配置并在消息气泡底部渲染出一键部署卡片。`;

    const apiModelId = getApiModelId();
    sendMessage(userPrompt, systemPrompt, apiModelId);
  }, [clearMessages, sendMessage, getApiModelId, showAlert]);

  const handleDirectActivateAgent = useCallback(async (
    spec: { 
      name: string; 
      role: string; 
      description: string; 
      bindSkills: string[]; 
      bindConnectors: string[];
      automationLevel?: string;
      memoryPermission?: string;
      canDo?: string[];
      cannotDo?: string[];
    },
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
      memoryPermission: (spec.memoryPermission || "read") as any,
      automationLevel: (spec.automationLevel || "L2") as any,
      canDo: spec.canDo || [],
      cannotDo: spec.cannotDo || [],
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

    const canDoText = spec.canDo && spec.canDo.length > 0
      ? spec.canDo.map((c, i) => `${i + 1}. ${c}`).join("\n")
      : "暂未定义允许职责";

    const cannotDoText = spec.cannotDo && spec.cannotDo.length > 0
      ? spec.cannotDo.map((c, i) => `${i + 1}. ${c}`).join("\n")
      : "暂无严苛禁用限制";

    // 3. 在当前会话中“接棒”对话，自动发送指令触发新创建智能体的首次工作计划流式输出
    const prompt = `🎉 智能体「${spec.name}」已收藏并成功激活！请你正式接管后续对话，自我介绍并提供第一步实操工作计划。`;

    const systemPrompt = `你现在已不再是 Hermes 架构专家，你已经是刚刚被用户成功收藏激活的专属外贸智能体「${spec.name}」，你的角色定位是「${spec.role}」。
你当前的配置为：
- 绑定的外贸技能模块：[${skillsText}]
- 绑定的数据连接通道：[${connectorsText}]
- 自动化授权等级：${spec.automationLevel || "L2"}
- 记忆访问权限：${spec.memoryPermission || "read"}

你必须严格遵守以下系统底层三域安全边界：
【允许执行的任务 (canDo)】:
${canDoText}

【禁止执行的高危动作 (cannotDo)】:
${cannotDoText}

请你立即以该智能体的身份在对话中回复。内容必须包含：
1. **【自述与角色定位】**：向用户热情地打个招呼，介绍你的职责和具备的专业外贸能力。
2. **【首步行动计划】**：针对之前提出的业务需求：“${requirement}”，结合你绑定的技能（如 ${skillsText}），告诉用户为了完成这个任务，你将如何具体开展第一步工作（例如：需要用户提供什么询盘或产品数据），并承诺将以最高的效率协助。
3. 表态已做好准备，并且重申你会始终遵守你的安全职责边界（canDo/cannotDo），等待用户的下一步指令。

请直接以极度专业的商务外贸数字员工身份回复，文字流式输出，格式为 Markdown。`;

    const apiModelId = getApiModelId();
    sendMessage(prompt, systemPrompt, apiModelId);
  }, [sendMessage, getApiModelId]);

  // 点击卡片时触发工作流表单
  const handleWorkflowSelect = useCallback(async (cardKey: string) => {
    const skillId = CARD_KEY_TO_SKILL_ID[cardKey];
    if (skillId) {
      try {
        const res = await fetch(`/api/capabilities?skillId=${skillId}`);
        if (res.ok) {
          const data = await res.json();
          const cap = data.data;
          if (cap) {
            if (cap.status === "yanked" || cap.status === "degraded" || cap.healthStatus === "degraded" || cap.healthStatus === "unhealthy") {
              showAlert(
                "技能已下线或降级",
                `技能「${cap.capabilityId}」已下线或降级，暂时无法执行！`,
                "error"
              );
              return;
            }
          }
        }
      } catch (err) {
        console.error("检查能力健康度失败:", err);
      }
    }
    setActiveWorkflowKey(cardKey);
  }, [showAlert]);

  // 工作流表单提交：路由至工作流专用执行与状态轮询
  const handleWorkflowSubmit = useCallback(
    async (prompt: string, systemPrompt?: string, formValues?: Record<string, string>) => {
      const cardKey = activeWorkflowKey;
      if (!cardKey) return;

      const skillId = CARD_KEY_TO_SKILL_ID[cardKey];
      if (skillId) {
        try {
          const res = await fetch(`/api/capabilities?skillId=${skillId}`);
          if (res.ok) {
            const data = await res.json();
            const cap = data.data;
            if (cap && (cap.status === "yanked" || cap.status === "degraded" || cap.healthStatus === "degraded" || cap.healthStatus === "unhealthy")) {
              showAlert(
                "技能已下线或降级",
                `技能「${cap.capabilityId}」已下线或降级，暂时无法执行！`,
                "error"
              );
              return;
            }
          }
        } catch (err) {
          console.error("检查能力健康度失败:", err);
        }
      }

      const actualSkillIdMap: Record<string, string> = {
        "inquiry-grade": "ft-inquiry-grading",
        "dev-letter": "ft-outreach-email",
        "quote-gen": "ft-quote-generator",
        "customer-profile": "ft-customer-profiling",
        "project-space": "ft-project-space",
        "agent-dispatch": "ft-outreach-email"
      };
      const actualSkillId = actualSkillIdMap[skillId] || skillId;

      const agents = useAgentStore.getState().agents;
      // 查找绑定了该技能且 status 为可用（active/running/idle）的 Agent
      let targetAgent = agents.find(
        (a) => (a.status === "running" || a.status === "idle") &&
          (Array.isArray(a.bindSkills) ? a.bindSkills : (JSON.parse((a.bindSkills as unknown as string) || "[]") as string[])).includes(actualSkillId ?? '')
      );

      if (!targetAgent) {
        const roleKeywords: Record<string, string> = {
          "inquiry-grade": "询盘",
          "dev-letter": "开发信",
          "quote-gen": "报价",
          "customer-profile": "画像",
          "project-space": "项目",
          "agent-dispatch": "智能体"
        };
        const keyword = roleKeywords[skillId];
        if (keyword) {
          targetAgent = agents.find(
            (a) => (a.status === "running" || a.status === "idle") && (a.role.includes(keyword) || a.name.includes(keyword))
          );
        }
      }

      if (!targetAgent) {
        targetAgent = agents.find((a) => a.status === "running" || a.status === "idle");
      }

      if (!targetAgent) {
        showAlert("未找到可用智能体", "请先在智能体管理中创建并激活智能体。", "error");
        return;
      }

      const toastId = toast.loading("正在启动工作流...");
      const taskId = `task-${crypto.randomUUID()}`;
      const idempotencyKey = `idem-${targetAgent.id}-${cardKey}-${Date.now()}`;

      try {
        const res = await fetch("/api/workflow-runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId: targetAgent.id,
            input: formValues || {},
            taskId,
            actionType: cardKey,
            automationLevel: targetAgent.automationLevel || "L1",
            riskLevel: "low",
            idempotencyKey,
            version: "1.0"
          })
        });

        const json = await res.json();
        toast.dismiss(toastId);

        if (json.success && json.data) {
          const runResult = json.data;
          if (runResult.status === "pending_approval") {
            toast.warning("触发高危动作门禁拦截，已生成人工审批单");
            const runId = runResult.checkpointId.replace("acp-", "");
            router.push(`/workspace/runs/${runId}`);
          } else if (runResult.workflowRunId) {
            toast.success("工作流启动成功，开始物理执行");
            router.push(`/workspace/runs/${runResult.workflowRunId}`);
          } else {
            toast.error("启动失败，未获取到有效工作流 ID");
          }
        } else {
          showAlert("启动失败", json.message || "后端接口拒绝了本次启动请求", "error");
        }
      } catch (err) {
        toast.dismiss(toastId);
        console.error("物理启动工作流网络失败:", err);
        toast.error("网络异常，启动失败");
      } finally {
        setActiveWorkflowKey(null);
      }
    },
    [activeWorkflowKey, router, showAlert]
  );

  // 返回卡片列表
  const handleWorkflowBack = useCallback(() => {
    setActiveWorkflowKey(null);
  }, []);

  const handleSend = useCallback(async (finalPrompt?: string) => {
    const activePrompt = typeof finalPrompt === "string" ? finalPrompt : input.trim();
    if (!activePrompt || isStreaming) return;
    const apiModelId = getApiModelId();

    const isWorkflowPrompt = activePrompt.startsWith("[触发工作流:") || activePrompt.startsWith("[触发指令:");
    if (isWorkflowPrompt) {
      const match = activePrompt.match(/·\s*([a-zA-Z0-9_-]+)\]/);
      const skillId = match ? match[1] : undefined;

      const agents = useAgentStore.getState().agents;
      const actualSkillIdMap: Record<string, string> = {
        "inquiry-grade": "ft-inquiry-grading",
        "dev-letter": "ft-outreach-email",
        "quote-gen": "ft-quote-generator",
        "customer-profile": "ft-customer-profiling",
        "project-space": "ft-project-space",
        "agent-dispatch": "ft-outreach-email"
      };
      const actualSkillId = skillId ? actualSkillIdMap[skillId] : undefined;

      let targetAgent = agents.find(
        (a) => (a.status === "running" || a.status === "idle") &&
          (Array.isArray(a.bindSkills) ? a.bindSkills : (JSON.parse((a.bindSkills as unknown as string) || "[]") as string[])).includes(actualSkillId ?? '')
      );
      if (!targetAgent) {
        targetAgent = agents.find((a) => a.status === "running" || a.status === "idle");
      }

      if (targetAgent) {
        sendWorkflowRun(targetAgent.id, activePrompt);
        clearNewTopicInput();
        return;
      }
    }

    // 解析输入中的 @智能体、#项目、/命令
    const agentMentions = activePrompt.match(/@(\S+)/g)?.map((m: string) => m.slice(1)) ?? [];
    const projectRefs = activePrompt.match(/#(\S+)/g)?.map((m: string) => m.slice(1)) ?? [];
    const slashCommands = activePrompt.match(/\/ft-\S+/g) ?? [];

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

    // ═══ 阶段 1: TaskEnvelope 写入闭环 ═══
    let taskId: string | undefined;
    let workflowRunId: string | undefined;

    try {
      const dispatchRes = await fetch("/api/tasks/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: activePrompt }),
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
          pendingInput: activePrompt,
          pendingSystemPrompt: enhancedSystemPrompt,
          pendingModelId: apiModelId,
        });
        return;
      } else if (dispatchRes.status === 403) {
        // L4 — 硬拒绝
        const json = await dispatchRes.json();
        toast.error("风险过高，无法自动执行", {
          description: json.error || "请简化需求后重试，或通过人工审批通道发起",
        });
        return;
      }
    } catch (err) {
      console.warn("[handleSend] /api/tasks/dispatch 网络失败，降级为直接对话:", err);
    }

    // ═══ 阶段 2: 发送对话消息 ═══
    sendMessage(activePrompt, enhancedSystemPrompt, apiModelId, taskId, workflowRunId);
    clearNewTopicInput();
  }, [input, isStreaming, sendMessage, sendWorkflowRun, pendingSystemPrompt, getApiModelId, clearNewTopicInput]);

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
        body: JSON.stringify({ input: pendingInput, confirmed: true }),
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

  // AI 建议直接物理启动工作流并重定向
  const handleSuggestionSelect = useCallback(async (text: string) => {
    const agents = useAgentStore.getState().agents;
    const targetAgent = agents.find((a) => a.status === "running" || a.status === "idle");
    if (!targetAgent) {
      showAlert("未找到激活智能体", "无法执行建议，请先激活一位数字员工", "error");
      return;
    }

    const toastId = toast.loading("正在执行 AI 建议工作流...");
    const taskId = `task-${crypto.randomUUID()}`;
    const idempotencyKey = `idem-sugg-${targetAgent.id}-${Date.now()}`;

    try {
      const res = await fetch("/api/workflow-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: targetAgent.id,
          input: text,
          taskId,
          idempotencyKey,
          version: "1.0"
        })
      });

      const json = await res.json();
      toast.dismiss(toastId);

      if (json.success && json.data) {
        const runResult = json.data;
        if (runResult.status === "pending_approval") {
          toast.warning("触发高危保护门禁，已转为人工审批");
          const runId = runResult.checkpointId.replace("acp-", "");
          router.push(`/workspace/runs/${runId}`);
        } else if (runResult.workflowRunId) {
          toast.success("AI 建议已启动");
          router.push(`/workspace/runs/${runResult.workflowRunId}`);
        } else {
          toast.error("执行失败，没有生成有效工作流 ID");
        }
      } else {
        toast.error(json.message || "后端接口拒绝了此次物理执行请求");
      }
    } catch (err) {
      toast.dismiss(toastId);
      console.error("执行建议网络异常:", err);
      toast.error("网络异常，无法执行建议");
    }
  }, [router, showAlert]);

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
                {/* Onboarding 横幅 */}
                {!hasMessages && hasNoPacks && (
                  <div className="w-full mb-4 p-3.5 bg-primary/10 border border-primary/20 rounded-xl flex items-center justify-between text-xs text-foreground select-none">
                    <div className="flex items-center gap-2">
                      <Sparkles className="size-4 text-primary animate-pulse" />
                      <span>选择你的行业，获得专属工作流和智能体</span>
                    </div>
                    <Link
                      href="/settings/industry-packs"
                      className="text-primary hover:underline font-semibold"
                    >
                      去配置行业包 →
                    </Link>
                  </div>
                )}

                <CommandBox
                  value={input}
                  onChange={setInput}
                  onSubmit={handleSend}
                  onStop={stopStreaming}
                  isStreaming={isStreaming}
                  error={error}
                  placeholder={placeholderText}
                  onStartWizard={!hasMessages ? handleStartWizard : undefined}
                  headerExtra={
                    <AnimatePresence mode="wait">
                      {activePacks.length === 0 ? (
                        <motion.div
                          key="global-mode"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="inline-flex items-center rounded-full bg-muted/40 border border-border/50 px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground/70 select-none"
                        >
                          通用模式
                        </motion.div>
                      ) : activePacks.length === 1 ? (
                        <motion.div
                          key="industry-mode"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="inline-flex items-center rounded-full bg-muted/40 border border-border/50 px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground/70 select-none"
                        >
                          {(activePacks[0].packName || '外贸').replace(/行业包$|包$|行业$/, "")}模式
                        </motion.div>
                      ) : (
                        <motion.div
                          key="conflict-mode"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="inline-flex items-center rounded-full bg-muted/40 border border-border/50 px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground/70 select-none cursor-pointer hover:bg-muted/60 transition-colors"
                          onClick={() => router.push('/settings/industry-packs')}
                          title="点击去暂停冲突行业包"
                        >
                          行业冲突
                        </motion.div>
                      )}
                    </AnimatePresence>
                  }
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
                          onStartWizard={handleStartWizard}
                        />
                      </motion.div>
                    ) : (
                      <motion.div
                        key="quick-cards"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -12, scale: 0.96 }}
                        transition={{ duration: 0.2 }}
                        className="space-y-3"
                      >
                        {/* 场景 Tabs (如果已安装行业包个数 > 1) */}
                        {availablePacks.length > 1 && (
                          <div className="flex items-center gap-1.5 border-b border-border/40 pb-2 overflow-x-auto">
                            <button
                              type="button"
                              onClick={() => handleTabChange("all")}
                              className={cn(
                                "px-2.5 py-1 text-xs rounded-full font-medium transition-colors",
                                activeTab === "all"
                                  ? "bg-primary text-primary-foreground"
                                  : "text-muted-foreground hover:bg-muted"
                              )}
                            >
                              全部场景
                            </button>
                            {availablePacks.map((packId) => (
                              <button
                                key={packId}
                                type="button"
                                onClick={() => handleTabChange(packId)}
                                className={cn(
                                  "px-2.5 py-1 text-xs rounded-full font-medium transition-colors truncate max-w-[120px]",
                                  activeTab === packId
                                    ? "bg-primary text-primary-foreground"
                                    : "text-muted-foreground hover:bg-muted"
                                )}
                              >
                                {packId === "foreign-trade" ? "外贸场景" : packId}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* 常用卡片标题与自定义按钮 */}
                        {!hasNoPacks && (
                          <div className="flex items-center justify-between text-xs text-muted-foreground font-medium px-1">
                            <span>常用快捷入口</span>
                            <button
                              type="button"
                              onClick={() => setIsCustomizerOpen(true)}
                              className="hover:text-primary transition-colors cursor-pointer"
                            >
                              自定义
                            </button>
                          </div>
                        )}

                        <QuickCards
                          actions={filteredQuickActions}
                          loading={quickActionsLoading}
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
        </aside>
      </div>

      {/* 快捷卡片自定义抽屉 */}
      <QuickActionCustomizer
        isOpen={isCustomizerOpen}
        onOpenChange={setIsCustomizerOpen}
        allAvailable={quickActionsData?.allAvailable || []}
        currentOrder={quickActionsData?.quickActions?.map((a: any) => a.id) || []}
        onSaveSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["quick-actions"] });
        }}
      />

      {/* 全局居中磨砂虚化提示弹窗 */}
      <AnimatePresence>
        {alertModal.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* 背景虚化遮罩 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setAlertModal((prev) => ({ ...prev, isOpen: false }))}
              className="absolute inset-0 bg-black/60 backdrop-blur-md will-change-opacity"
            />
            {/* 弹窗主体 */}
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.25 }}
              className="relative w-full max-w-md bg-card border border-border/80 rounded-2xl p-6 shadow-2xl z-10 flex flex-col gap-4 overflow-hidden will-change-transform"
            >
              {/* 光晕背景装饰 */}
              <div className="absolute top-0 right-0 w-24 h-24 bg-primary/10 rounded-full blur-2xl pointer-events-none" />

              <div className="flex items-start gap-4">
                <div className={cn(
                  "size-10 rounded-xl flex items-center justify-center shrink-0 shadow-inner",
                  alertModal.type === "error" 
                    ? "bg-danger/10 text-danger" 
                    : "bg-warning/10 text-warning"
                )}>
                  {alertModal.type === "error" ? (
                    <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  ) : (
                    <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                </div>
                <div className="flex-1 space-y-1">
                  <h3 className="text-base font-semibold text-foreground leading-none">
                    {alertModal.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mt-2.5">
                    {alertModal.message}
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-2">
                <Button
                  onClick={() => setAlertModal((prev) => ({ ...prev, isOpen: false }))}
                  className="rounded-xl px-5"
                >
                  我知道了
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
    </PageTransition>
  );
}
