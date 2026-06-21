"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@/hooks/use-user";
import { toast } from "sonner";
import { 
  Sparkles, 
  MessageSquare,
  Gift,
  Copy,
  Check,
  Loader2,
  ChevronDown,
  ChevronUp,
  UserPlus,
  Compass,
  ArrowRight,
  TrendingUp,
  CheckCircle2,
  HelpCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const TwitterIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

interface RewardTask {
  taskId: string;
  completed: boolean;
  completedAt: string | null;
}

interface InviteItem {
  email: string;
  date: string;
  status: string;
  points: number;
}

interface InvitesResponse {
  data: InviteItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export default function RewardsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { points, setPoints } = useUser();

  // Tab 状态：「tasks」或「invites」
  const [activeTab, setActiveTab] = useState<"tasks" | "invites">("tasks");

  // 折叠/展开状态 (X 与 Discord 默认展开)
  const [xExpanded, setXExpanded] = useState(true);
  const [discordExpanded, setDiscordExpanded] = useState(true);

  // 邀请分页状态
  const [invitePage, setInvitePage] = useState(1);

  // 复制状态
  const [copied, setCopied] = useState(false);

  // 按钮局部 Loading 追踪 (防重复点击)
  const [loadingTaskId, setLoadingTaskId] = useState<string | null>(null);

  // 1. React Query 拉取任务状态
  const { data: tasks, isLoading: tasksLoading } = useQuery<RewardTask[]>({
    queryKey: ["rewardTasks"],
    queryFn: () => fetch("/api/rewards/tasks").then((res) => res.json())
  });

  // 2. React Query 拉取邀请链接
  const { data: inviteLinkData } = useQuery<{ url: string }>({
    queryKey: ["inviteLink"],
    queryFn: () => fetch("/api/rewards/invite-link").then((res) => res.json()),
    enabled: activeTab === "invites"
  });

  // 3. React Query 拉取邀请记录 (带分页与缓存管理)
  const { data: invitesData, isLoading: invitesLoading } = useQuery<InvitesResponse>({
    queryKey: ["invitesList", invitePage],
    queryFn: () => fetch(`/api/rewards/invites?page=${invitePage}&limit=4`).then((res) => res.json()),
    enabled: activeTab === "invites"
  });

  // 4. 任务模拟点击完成 (乐观更新与 Zustand 积分同步)
  const handleCompleteTask = async (taskId: string, reward: number) => {
    setLoadingTaskId(taskId);
    
    // 模拟延迟 1s 的 OAuth 交互或现场状态查询
    setTimeout(() => {
      // 乐观修改 React Query 的缓存数据
      queryClient.setQueryData<RewardTask[]>(["rewardTasks"], (oldTasks) => {
        if (!oldTasks) return [];
        return oldTasks.map((t) => 
          t.taskId === taskId 
            ? { ...t, completed: true, completedAt: new Date().toISOString().replace("T", " ").substring(0, 16) } 
            : t
        );
      });

      // 实时更新全局 Zustand 积分余额
      setPoints(points + reward);
      toast.success(`恭喜完成任务！已向账户注入 ${reward} 积分`);
      setLoadingTaskId(null);
    }, 1000);
  };

  // 5. 复制专属链接
  const handleCopyLink = () => {
    if (!inviteLinkData?.url) return;
    navigator.clipboard.writeText(inviteLinkData.url);
    setCopied(true);
    toast.success("邀请链接已复制到剪贴板");
    setTimeout(() => setCopied(false), 2000);
  };

  // 计算积分总览与进度条
  const totalTasks = tasks?.length || 10;
  const completedTasks = tasks?.filter((t) => t.completed).length || 0;
  const taskProgressPercentage = parseFloat(((completedTasks / totalTasks) * 100).toFixed(0));

  // 获取特定任务的状态
  const getTaskStatus = (taskId: string) => {
    return tasks?.find((t) => t.taskId === taskId) || { completed: false };
  };

  const discordStep1 = getTaskStatus("task_connect_discord");

  return (
    <div className="min-h-screen bg-[#050505] text-[#F5F5F5] font-sans px-6 py-12 md:px-12 lg:px-24 select-none relative overflow-x-hidden">
      {/* 顶部标题区 */}
      <div className="max-w-6xl mx-auto flex flex-col lg:flex-row justify-between items-start gap-8 relative">
        <div className="space-y-2 max-w-2xl">
          <div className="text-3xl md:text-4xl font-extrabold tracking-tight">奖励</div>
          <p className="text-sm text-[#B3B3B3] leading-relaxed">
            在 HermesClaw 赚取积分的所有方式
          </p>
        </div>

        {/* ==========================================
            积分总览悬浮卡
           ========================================== */}
        <div className="w-full lg:w-[260px] bg-[#111111] border border-[#262626] rounded-[16px] p-4 space-y-4 shrink-0 shadow-lg">
          <div className="space-y-0.5">
            <span className="text-[10px] text-[#B3B3B3]/60 font-semibold tracking-wider uppercase">当前积分余额</span>
            <div className="text-[#F5F5F5] text-2xl font-bold font-mono flex items-center gap-1.5 pt-0.5">
              <Sparkles className="size-5 text-[#6D5EF9] fill-[#6D5EF9]" />
              {points}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-[10px] text-[#B3B3B3]">
              <span>任务进度 ({completedTasks}/{totalTasks})</span>
              <span>{taskProgressPercentage}%</span>
            </div>
            <div className="w-full h-1.5 bg-[#262626] rounded-full overflow-hidden border border-[#333333]/30">
              <div 
                className="h-full bg-[#6D5EF9] transition-all duration-500 rounded-full"
                style={{ width: `${taskProgressPercentage}%` }}
              />
            </div>
          </div>

          <button
            onClick={() => router.push("/settings/billing")}
            className="text-[11px] text-[#6D5EF9] hover:text-[#6D5EF9]/90 font-semibold text-left flex items-center gap-0.5 cursor-pointer bg-transparent border-none outline-none group"
          >
            前往账单充值
            <ArrowRight className="size-3.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-200" />
          </button>
        </div>
      </div>

      {/* Tab 切换栏 */}
      <div className="max-w-6xl mx-auto mt-10 border-b border-[#262626]">
        <div className="flex gap-6">
          <button
            onClick={() => setActiveTab("tasks")}
            className={`pb-3 text-sm font-semibold tracking-wide transition-all relative cursor-pointer ${
              activeTab === "tasks"
                ? "text-[#F5F5F5]"
                : "text-[#B3B3B3]/50 hover:text-[#F5F5F5]"
            }`}
          >
            任务
            {activeTab === "tasks" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#6D5EF9] rounded-full" />
            )}
          </button>
          
          <button
            onClick={() => setActiveTab("invites")}
            className={`pb-3 text-sm font-semibold tracking-wide transition-all relative cursor-pointer ${
              activeTab === "invites"
                ? "text-[#F5F5F5]"
                : "text-[#B3B3B3]/50 hover:text-[#F5F5F5]"
            }`}
          >
            邀请
            {activeTab === "invites" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#6D5EF9] rounded-full" />
            )}
          </button>
        </div>
      </div>

      {/* 内容区 */}
      <div className="max-w-6xl mx-auto mt-8">
        {activeTab === "tasks" ? (
          /* ==========================================
              任务 TAB
             ========================================== */
          tasksLoading ? (
            <div className="space-y-6">
              <Skeleton className="h-44 w-full bg-[#111111] rounded-[16px] border border-[#262626]" />
              <Skeleton className="h-44 w-full bg-[#111111] rounded-[16px] border border-[#262626]" />
            </div>
          ) : (
            <div className="space-y-10">
              {/* 第1层：社交连接任务 */}
              <div className="space-y-4">
                {/* 1. X (Twitter) 卡片 */}
                <div className="bg-[#171717] border border-[#262626] rounded-[16px] shadow-sm overflow-hidden">
                  <div 
                    onClick={() => setXExpanded(!xExpanded)}
                    className="p-5 flex justify-between items-center cursor-pointer hover:bg-[#1C1C1C] transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="size-11 rounded-full bg-[#050505] flex items-center justify-center text-[#F5F5F5] border border-[#262626] shrink-0">
                        <TwitterIcon className="size-5" />
                      </div>
                      <div className="space-y-0.5">
                        <div className="text-[#F5F5F5] text-sm font-semibold">X (Twitter) 连接</div>
                        <p className="text-xs text-[#B3B3B3]/60">连接账号即可获得额外积分</p>
                      </div>
                    </div>
                    <div className="text-[#B3B3B3]/80">
                      {xExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                    </div>
                  </div>

                  {xExpanded && (
                    <div className="border-t border-[#262626] px-5 py-2.5 bg-[#111111]/40 space-y-1">
                      {/* 子任务 01 */}
                      {(() => {
                        const task = getTaskStatus("task_connect_x");
                        return (
                          <div className="flex items-center justify-between py-3 border-b border-[#262626]/40 last:border-none">
                            <div className="flex items-center gap-3">
                              {task.completed ? (
                                <CheckCircle2 className="size-4 text-[#6D5EF9]" />
                              ) : (
                                <span className="size-4 rounded-full border-2 border-[#262626]" />
                              )}
                              <div>
                                <div className="text-xs font-semibold text-[#F5F5F5]">连接你的 X 账号</div>
                                <span className="text-[10px] text-[#B3B3B3]/40">5 积分</span>
                              </div>
                            </div>
                            <Button
                              onClick={() => handleCompleteTask("task_connect_x", 5)}
                              disabled={task.completed || loadingTaskId === "task_connect_x"}
                              className={`h-7 px-3 rounded-[10px] text-[10px] font-bold cursor-pointer ${
                                task.completed
                                  ? "bg-[#262626] text-[#B3B3B3]/40 border-none cursor-not-allowed"
                                  : "bg-[#6D5EF9] hover:bg-[#6D5EF9]/90 text-white"
                              }`}
                            >
                              {loadingTaskId === "task_connect_x" && <Loader2 className="size-3 animate-spin mr-1" />}
                              {task.completed ? "已完成" : "连接 X"}
                            </Button>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>

                {/* 2. Discord 卡片 */}
                <div className="bg-[#171717] border border-[#262626] rounded-[16px] shadow-sm overflow-hidden">
                  <div 
                    onClick={() => setDiscordExpanded(!discordExpanded)}
                    className="p-5 flex justify-between items-center cursor-pointer hover:bg-[#1C1C1C] transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="size-11 rounded-full bg-[#050505] flex items-center justify-center text-[#F5F5F5] border border-[#262626] shrink-0">
                        <MessageSquare className="size-5" />
                      </div>
                      <div className="space-y-0.5">
                        <div className="text-[#F5F5F5] text-sm font-semibold">Discord 连接</div>
                        <p className="text-xs text-[#B3B3B3]/60">关联您的 Discord 即可获得大量配额</p>
                      </div>
                    </div>
                    <div className="text-[#B3B3B3]/80">
                      {discordExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                    </div>
                  </div>

                  {discordExpanded && (
                    <div className="border-t border-[#262626] px-5 py-2.5 bg-[#111111]/40 space-y-1">
                      {/* 子任务 01 */}
                      {(() => {
                        const task = getTaskStatus("task_connect_discord");
                        return (
                          <div className="flex items-center justify-between py-3 border-b border-[#262626]/40">
                            <div className="flex items-center gap-3">
                              {task.completed ? (
                                <CheckCircle2 className="size-4 text-[#6D5EF9]" />
                              ) : (
                                <span className="size-4 rounded-full border-2 border-[#262626]" />
                              )}
                              <div>
                                <div className="text-xs font-semibold text-[#F5F5F5]">连接 Discord 账号</div>
                                <span className="text-[10px] text-[#B3B3B3]/40">5 积分</span>
                              </div>
                            </div>
                            <Button
                              onClick={() => handleCompleteTask("task_connect_discord", 5)}
                              disabled={task.completed || loadingTaskId === "task_connect_discord"}
                              className={`h-7 px-3 rounded-[10px] text-[10px] font-bold cursor-pointer ${
                                task.completed
                                  ? "bg-[#262626] text-[#B3B3B3]/40 border-none cursor-not-allowed"
                                  : "bg-[#6D5EF9] hover:bg-[#6D5EF9]/90 text-white"
                              }`}
                            >
                              {loadingTaskId === "task_connect_discord" && <Loader2 className="size-3 animate-spin mr-1" />}
                              {task.completed ? "已完成" : "连接 Discord"}
                            </Button>
                          </div>
                        );
                      })()}

                      {/* 子任务 02 (依赖步骤 01 防御) */}
                      {(() => {
                        const task = getTaskStatus("task_join_discord");
                        const step1Completed = discordStep1.completed;
                        return (
                          <div className="flex items-center justify-between py-3 border-b border-[#262626]/40 last:border-none">
                            <div className="flex items-center gap-3">
                              {task.completed ? (
                                <CheckCircle2 className="size-4 text-[#6D5EF9]" />
                              ) : (
                                <span className="size-4 rounded-full border-2 border-[#262626]" />
                              )}
                              <div>
                                <div className="text-xs font-semibold text-[#F5F5F5]">加入我们的 Discord 服务器</div>
                                <span className="text-[10px] text-[#B3B3B3]/40">10 积分</span>
                              </div>
                            </div>
                            <Button
                              onClick={() => handleCompleteTask("task_join_discord", 10)}
                              disabled={task.completed || !step1Completed || loadingTaskId === "task_join_discord"}
                              className={`h-7 px-3 rounded-[10px] text-[10px] font-bold cursor-pointer ${
                                task.completed
                                  ? "bg-[#262626] text-[#B3B3B3]/40 border-none cursor-not-allowed"
                                  : !step1Completed
                                  ? "bg-[#262626] text-[#B3B3B3]/25 border-none cursor-not-allowed"
                                  : "bg-[#6D5EF9] hover:bg-[#6D5EF9]/90 text-white"
                              }`}
                            >
                              {loadingTaskId === "task_join_discord" && <Loader2 className="size-3 animate-spin mr-1" />}
                              {task.completed ? "已完成" : !step1Completed ? "请先完成上方步骤" : "加入 Discord 服务器"}
                            </Button>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>

              {/* 第2层：新手激活任务 */}
              <div className="space-y-4 pt-4">
                <div className="text-base font-bold flex items-center gap-1.5 select-none">
                  <Compass className="size-5 text-[#6D5EF9]" />
                  新手任务
                </div>
                
                <div className="bg-[#111111] border border-[#262626] rounded-[16px] divide-y divide-[#262626]/40 overflow-hidden shadow-sm">
                  {[
                    { id: "task_verify_email", label: "验证邮箱", reward: 5 },
                    { id: "task_create_workspace", label: "创建第一个 Workspace", reward: 20 },
                    { id: "task_bind_connector", label: "绑定第一个连接器", reward: 20 },
                    { id: "task_run_workflow", label: "运行第一个 Workflow", reward: 30 },
                    { id: "task_enable_pack", label: "启用第一个 Industry Pack", reward: 30 }
                  ].map((item) => {
                    const task = getTaskStatus(item.id);
                    return (
                      <div key={item.id} className="flex items-center justify-between p-4 hover:bg-[#171717]/30 transition-colors">
                        <div className="flex items-center gap-3">
                          {task.completed ? (
                            <CheckCircle2 className="size-4 text-[#6D5EF9]" />
                          ) : (
                            <span className="size-4 rounded-full border-2 border-[#262626]" />
                          )}
                          <div>
                            <div className="text-xs font-semibold text-[#F5F5F5]">{item.label}</div>
                            <span className="text-[10px] text-[#B3B3B3]/40">{item.reward} 积分</span>
                          </div>
                        </div>
                        <Button
                          onClick={() => handleCompleteTask(item.id, item.reward)}
                          disabled={task.completed || loadingTaskId === item.id}
                          className={`h-7 px-3.5 rounded-[10px] text-[10px] font-bold cursor-pointer ${
                            task.completed
                              ? "bg-[#262626] text-[#B3B3B3]/40 border-none cursor-not-allowed"
                              : "bg-[#1F1F1F] border border-[#262626] hover:bg-[#2A2A2A] text-white"
                          }`}
                        >
                          {loadingTaskId === item.id && <Loader2 className="size-3 animate-spin mr-1" />}
                          {task.completed ? "已完成" : "完成"}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 第3层：每日任务 */}
              <div className="space-y-4 pt-4">
                <div className="space-y-0.5 select-none">
                  <div className="text-base font-bold flex items-center gap-1.5">
                    <TrendingUp className="size-5 text-[#6D5EF9]" />
                    每日任务
                  </div>
                  <p className="text-[10px] text-[#B3B3B3]/50">每天可重复领取</p>
                </div>
                
                <div className="bg-[#111111] border border-[#262626] rounded-[16px] divide-y divide-[#262626]/40 overflow-hidden shadow-sm">
                  {[
                    { id: "task_daily_login", label: "每日登录签到", reward: 2 },
                    { id: "task_run_workflow_daily", label: "完成1个工作流执行", reward: 3 }
                  ].map((item) => {
                    const task = getTaskStatus(item.id);
                    return (
                      <div key={item.id} className="flex items-center justify-between p-4 hover:bg-[#171717]/30 transition-colors">
                        <div className="flex items-center gap-3">
                          {task.completed ? (
                            <CheckCircle2 className="size-4 text-[#6D5EF9]" />
                          ) : (
                            <span className="size-4 rounded-full border-2 border-[#262626]" />
                          )}
                          <div>
                            <div className="text-xs font-semibold text-[#F5F5F5]">{item.label}</div>
                            <span className="text-[10px] text-[#B3B3B3]/40">{item.reward} 积分</span>
                          </div>
                        </div>
                        <Button
                          onClick={() => handleCompleteTask(item.id, item.reward)}
                          disabled={task.completed || loadingTaskId === item.id}
                          className={`h-7 px-3.5 rounded-[10px] text-[10px] font-bold cursor-pointer ${
                            task.completed
                              ? "bg-[#262626] text-[#B3B3B3]/40 border-none cursor-not-allowed"
                              : "bg-[#1F1F1F] border border-[#262626] hover:bg-[#2A2A2A] text-white"
                          }`}
                        >
                          {loadingTaskId === item.id && <Loader2 className="size-3 animate-spin mr-1" />}
                          {task.completed ? "已完成" : "领取"}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )
        ) : (
          /* ==========================================
              邀请 TAB
             ========================================== */
          <div className="space-y-6">
            {/* 顶部说明与邀请卡 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 select-none">
              <div className="lg:col-span-2 bg-[#111111] border border-[#262626] rounded-[16px] p-5 flex flex-col justify-between min-h-[140px] shadow-sm">
                <div className="space-y-1">
                  <span className="text-xs text-[#F5F5F5] font-semibold flex items-center gap-1">
                    <UserPlus className="size-4 text-[#6D5EF9]" />
                    专属邀请成长链接
                  </span>
                  <p className="text-[10px] text-[#B3B3B3]/50 leading-relaxed">
                    邀请朋友注册，每成功邀请1人获得50积分，受邀人注册后获得20积分
                  </p>
                </div>
                
                {/* 链接卡片 */}
                {inviteLinkData ? (
                  <div className="flex gap-2 items-center bg-[#171717] border border-[#262626] rounded-xl h-10 px-3 relative group mt-3">
                    <div className="font-mono text-xs text-[#B3B3B3] break-all select-all flex-1 pr-12 truncate">
                      {inviteLinkData.url}
                    </div>
                    <button
                      onClick={handleCopyLink}
                      className="absolute right-2 top-1/2 -translate-y-1/2 flex h-7 px-3 items-center justify-center gap-1 rounded-lg bg-[#262626] hover:bg-[#333333] border border-[#333333] text-[10px] font-bold text-[#B3B3B3] hover:text-[#F5F5F5] transition-all cursor-pointer"
                    >
                      {copied ? (
                        <>
                          <Check className="size-3 text-[#6D5EF9]" />
                          已复制 ✓
                        </>
                      ) : (
                        <>
                          <Copy className="size-3" />
                          复制
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  <Skeleton className="h-10 w-full bg-[#171717] border border-[#262626] rounded-xl mt-3" />
                )}
              </div>

              {/* 固定说明卡 */}
              <div className="bg-[#111111] border border-[#262626] rounded-[16px] p-5 flex flex-col justify-center space-y-1.5 shadow-sm text-center">
                <div className="text-2xl font-bold font-mono text-[#6D5EF9]">+50</div>
                <div className="text-xs font-semibold text-[#F5F5F5]">每人次注册返现</div>
                <p className="text-[9px] text-[#B3B3B3]/40 leading-relaxed max-w-[200px] mx-auto">
                  返还积分自动存入您的订阅余额中，终身可累加，无充值金额限制。
                </p>
              </div>
            </div>

            {/* 邀请记录列表 (带分页) */}
            <div className="bg-[#111111] border border-[#262626] rounded-[16px] p-5 space-y-4">
              <div className="text-[#F5F5F5] text-sm font-semibold select-none flex items-center gap-1.5">
                <Gift className="size-4 text-[#6D5EF9]" />
                我的邀请记录
              </div>

              {invitesLoading ? (
                <Skeleton className="h-44 w-full bg-[#171717]/40 rounded-xl border border-[#262626]/60" />
              ) : !invitesData || invitesData.data.length === 0 ? (
                /* 空态 */
                <div className="p-10 border border-[#262626] border-dashed rounded-xl text-center flex flex-col items-center justify-center space-y-3 select-none">
                  <div className="size-10 rounded-full bg-[#171717] border border-[#262626] flex items-center justify-center text-[#B3B3B3]">
                    <HelpCircle className="size-5" />
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-xs text-[#F5F5F5] font-semibold">暂无邀请记录</div>
                    <p className="text-[10px] text-[#B3B3B3]/50">您的受邀人注册后将直接在此处呈现</p>
                  </div>
                </div>
              ) : (
                /* 邀请表格及分页 */
                <div className="space-y-4 select-none">
                  <div className="overflow-x-auto border border-[#262626] rounded-xl">
                    <table className="w-full text-left border-collapse text-xs text-[#B3B3B3]">
                      <thead>
                        <tr className="bg-[#171717] border-b border-[#262626] text-[#F5F5F5] font-semibold">
                          <th className="p-3.5">受邀人邮箱</th>
                          <th className="p-3.5">注册时间</th>
                          <th className="p-3.5">当前状态</th>
                          <th className="p-3.5 text-right">奖励积分</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invitesData.data.map((inv, idx) => (
                          <tr key={idx} className="border-b border-[#262626]/50 hover:bg-[#171717]/40 transition-colors">
                            <td className="p-3.5 font-medium text-[#F5F5F5]">{inv.email}</td>
                            <td className="p-3.5">{inv.date}</td>
                            <td className="p-3.5">
                              {inv.status === "Registered" ? (
                                <span className="inline-flex px-1.5 py-0.5 rounded-[4px] text-[9px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 leading-none">
                                  已注册
                                </span>
                              ) : (
                                <span className="inline-flex px-1.5 py-0.5 rounded-[4px] text-[9px] font-semibold bg-[#262626] text-[#B3B3B3] border border-[#333333] leading-none">
                                  等待中
                                </span>
                              )}
                            </td>
                            <td className="p-3.5 text-right font-mono font-bold text-[#F5F5F5]">
                              {inv.points > 0 ? `+${inv.points} ⚡` : "0"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* 分页控制器 */}
                  {invitesData.pagination.totalPages > 1 && (
                    <div className="flex justify-between items-center pt-2">
                      <span className="text-[10px] text-[#B3B3B3]/50">
                        第 {invitesData.pagination.page} 页 / 共 {invitesData.pagination.totalPages} 页
                      </span>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          disabled={invitePage === 1}
                          onClick={() => setInvitePage((p) => p - 1)}
                          className="h-8 rounded-lg px-3 text-[10px] border-[#262626] bg-transparent text-[#B3B3B3] hover:bg-[#1F1F1F] cursor-pointer"
                        >
                          上一页
                        </Button>
                        <Button
                          variant="outline"
                          disabled={invitePage === invitesData.pagination.totalPages}
                          onClick={() => setInvitePage((p) => p + 1)}
                          className="h-8 rounded-lg px-3 text-[10px] border-[#262626] bg-transparent text-[#B3B3B3] hover:bg-[#1F1F1F] cursor-pointer"
                        >
                          下一页
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
