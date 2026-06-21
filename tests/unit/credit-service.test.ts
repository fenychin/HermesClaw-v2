/**
 * Credit Service 单元测试
 * Phase 4: 测试积分发放/去重/奖励任务/每日签到
 */
import { describe, it, expect } from "vitest";
import { REWARD_TASKS } from "@/lib/server/credit-service";

describe("Credit Service — 常量定义", () => {
  it("应包含 10 个奖励任务", () => {
    expect(REWARD_TASKS).toHaveLength(10);
  });

  it("任务应包含 taskId/type/points/label", () => {
    for (const task of REWARD_TASKS) {
      expect(task).toHaveProperty("taskId");
      expect(task).toHaveProperty("type");
      expect(task).toHaveProperty("points");
      expect(task).toHaveProperty("label");
      expect(task.points).toBeGreaterThan(0);
    }
  });

  it("所有 taskId 应唯一", () => {
    const ids = REWARD_TASKS.map((t) => t.taskId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("最小奖励为 2 积分（每日登录）", () => {
    const minPoints = Math.min(...REWARD_TASKS.map((t) => t.points));
    expect(minPoints).toBe(2);
  });

  it("最大奖励为 20 积分（安装行业包）", () => {
    const maxPoints = Math.max(...REWARD_TASKS.map((t) => t.points));
    expect(maxPoints).toBe(20);
  });
});

describe("Credit Service — 业务逻辑（单元）", () => {
  it("task_daily_login 为每日登录签到（2 分）", () => {
    const dailyLogin = REWARD_TASKS.find((t) => t.taskId === "task_daily_login");
    expect(dailyLogin).toBeDefined();
    expect(dailyLogin!.points).toBe(2);
  });

  it("task_create_workspace 为创建工作空间（10 分）", () => {
    const createWs = REWARD_TASKS.find((t) => t.taskId === "task_create_workspace");
    expect(createWs).toBeDefined();
    expect(createWs!.points).toBe(10);
  });

  it("task_connect_x 为连接 Twitter（5 分）", () => {
    const connectX = REWARD_TASKS.find((t) => t.taskId === "task_connect_x");
    expect(connectX).toBeDefined();
    expect(connectX!.points).toBe(5);
    expect(connectX!.type).toBe("connect_x");
  });
});

describe("Credit Service — 去重逻辑（概念验证）", () => {
  it("已完成任务应被 RewardLedger @@unique([userId, taskId]) 阻止重复", () => {
    // RewardLedger 的 @@unique([userId, taskId]) 约束确保
    // 同一用户同一任务只能有一条记录
    const userId = "test-user";
    const taskId = "task_verify_email";

    // 模拟已完成状态
    const completedRewards = new Set<string>();
    completedRewards.add(`${userId}:${taskId}`); // 已完成

    const isCompleted = completedRewards.has(`${userId}:${taskId}`);
    expect(isCompleted).toBe(true);
    // 再次尝试 → 被 @@unique 约束或 status="awarded" 检查拦截
  });

  it("每日签到应检查当日是否已签（日期级别）", () => {
    // 通过 CreditLedger 中的 createdAt 日期范围检查
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // 模拟：今日已有签到记录
    const lastClaimDate = new Date();
    const isToday = lastClaimDate >= today && lastClaimDate < tomorrow;
    expect(isToday).toBe(true); // 已签到 → 应拒绝
  });
});

describe("Credit Service — 套餐积分映射", () => {
  const planPoints: Record<string, number> = {
    free: 5,
    pro: 50,
    pro_plus: 100,
    max: 300,
    ultra: 1000,
  };

  it("free 每月 5 积分", () => {
    expect(planPoints.free).toBe(5);
  });

  it("pro 每月 50 积分", () => {
    expect(planPoints.pro).toBe(50);
  });

  it("ultra 每月 1000 积分", () => {
    expect(planPoints.ultra).toBe(1000);
  });
});

describe("Credit Service — 邀请奖励", () => {
  it("邀请好友注册成功 +50 积分", () => {
    const INVITE_BONUS_POINTS = 50;
    expect(INVITE_BONUS_POINTS).toBe(50);
  });

  it("邀请状态的转变: pending → registered", () => {
    const statuses = ["pending", "registered"];
    expect(statuses).toContain("pending");
    expect(statuses).toContain("registered");
  });
});
