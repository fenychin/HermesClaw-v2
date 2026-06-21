/**
 * 用户积分与套餐状态
 * Phase 2: 从真实 API 初始化（替换旧硬编码 mock）
 */
import { create } from "zustand";

interface UserState {
  points: number;
  subscriptionPoints: number;
  dailyRewardPoints: number;
  maxDailyRewardPoints: number;
  plan: "free" | "pro" | "enterprise";
  setPoints: (points: number) => void;
  setSubscriptionPoints: (points: number) => void;
  setDailyRewardPoints: (points: number) => void;
  setPlan: (plan: "free" | "pro" | "enterprise") => void;
  claimDailyReward: () => Promise<void>;
  /** 从服务端同步积分数据 */
  syncFromServer: () => Promise<void>;
}

export const useUser = create<UserState>((set, get) => ({
  // 默认值（服务端数据加载前使用）
  points: 0,
  subscriptionPoints: 0,
  dailyRewardPoints: 0,
  maxDailyRewardPoints: 5,
  plan: "free",

  setPoints: (points) => set({ points }),
  setSubscriptionPoints: (subscriptionPoints) => set({ subscriptionPoints }),
  setDailyRewardPoints: (dailyRewardPoints) => set({ dailyRewardPoints }),
  setPlan: (plan) => set({ plan }),

  claimDailyReward: async () => {
    // 调用服务端每日签到 API（带日期级去重）
    try {
      const res = await fetch("/api/rewards/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: "task_daily_login" }),
      });
      const data = await res.json();
      if (data.success) {
        const state = get();
        set({
          dailyRewardPoints: state.dailyRewardPoints + 1,
          points: state.points + data.points,
        });
      }
    } catch {
      // 静默失败，保持现有状态
    }
  },

  /** 从服务端同步积分和套餐数据 */
  syncFromServer: async () => {
    try {
      // 并行获取积分和套餐
      const [subRes, billingRes] = await Promise.all([
        fetch("/api/billing/subscription").then((r) => r.json()).catch(() => ({ planId: "free" })),
        fetch("/api/billing/overview").then((r) => r.json()).catch(() => ({ credits: { total: 0 } })),
      ]);

      const planId = subRes.planId || "free";
      const planMap: Record<string, "free" | "pro" | "enterprise"> = {
        free: "free",
        pro: "pro",
        pro_plus: "pro",
        max: "enterprise",
        ultra: "enterprise",
      };

      set({
        points: billingRes.credits?.total || 0,
        plan: planMap[planId] || "free",
      });
    } catch {
      // 静默失败，使用本地状态
    }
  },
}));
