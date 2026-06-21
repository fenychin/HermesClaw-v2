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
  claimDailyReward: () => void;
}

export const useUser = create<UserState>((set) => ({
  points: 125,
  subscriptionPoints: 100,
  dailyRewardPoints: 5,
  maxDailyRewardPoints: 5,
  plan: "free",
  setPoints: (points) => set({ points }),
  setSubscriptionPoints: (subscriptionPoints) => set({ subscriptionPoints }),
  setDailyRewardPoints: (dailyRewardPoints) => set({ dailyRewardPoints }),
  setPlan: (plan) => set({ plan }),
  claimDailyReward: () => set((state) => {
    if (state.dailyRewardPoints < state.maxDailyRewardPoints) {
      return {
        dailyRewardPoints: state.dailyRewardPoints + 1,
        points: state.points + 10,
      };
    }
    return {};
  }),
}));
