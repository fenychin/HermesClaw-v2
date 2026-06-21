"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Puzzle,
  FolderPlus,
  Trash2,
  Loader2,
  CheckCircle2,
  ArrowUpRight,
  Pencil,
  Copy,
  Check,
  Bot,
  Settings,
  Sparkles,
} from "lucide-react";
import type { Message } from "@/hooks/useChat";
import { MarkdownRenderer } from "@/components/common/markdown-renderer";
import { ReasoningTracePanel } from "@/components/reasoning-trace-panel";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";

function CopyButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("复制失败");
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer transition-colors"
      title="复制消息"
    >
      {copied ? (
        <Check className="size-3 text-green-500" />
      ) : (
        <Copy className="size-3" />
      )}
    </button>
  );
}

interface ConversationAreaProps {
  /** 完整对话消息列表 */
  messages: Message[];
  /** 是否正在流式接收 */
  isStreaming: boolean;
  /** 当前流式输出文本（未沉淀到 messages） */
  streamingContent: string;
  /** 当前的推理追踪（如果正在流式输出中） */
  currentTrace?: any;
  /** 当前持久化对话 ID（用于创建项目时关联对话） */
  conversationId: string | null;
  /** 清空对话回调 */
  onClearMessages: () => void;
  /** 编辑消息回调（可选） */
  onEditMessage?: (content: string) => void;
  /** 一键在当前会话激活智能体（AI-first 接棒） */
  onActivateAgent?: (spec: any, requirement: string) => Promise<void>;
}

/**
 * 对话区域组件
 * —— 展示用户与 AI 的对话气泡，支持流式输出光标动画，
 *    对话结束后提供沉淀/创建项目/清空操作栏。
 */
