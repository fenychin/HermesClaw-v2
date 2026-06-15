"use client";

import { useState, useEffect } from "react";
import { 
  ShieldAlert, 
  ShieldCheck, 
  HelpCircle, 
  Check, 
  Lock, 
  Info,
  AlertTriangle,
  ArrowLeft
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { PageHeader } from "@/components/common/page-header";
import { PageTransition } from "@/components/common/PageTransition";
import { cn } from "@/lib/utils";

const L4_CONFIRM_TOKEN = "CONFIRM_L4_RELEASE_ALL_RISKS";
/** L3 后端确认令牌（与后端环境变量 AUTOMATION_L3_CONFIRM_TOKEN 保持一致） */
const L3_CONFIRM_TOKEN = "CONFIRM_L3_SUPERVISED_AUTO";

interface LevelDetail {
  id: "L1" | "L2" | "L3" | "L4";
  title: string;
  subTitle: string;
  description: string;
  badge: string;
  colorClass: string;
  bgLightClass: string;
  borderClass: string;
}

export default function AutomationSettingsPage() {
  const [currentLevel, setCurrentLevel] = useState<"L1" | "L2" | "L3" | "L4">("L2");
  const [selectedLevel, setSelectedLevel] = useState<"L1" | "L2" | "L3" | "L4" | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [inputToken, setInputToken] = useState("");

  const levels: LevelDetail[] = [
    {
      id: "L1",
      title: "L1 · 仅建议 (Recommendation Only)",
      subTitle: "AI 生成方案，人类手工执行",
      description: "所有操作仅提供优化建议与决策草稿，必须由人类管理员在对应的三方后台中手动抄录或运行。安全防护度最高，适合初创测试阶段。",
      badge: "最高安全性",
      colorClass: "text-success",
      bgLightClass: "bg-success/5",
      borderClass: "border-success/20 hover:border-success/40"
    },
    {
      id: "L2",
      title: "L2 · 半自动 (Semi-Automated)",
      subTitle: "AI 生成方案，人工确认点按执行",
      description: "系统策略引擎生成流程并组装参数。在执行前，需要人类操作员在工作台上点击'确认启动'或'发送'才会由总线开始派发。是目前推荐的稳健协同模式。",
      badge: "推荐等级",
      colorClass: "text-primary",
      bgLightClass: "bg-primary/5",
      borderClass: "border-primary/20 hover:border-primary/40"
    },
    {
      id: "L3",
      title: "L3 · 自动低风险 (Conditional Automated)",
      subTitle: "低风险动作自动执行，高风险审批门禁",
      description: "低风险动作（如日常收发邮件、普通线索归档、信息比对）直接由智能体自动在后台运行；若涉及高风险动作（如资金划拨、敏感数据删除）则会被安全护栏拦截并上报审批中心。",
      badge: "高效协同",
      colorClass: "text-warning",
      bgLightClass: "bg-warning/5",
      borderClass: "border-warning/20 hover:border-warning/40"
    },
    {
      id: "L4",
      title: "L4 · 全自动 (Fully Autonomous)",
      subTitle: "全部动作自动执行，无干预，仅异常告警",
      description: "高风险和低风险动作全部交由 Hermes 智能体独立做出判断并在后台执行，无任何人工介入确认。存在极高资产受损与逻辑失控风险。默认受安全护栏保护被禁用。",
      badge: "极高风险",
      colorClass: "text-danger",
      bgLightClass: "bg-danger/5",
      borderClass: "border-danger/20 hover:border-danger/40"
    }
  ];

  useEffect(() => {
    let active = true;
    fetch("/api/settings/automation-level")
      .then((res) => {
        if (!res.ok) throw new Error("加载自动化等级配置失败");
        return res.json();
      })
      .then((data) => {
        if (!active) return;
        setCurrentLevel(data.automationLevel || "L2");
        setIsLoading(false);
      })
      .catch((err) => {
        console.error("Error loading automation settings:", err);
        if (active) {
          toast.error("获取当前 Workspace 自动化配置失败");
          setIsLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const handleLevelSelect = (level: "L1" | "L2" | "L3" | "L4") => {
    if (level === currentLevel) return;
    setSelectedLevel(level);

    // 对于 L3 和 L4，进行二次确认弹窗
    if (level === "L3" || level === "L4") {
      setInputToken("");
      setShowConfirmModal(true);
    } else {
      // L1/L2 可以直接静默提交更新
      updateLevel(level);
    }
  };

  const updateLevel = async (level: "L1" | "L2" | "L3" | "L4", token?: string) => {
    setIsUpdating(true);
    const toastId = toast.loading("正在更新 Workspace 自动化授权门禁...");
    try {
      const res = await fetch("/api/settings/automation-level", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          level,
          confirmToken: token
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || data.message || "更新权限失败");
      }

      setCurrentLevel(level);
      toast.success(`自动化授权等级已成功调整为 ${level}！`, { id: toastId });
      setShowConfirmModal(false);
    } catch (err: any) {
      // 捕获 RBAC 拒绝或 token 错误并予以反馈
      toast.error(`授权等级调整失败: ${err.message}`, { id: toastId });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleConfirmSubmit = () => {
    if (!selectedLevel) return;
    if (selectedLevel === "L4") {
      if (inputToken !== L4_CONFIRM_TOKEN) {
        toast.error("确认标识短语输入不正确，拒绝开启 L4 全自动状态！");
        return;
      }
    }
    // L3 同样需要当前图居直接填入令牌（初期共享：当各 OWNER 了解后可通过设置界面操作）
    if (selectedLevel === "L3") {
      if (inputToken !== L3_CONFIRM_TOKEN) {
        toast.error("启用 L3 监督自动需要输入正确的确认令牌！");
        return;
      }
    }
    updateLevel(selectedLevel, inputToken);
  };

  return (
    <PageTransition>
      <div className="p-6 max-w-5xl mx-auto space-y-6 pb-12">
        <Link 
          href="/dashboard"
          className="text-muted-foreground hover:text-foreground text-xs font-medium flex items-center gap-1.5 transition-colors"
        >
          <ArrowLeft className="size-3.5" /> 返回工作台
        </Link>

        <PageHeader 
          title="自动化授权等级配置"
          description="AGENTS.md §5.2 / §6.2 组织级多租户自动化授权控制面板"
        />

        {/* 顶部安全性提示区域 */}
        <div className="bg-card/45 border border-border backdrop-blur-md rounded-2xl p-4 flex gap-3">
          <div className="bg-primary/10 rounded-xl p-2 shrink-0 h-10 w-10 flex items-center justify-center">
            <ShieldCheck className="text-primary size-5" />
          </div>
          <div className="space-y-1">
            <h4 className="text-foreground text-sm font-semibold">自动化授权防线</h4>
            <p className="text-muted-foreground text-xs leading-relaxed">
              这里是系统治理的最核心屏障。调整自动化等级会全局影响本 Workspace 下所有工作流和 Agent 动作的执行门禁限制。
              仅允许工作空间的 **OWNER** 拥有变更权限。任何越权和违规动作都会被实时写入系统审计日志。
            </p>
          </div>
        </div>

        {/* 四大等级卡片 */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 bg-accent/30 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {levels.map((level) => {
              const isCurrent = level.id === currentLevel;
              return (
                <div
                  key={level.id}
                  onClick={() => handleLevelSelect(level.id)}
                  className={cn(
                    "bg-card/40 border rounded-2xl p-5 cursor-pointer transition-all duration-200",
                    "flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative overflow-hidden",
                    isCurrent 
                      ? "border-primary/50 bg-primary/[0.03] shadow-md shadow-primary/5" 
                      : level.borderClass
                  )}
                >
                  {/* 高亮激活条 */}
                  {isCurrent && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
                  )}

                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2.5">
                      <h3 className={cn("text-sm font-bold", isCurrent ? "text-primary" : "text-foreground")}>
                        {level.title}
                      </h3>
                      <span className={cn(
                        "text-[9px] font-bold px-2 py-0.5 rounded border leading-none shrink-0",
                        isCurrent 
                          ? "bg-primary/20 text-primary border-primary/20" 
                          : "bg-accent/40 text-muted-foreground border-border/40"
                      )}>
                        {level.badge}
                      </span>
                    </div>
                    
                    <p className="text-foreground/80 text-xs font-semibold">
                      {level.subTitle}
                    </p>
                    
                    <p className="text-muted-foreground text-xs leading-relaxed max-w-3xl">
                      {level.description}
                    </p>
                  </div>

                  {/* 状态指示勾标 */}
                  <div className="shrink-0 flex items-center justify-end">
                    {isCurrent ? (
                      <div className="bg-primary/10 rounded-full p-2 border border-primary/30">
                        <Check className="text-primary size-5" />
                      </div>
                    ) : level.id === "L4" ? (
                      <div className="bg-danger/10 rounded-full p-2 border border-danger/30">
                        <Lock className="text-danger size-4" />
                      </div>
                    ) : (
                      <div className="bg-accent/20 rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Check className="text-transparent size-5" />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 二次确认弹窗 (L3/L4 确认) */}
        {showConfirmModal && selectedLevel && (
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className={cn(
              "bg-card border rounded-2xl p-6 max-w-lg w-full space-y-6 shadow-2xl relative",
              selectedLevel === "L4" ? "border-danger/40" : "border-warning/40"
            )}>
              <div className="flex items-start gap-4">
                <div className={cn(
                  "rounded-full p-2 shrink-0",
                  selectedLevel === "L4" ? "bg-danger/10" : "bg-warning/10"
                )}>
                  <AlertTriangle className={cn(
                    "size-6",
                    selectedLevel === "L4" ? "text-danger" : "text-warning"
                  )} />
                </div>
                <div className="space-y-2">
                  <h3 className="text-foreground text-base font-bold">
                    {selectedLevel === "L4" ? "警告：是否确认升级至 L4 (全自动) 等级？" : "确认：调整自动化等级为 L3"}
                  </h3>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    {selectedLevel === "L4" ? (
                      "这是极其高危的操作。升级为 L4 状态下系统将开启全自动静默运行模式，包括敏感数据删除、资产操作等所有高风险行为均可在后台自行做出决策并完成，无需人类介入批准！这极易因策略偏离或模型偏置造成无法撤销的重大资产受损。"
                    ) : (
                      "升级至 L3 等级后，普通和低风险性质的任务（如日常会话、比对）将在后台静默自动运行，仅在高风险（数据销毁、出账等）操作时才会拦截。这要求您已确认该工作流中关联的所有智能体运行稳定。是否确认？"
                    )}
                  </p>
                </div>
              </div>

              {selectedLevel === "L4" && (
                <div className="space-y-2 bg-danger/5 border border-danger/20 rounded-xl p-4">
                  <span className="text-[10px] text-danger font-bold flex items-center gap-1">
                    <Info className="size-3.5" /> 风险释放安全验证
                  </span>
                  <p className="text-hint text-[10px] leading-snug">
                    若您经过详细安全评估确知一切后果并执意开启，请在下方文本框中输入确认标识短语：
                    <code className="text-danger font-bold bg-danger/10 rounded px-1.5 py-0.5 mx-1 font-mono text-[9px]">{L4_CONFIRM_TOKEN}</code>
                  </p>
                  <input
                    type="text"
                    value={inputToken}
                    onChange={(e) => setInputToken(e.target.value)}
                    placeholder="请输入安全确认令牌"
                    className="w-full bg-background border border-danger/30 rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-danger font-mono"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
                <button
                  disabled={isUpdating}
                  onClick={() => setShowConfirmModal(false)}
                  className="bg-accent hover:bg-accent/80 border border-border text-foreground text-xs font-semibold rounded-lg px-4 py-2 transition-all disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  disabled={isUpdating || (selectedLevel === "L4" && inputToken !== L4_CONFIRM_TOKEN)}
                  onClick={handleConfirmSubmit}
                  className={cn(
                    "text-xs font-semibold rounded-lg px-4 py-2 transition-all shadow-sm text-primary-foreground disabled:opacity-50",
                    selectedLevel === "L4" 
                      ? "bg-danger hover:bg-danger/95" 
                      : "bg-primary hover:bg-primary/95"
                  )}
                >
                  确认启用
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
