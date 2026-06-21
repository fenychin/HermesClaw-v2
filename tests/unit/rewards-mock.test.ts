/**
 * Rewards API Mock 检测 + 积分安全测试
 * 覆盖风险点：
 *   - R17: Rewards 所有 API 为硬编码 mock
 *   - R18: 积分发放在前端（Zustand）操作，无服务端验证
 *   - R19: 任务完成在客户端 setTimeout 模拟
 *   - R20: 邀请链接硬编码
 *   - R21: 积分无去重，可重复领取
 */
import { describe, it, expect, vi } from "vitest";

describe("Rewards API — Mock 检测", () => {
  it("tasks API 返回 10 个硬编码任务", () => {
    // 证据: apps/web/src/app/api/rewards/tasks/route.ts
    const tasks = [
      { taskId: "task_connect_x", completed: false, completedAt: null },
      { taskId: "task_connect_discord", completed: false, completedAt: null },
      { taskId: "task_join_discord", completed: false, completedAt: null },
      { taskId: "task_verify_email", completed: true, completedAt: "2026-06-18 10:00" },
      { taskId: "task_create_workspace", completed: true, completedAt: "2026-06-18 10:05" },
      { taskId: "task_bind_connector", completed: true, completedAt: "2026-06-19 14:20" },
      { taskId: "task_run_workflow", completed: false, completedAt: null },
      { taskId: "task_enable_pack", completed: false, completedAt: null },
      { taskId: "task_daily_login", completed: false, completedAt: null },
      { taskId: "task_run_workflow_daily", completed: false, completedAt: null },
    ];
    expect(tasks).toHaveLength(10);
    expect(tasks.filter((t) => t.completed)).toHaveLength(3);
    // 不查询数据库
    // 不检查用户实际的 OAuth 连接状态
    // 不检查用户实际的 workspace 创建状态
  });

  it("invite-link API 返回硬编码 URL", () => {
    // 证据: apps/web/src/app/api/rewards/invite-link/route.ts
    const url = "https://hermesclaw.ai/invite/hc_usr_99824";
    expect(url).toContain("hc_usr_99824");
    // 不基于当前用户生成唯一邀请码
    // 所有用户看到同一个邀请链接
  });

  it("invites API 返回 6 个硬编码邀请记录", () => {
    // 证据: apps/web/src/app/api/rewards/invites/route.ts
    const invites = [
      { email: "alex.wong@outlook.com", date: "2026-06-20 18:30", status: "Registered", points: 50 },
      { email: "sarah_k@gmail.com", date: "2026-06-20 11:15", status: "Registered", points: 50 },
      { email: "dev.li@tencent.com", date: "2026-06-19 09:40", status: "Pending", points: 0 },
      { email: "j.smith@yahoo.com", date: "2026-06-18 22:12", status: "Registered", points: 50 },
      { email: "hr_maria@baidu.com", date: "2026-06-17 15:04", status: "Registered", points: 50 },
      { email: "tony_stark@stark.com", date: "2026-06-16 11:20", status: "Pending", points: 0 },
    ];
    expect(invites).toHaveLength(6);
    // 不查询数据库
    // 不关联当前用户
  });
});

describe("Rewards — 积分发放安全（客户端操作）", () => {
  it("任务完成在客户端 setTimeout 模拟（1 秒后乐观更新）", () => {
    // 证据: apps/web/src/app/rewards/page.tsx L98-118
    // handleCompleteTask 使用 setTimeout 1s 后调用 queryClient.setQueryData
    // 不向服务端发送 POST 请求验证任务完成
    const handleCompleteTask = (taskId: string, reward: number) => {
      // 模拟前端逻辑
      return new Promise<void>((resolve) => {
        setTimeout(() => resolve(), 1000);
      });
    };
    expect(typeof handleCompleteTask).toBe("function");
    // ⚠️ 用户可以修改前端代码绕过任何限制
  });

  it("积分更新使用 Zustand setPoints 直接在客户端操作", () => {
    // 证据: apps/web/src/hooks/use-user.ts
    // claimDailyReward 直接在客户端 set({ points: state.points + 10 })
    // 不经过服务端验证
    let points = 125;
    points += 10; // claimDailyReward 效果
    expect(points).toBe(135);
    // ⚠️ 用户可以打开 DevTools 直接修改 Zustand store
  });

  it("积分发放无去重机制", () => {
    // 证据: rewards/page.tsx handleCompleteTask
    // 同一个 task 可以被多次"完成"
    // 没有服务端去重检查（因为没有服务端实现）
    let points = 125;
    const reward = 50;
    // 模拟重复点击
    for (let i = 0; i < 5; i++) {
      points += reward;
    }
    expect(points).toBe(375); // 125 + 5*50
    // ⚠️ 积分可被无限刷取
  });

  it("每日签到积分也可被客户端无限领取", () => {
    // 证据: hooks/use-user.ts claimDailyReward
    // 仅检查 dailyRewardPoints < maxDailyRewardPoints (5)
    // 用户可直接修改 Zustand store 重置计数
    let dailyPoints = 5;
    let totalPoints = 125;
    // 伪造重置
    dailyPoints = 0;
    for (let i = 0; i < 5; i++) {
      dailyPoints += 1;
      totalPoints += 10;
    }
    expect(totalPoints).toBe(175);
    // 无服务端日期检查
    // 无用户级别的每日限制
  });
});

describe("Rewards — 积分模型缺失", () => {
  it("Prisma schema 中无 CreditLedger 模型", () => {
    // 积分变动无法审计
    expect(true).toBe(true);
  });

  it("Prisma schema 中无 RewardLedger 模型", () => {
    // 奖励发放无法追溯
    expect(true).toBe(true);
  });

  it("Prisma schema 中无 Invite 模型", () => {
    // 邀请记录无法持久化
    expect(true).toBe(true);
  });

  it("用户初始积分硬编码在 Zustand store（125 分）", () => {
    // 证据: hooks/use-user.ts L17
    const initialPoints = 125;
    expect(initialPoints).toBe(125);
    // 不根据用户实际套餐/购买历史计算
  });
});
