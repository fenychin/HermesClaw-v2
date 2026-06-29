/**
 * 积分服务 (Credit Service)
 * —— 管理用户积分收支、奖励发放、去重验证
 * —— Phase 2 新增，替换旧 Zustand mock
 */
import { prisma } from "@/lib/prisma";

/** 积分交易类型 */
export type CreditType =
  | "subscription"
  | "daily_reward"
  | "reward_task"
  | "invite_bonus"
  | "purchase"
  | "usage";

/** 奖励任务定义 */
const REWARD_TASKS = [
  { taskId: "task_connect_x", type: "connect_x" as const, points: 5, label: "连接 X (Twitter) 账号" },
  { taskId: "task_connect_discord", type: "connect_discord" as const, points: 5, label: "连接 Discord 账号" },
  { taskId: "task_join_discord", type: "join_discord" as const, points: 3, label: "加入 Discord 社区" },
  { taskId: "task_verify_email", type: "verify_email" as const, points: 5, label: "验证邮箱地址" },
  { taskId: "task_create_workspace", type: "create_workspace" as const, points: 10, label: "创建第一个工作空间" },
  { taskId: "task_bind_connector", type: "bind_connector" as const, points: 10, label: "绑定外部连接器" },
  { taskId: "task_run_workflow", type: "run_workflow" as const, points: 15, label: "成功运行一次工作流" },
  { taskId: "task_enable_pack", type: "enable_pack" as const, points: 20, label: "安装一个行业包" },
  { taskId: "task_daily_login", type: "daily_login" as const, points: 2, label: "每日登录签到" },
  { taskId: "task_run_workflow_daily", type: "run_workflow_daily" as const, points: 3, label: "每日执行一次工作流" },
] as const;

export type RewardTaskId = (typeof REWARD_TASKS)[number]["taskId"];

/** 获取用户总积分 */
export async function getUserPoints(userId: string): Promise<number> {
  const result = await prisma.creditLedger.aggregate({
    where: { userId },
    _sum: { amount: true },
  });
  return result._sum.amount || 0;
}

/** 获取用户积分明细 */
export async function getCreditHistory(
  userId: string,
  limit = 50,
  offset = 0
) {
  return prisma.creditLedger.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
  });
}

/** 获取用户已完成的奖励任务列表 */
export async function getUserRewards(userId: string) {
  const allTasks = REWARD_TASKS.map((t) => ({
    taskId: t.taskId,
    points: t.points,
    label: t.label,
  }));

  const completed = await prisma.rewardLedger.findMany({
    where: { userId, status: "awarded" },
    select: { taskId: true, awardedAt: true },
  });

  const completedMap = new Map(completed.map((c) => [c.taskId, c.awardedAt]));

  return allTasks.map((task) => ({
    taskId: task.taskId,
    completed: completedMap.has(task.taskId),
    completedAt: completedMap.get(task.taskId)?.toISOString() || null,
  }));
}

/** 完成任务并发放积分（带去重保护） */
export async function completeRewardTask(
  userId: string,
  workspaceId: string,
  taskId: RewardTaskId
): Promise<{ success: boolean; points: number; error?: string }> {
  // 1. 查找任务定义
  const taskDef = REWARD_TASKS.find((t) => t.taskId === taskId);
  if (!taskDef) {
    return { success: false, points: 0, error: "未知任务" };
  }

  // 2. 去重检查
  const existing = await prisma.rewardLedger.findUnique({
    where: { userId_taskId: { userId, taskId } },
  });
  if (existing && existing.status === "awarded") {
    return { success: false, points: 0, error: "该任务已完成，不能重复领取" };
  }

  // 3. 写入奖励记录（upsert 防并发）
  await prisma.rewardLedger.upsert({
    where: { userId_taskId: { userId, taskId } },
    create: {
      userId,
      workspaceId,
      taskId,
      rewardType: taskDef.type,
      points: taskDef.points,
      status: "awarded",
      awardedAt: new Date(),
    },
    update: {
      status: "awarded",
      awardedAt: new Date(),
      points: taskDef.points,
    },
  });

  // 4. 写入积分流水
  await prisma.creditLedger.create({
    data: {
      userId,
      workspaceId,
      amount: taskDef.points,
      type: "reward_task",
      description: `完成任务: ${taskDef.label}`,
      referenceId: taskId,
    },
  });

  return { success: true, points: taskDef.points };
}

/** 每日签到领取 */
export async function claimDailyReward(
  userId: string,
  workspaceId: string
): Promise<{ success: boolean; points: number; error?: string }> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // 检查今日是否已签到
  const todayClaim = await prisma.creditLedger.findFirst({
    where: {
      userId,
      type: "daily_reward",
      createdAt: { gte: today, lt: tomorrow },
    },
  });

  if (todayClaim) {
    return { success: false, points: 0, error: "今日已签到" };
  }

  await prisma.creditLedger.create({
    data: {
      userId,
      workspaceId,
      amount: 2,
      type: "daily_reward",
      description: `每日登录签到 ${today.toISOString().split("T")[0]}`,
    },
  });

  return { success: true, points: 2 };
}

/** 发放邀请奖励 */
export async function awardInviteBonus(
  inviterId: string,
  workspaceId: string,
  inviteId: string
): Promise<void> {
  await prisma.creditLedger.create({
    data: {
      userId: inviterId,
      workspaceId,
      amount: 50,
      type: "invite_bonus",
      description: "邀请奖励：好友注册成功",
      referenceId: inviteId,
    },
  });

  await prisma.invite.update({
    where: { id: inviteId },
    data: { status: "registered", pointsAwarded: 50, registeredAt: new Date() },
  });
}

/** 订阅积分发放（由 webhook / cron 触发） */
export async function creditSubscriptionPoints(
  userId: string,
  workspaceId: string,
  planId: string
): Promise<void> {
  const planPoints: Record<string, number> = {
    free: 30,
    pro: 200,
    pro_plus: 600,
    max: 2000,
    ultra: 20000,
  };

  const points = planPoints[planId] || 0;
  if (points > 0) {
    await prisma.creditLedger.create({
      data: {
        userId,
        workspaceId,
        amount: points,
        type: "subscription",
        description: `套餐积分: ${planId}`,
      },
    });
  }
}

export { REWARD_TASKS };