export function ConversationArea({
  messages,
  isStreaming,
  streamingContent,
  currentTrace,
  conversationId,
  onClearMessages,
  onEditMessage,
  onActivateAgent,
}: ConversationAreaProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // 沉淀为技能 / 创建项目 — 异步状态
  const [savingSkill, setSavingSkill] = useState(false);
  const [createdSkillId, setCreatedSkillId] = useState<string | null>(null);
  const [creatingProject, setCreatingProject] = useState(false);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);

  // 自动滚底
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  /** 沉淀为技能：收集对话内容，创建技能记录 */
  const handleSaveAsSkill = useCallback(async () => {
    if (savingSkill || createdSkillId) return;
    setSavingSkill(true);
    try {
      // 提取对话中最后一条用户消息作为技能名
      const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
      const skillName = lastUserMsg
        ? lastUserMsg.content.slice(0, 40).replace(/\n/g, " ")
        : "对话沉淀技能";

      // 收集所有 AI 回复作为技能描述/内容
      const aiContent = messages
        .filter((m) => m.role === "assistant")
        .map((m) => m.content)
        .join("\n\n---\n\n");

      const result = await apiClient.createSkill({
        name: `对话沉淀: ${skillName}`,
        description: aiContent.slice(0, 800) || "从对话中沉淀的技能",
        category: "custom:对话沉淀",
        inputSchema: JSON.stringify({
          role: skillName,
          capabilities: ["根据对话上下文执行对应任务", "复用已有对话中的经验"],
          commandName: skillName.toLowerCase().replace(/\s+/g, "-").slice(0, 30),
        }),
        outputSchema: JSON.stringify({
          constraints: ["信息不足时主动询问", "不得执行高风险操作"],
          disableModelInvocation: false,
        }),
      });

      const skill = (result as { skill?: { id?: string } }).skill;
      const skillId = skill?.id;
      if (skillId) {
        setCreatedSkillId(skillId);
      } else {
        setCreatedSkillId("__no_id__"); // 成功但无 ID，仍展示成功态
      }
      toast.success("技能已沉淀", {
        description: `「${skillName}」已保存至智慧大脑`,
      });
    } catch (err) {
      toast.error("沉淀技能失败", {
        description: err instanceof Error ? err.message : "请稍后重试",
      });
    } finally {
      setSavingSkill(false);
    }
  }, [messages, savingSkill, createdSkillId]);

  /** 创建项目空间：从对话内容提取关键信息并创建项目，同时关联当前对话 */
  const handleCreateProject = useCallback(async () => {
    if (creatingProject || createdProjectId) return;
    setCreatingProject(true);
    try {
      const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
      const projectName = lastUserMsg
        ? lastUserMsg.content.slice(0, 50).replace(/\n/g, " ")
        : "新项目空间";

      // 从 AI 回复中提取可能的下一步行动
      const lastAiMsg = [...messages].reverse().find((m) => m.role === "assistant");
      const nextActions = lastAiMsg
        ? lastAiMsg.content
            .split("\n")
            .filter((line) => line.trim().startsWith("- ") || line.trim().startsWith("• "))
            .slice(0, 5)
            .map((line) => line.trim().replace(/^[-•]\s*/, ""))
        : [];

      const result = await apiClient.createProject({
        name: projectName,
        type: "customer",
        owner: "当前用户",
        nextActions,
        tags: ["从对话创建"],
      });

      const project = (result as { project?: { id?: string } }).project;
      const projectId = project?.id;
      if (projectId) {
        setCreatedProjectId(projectId);

        // 将当前对话关联到新项目（传入真实会话内容）
        if (conversationId) {
          apiClient.updateConversation(conversationId, { projectId }).catch((err) => {
            console.warn("关联对话到项目失败:", err);
          });
        }

        toast.success("项目已创建", {
          description: `「${projectName}」已创建，点击"查看项目"进入`,
        });
      } else {
        toast.error("项目创建异常", {
          description: "未获取到项目 ID，请查看项目列表",
        });
      }
    } catch (err) {
      toast.error("创建项目失败", {
        description: err instanceof Error ? err.message : "请稍后重试",
      });
    } finally {
      setCreatingProject(false);
    }
  }, [messages, conversationId, creatingProject, createdProjectId]);

  // 空状态
  if (messages.length === 0 && !streamingContent) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center mx-auto">
            <span className="text-primary text-sm font-bold">H</span>
          </div>
          <p className="text-hint text-sm">
            在下方输入你的需求，开始与 AI 对话
          </p>
        </div>
      </div>
    );
  }

  // 是否显示沉淀操作栏：流式结束 + 至少一轮对话（2 条消息）
  const showActionBar = !isStreaming && messages.length >= 2;

  return (
    // 内容溢出时由外部容器滚动
    <div className="pb-40">
      <div className="space-y-6 py-3">
        <AnimatePresence initial={false}>
          {messages.map((msg) => {
            const isUser = msg.role === "user";

            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className={cn("flex", isUser ? "justify-end" : "justify-start")}
              >
                {isUser ? (
                  // 用户消息：右对齐灰色气泡 + 左侧 hover 操作键
                  <div className="flex items-start gap-2 max-w-[85%] group">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity mt-1 shrink-0">
                      {onEditMessage && (
                        <button
                          onClick={() => onEditMessage(msg.content)}
                          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer transition-colors"
                          title="编辑消息"
                        >
                          <Pencil className="size-3" />
                        </button>
                      )}
                      <CopyButton content={msg.content} />
                    </div>
                    <div className="rounded-2xl bg-accent px-4 py-2.5 text-sm leading-relaxed text-foreground break-words whitespace-pre-wrap">
                      {msg.content || "…"}
                    </div>
                  </div>
                ) : (
                  // AI 消息：全宽、无边框、纯 Markdown
                  <div className="w-full min-w-0 flex flex-col gap-2 text-sm leading-relaxed text-foreground break-words relative group/ai">
                    {msg.trace && <ReasoningTracePanel trace={msg.trace} />}
                    {msg.content ? (
                      <MarkdownRenderer content={msg.content} />
                    ) : (
                      <div className="text-slate-400 animate-pulse">…</div>
                    )}

                    {/* 智能体自进化配置卡片 (AI-first 拦截) */}
                    {(() => {
                      if (!msg.content || isStreaming || !onActivateAgent) return null;
                      // 匹配 <!-- AGENT_SPEC_JSON: { ... } -->
                      const match = msg.content.match(/<!--\s*AGENT_SPEC_JSON:\s*(\{.*?\})\s*-->/);
                      if (!match) return null;
                      try {
                        const spec = JSON.parse(match[1]);
                        // 取最近一条用户消息作为需求背景传入
                        const userMsgs = messages.filter(m => m.role === 'user');
                        const lastUserContent = userMsgs[userMsgs.length - 1]?.content || "";
                        // 正则洗掉 "[智能体自进化]" 的头部标签以净化需求内容
                        const cleanedRequirement = lastUserContent.replace(/🤖\s*\[智能体自进化\]\s*申请创建专属智能体，核心业务需求为：\s*\n?"/g, "").replace(/"$/g, "");
                        return (
                          <AgentSpecCard 
                            spec={spec} 
                            requirement={cleanedRequirement}
                            onActivate={onActivateAgent}
                          />
                        );
                      } catch (e) {
                        return null;
                      }
                    })()}
                  </div>
                )}
              </motion.div>
            );
          })}

          {/* 流式输出中的 AI 消息（全宽 + 光标） */}
          {isStreaming && (streamingContent || currentTrace) && (
            <motion.div
              key="streaming-bubble"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-start"
            >
              <div className="w-full min-w-0 flex flex-col gap-2 text-sm leading-relaxed text-foreground break-words">
                {currentTrace && <ReasoningTracePanel trace={currentTrace} />}
                {streamingContent ? (
                  <>
                    <MarkdownRenderer content={streamingContent} />
                    <span className="inline-block w-0.5 h-4 bg-primary animate-pulse ml-0.5 align-text-bottom" />
                  </>
                ) : (
                  <div className="text-slate-400 animate-pulse">思考中…</div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 消息沉淀操作栏 */}
        <AnimatePresence>
          {showActionBar && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.15 }}
              className="flex items-center gap-1 pt-1"
            >
            <Button
              variant="ghost"
              size="xs"
              className="text-muted-foreground hover:text-foreground text-xs gap-1.5 h-7"
              onClick={createdSkillId ? () => router.push("/brain/skills") : handleSaveAsSkill}
              disabled={savingSkill}
            >
              {savingSkill ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : createdSkillId ? (
                <CheckCircle2 className="size-3.5 text-success" />
              ) : (
                <Puzzle className="size-3.5" />
              )}
              {savingSkill
                ? "沉淀中…"
                : createdSkillId
                  ? "已沉淀"
                  : "沉淀为技能"}
            </Button>
            {createdSkillId && (
              <Button
                variant="ghost"
                size="xs"
                className="text-brand-blue hover:text-brand-blue/80 text-xs gap-1 h-7"
                onClick={() => router.push("/brain/skills")}
              >
                查看技能
                <ArrowUpRight className="size-3" />
              </Button>
            )}

            <Button
              variant="ghost"
              size="xs"
              className="text-muted-foreground hover:text-foreground text-xs gap-1.5 h-7"
              onClick={createdProjectId ? () => router.push(`/projects/${createdProjectId}`) : handleCreateProject}
              disabled={creatingProject}
            >
              {creatingProject ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : createdProjectId ? (
                <CheckCircle2 className="size-3.5 text-success" />
              ) : (
                <FolderPlus className="size-3.5" />
              )}
              {creatingProject
                ? "创建中…"
                : createdProjectId
                  ? "已创建"
                  : "创建项目空间"}
            </Button>
            {createdProjectId && (
              <Button
                variant="ghost"
                size="xs"
                className="text-brand-blue hover:text-brand-blue/80 text-xs gap-1 h-7"
                onClick={() =>
                  router.push(
                    `/projects/${createdProjectId}${conversationId ? `?load=${conversationId}` : ""}`,
                  )
                }
              >
                查看项目
                <ArrowUpRight className="size-3" />
              </Button>
            )}

            <Button
              variant="ghost"
              size="xs"
              className="text-danger hover:text-danger text-xs gap-1.5 h-7 ml-auto"
              onClick={onClearMessages}
            >
              <Trash2 className="size-3.5" />
              清空对话
            </Button>
          </motion.div>
        )}
        </AnimatePresence>

        {/* 自动滚底锚点，增加 scroll-margin 避免被底部 sticky 的输入框遮挡 */}
        <div ref={bottomRef} className="scroll-mt-32 scroll-mb-32 h-1" />
      </div>
    </div>
  );
}

// ============================================================
// 静态配置翻译与内联微调激活卡片 (AgentSpecCard)
// ============================================================

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

interface AgentSpecCardProps {
  spec: {
    name: string;
    role: string;
    description: string;
    bindSkills: string[];
    bindConnectors: string[];
  };
  requirement: string;
  onActivate: (spec: any, requirement: string) => Promise<void>;
}

function AgentSpecCard({ spec, requirement, onActivate }: AgentSpecCardProps) {
  const [name, setName] = useState(spec.name || "");
  const [selectedSkills, setSelectedSkills] = useState<string[]>(spec.bindSkills || []);
  const [selectedConnectors, setSelectedConnectors] = useState<string[]>(spec.bindConnectors || []);
  const [showConfigure, setShowConfigure] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleToggleSkill = (skillId: string) => {
    setSelectedSkills(prev =>
      prev.includes(skillId) ? prev.filter(s => s !== skillId) : [...prev, skillId]
    );
  };

  const handleToggleConnector = (connectorId: string) => {
    setSelectedConnectors(prev =>
      prev.includes(connectorId) ? prev.filter(c => c !== connectorId) : [...prev, connectorId]
    );
  };

  const handleSave = async () => {
    if (loading || success) return;
    setLoading(true);
    try {
      await onActivate({
        name,
        role: spec.role,
        description: spec.description,
        bindSkills: selectedSkills,
        bindConnectors: selectedConnectors
      }, requirement);
      setSuccess(true);
      toast.success(`智能体「${name}」已激活并就绪`);
    } catch (e: any) {
      toast.error(e.message || "创建智能体失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-2 bg-[#171717]/80 border border-border/80 rounded-2xl p-4 shadow-lg max-w-lg select-none">
      <div className="flex items-center justify-between border-b border-border/40 pb-2 mb-3">
        <div className="flex items-center gap-1.5 text-xs text-primary font-semibold">
          <Bot className="size-4 animate-pulse" />
          <span>AI-first 进化配置建议</span>
        </div>
        <button
          type="button"
          onClick={() => setShowConfigure(!showConfigure)}
          className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
        >
          <Settings className={`size-3 transition-transform ${showConfigure ? "rotate-90 text-primary" : ""}`} />
          <span>{showConfigure ? "隐藏微调" : "微调能力绑定"}</span>
        </button>
      </div>

      <div className="space-y-2 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground bg-accent px-1.5 py-0.5 rounded font-mono shrink-0">名称</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={loading || success}
            className="flex-1 bg-transparent text-xs text-foreground font-semibold outline-none border-b border-border/40 focus:border-primary/50 py-0.5"
          />
        </div>
        <div className="text-[11px] leading-relaxed text-muted-foreground">
          推荐角色：<span className="text-foreground font-medium">{spec.role}</span>
        </div>
        <div className="text-[11px] leading-relaxed text-muted-foreground">
          主要职责：<span className="text-foreground/90">{spec.description}</span>
        </div>
      </div>

      {/* 展开微调面板 */}
      {showConfigure && (
        <div className="space-y-3 mb-4 bg-accent/15 p-3 rounded-xl border border-border/30 transition-all">
          <div className="space-y-1.5">
            <span className="text-[10px] text-muted-foreground font-semibold">建议绑定的技能</span>
            <div className="grid grid-cols-2 gap-1.5 max-h-[140px] overflow-y-auto pr-1">
              {AVAILABLE_SKILLS.map(skill => {
                const checked = selectedSkills.includes(skill.id);
                return (
                  <label key={skill.id} className="flex items-center gap-2 p-1.5 rounded bg-card/25 border border-border/20 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={loading || success}
                      onChange={() => handleToggleSkill(skill.id)}
                      className="accent-primary size-3.5 shrink-0"
                    />
                    <span className={`text-[10px] font-medium truncate ${checked ? "text-primary" : "text-muted-foreground"}`}>
                      {skill.label}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5 border-t border-border/20 pt-2.5">
            <span className="text-[10px] text-muted-foreground font-semibold">建议启用的通道</span>
            <div className="grid grid-cols-2 gap-1.5">
              {AVAILABLE_CONNECTORS.map(conn => {
                const checked = selectedConnectors.includes(conn.id);
                return (
                  <label key={conn.id} className="flex items-center gap-2 p-1.5 rounded bg-card/25 border border-border/20 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={loading || success}
                      onChange={() => handleToggleConnector(conn.id)}
                      className="accent-primary size-3.5 shrink-0"
                    />
                    <span className={`text-[10px] font-medium truncate ${checked ? "text-primary" : "text-muted-foreground"}`}>
                      {conn.label}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 一键收藏按钮 */}
      <div className="flex justify-end pt-2 border-t border-border/20">
        <Button
          onClick={handleSave}
          disabled={loading || success}
          className={cn(
            "rounded-xl text-xs px-4 h-8 flex items-center gap-1.5 shadow-sm font-semibold transition-all",
            success 
              ? "bg-success/20 text-success border border-success/30 hover:bg-success/20" 
              : "bg-primary hover:bg-primary/80 text-white"
          )}
        >
          {loading ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              <span>正在激活…</span>
            </>
          ) : success ? (
            <>
              <Check className="size-3.5" />
              <span>已收藏并激活</span>
            </>
          ) : (
            <>
              <Sparkles className="size-3" />
              <span>一键收藏并启用此智能体</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
