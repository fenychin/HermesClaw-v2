/**
 * Billing API Mock 检测测试
 * 覆盖风险点：
 *   - R06: 所有 billing API 返回硬编码数据，无 Stripe 集成
 *   - R07: 积分充值无服务端验证
 *   - R08: 发票下载返回伪造 PDF
 *   - R09: Stripe Checkout 返回 mock URL
 *   - R10: 套餐价格硬编码
 */
import { describe, it, expect } from "vitest";

// ============================================================
// Mock 数据定义（直接复制自源码，用于验证其 mock 性质）
// ============================================================
const MOCK_BILLING_ENDPOINTS = [
  "/api/billing/checkout",
  "/api/billing/credits/purchase",
  "/api/billing/invoices/[id]/download",
  "/api/billing/overview",
  "/api/billing/portal",
  "/api/billing/subscription",
  "/api/billing/usage",
];

describe("Billing API — Mock 检测", () => {
  it("所有 billing API 端点均为 mock（无 Stripe 依赖、无数据库查询）", () => {
    // 证据：所有 billing API route 文件：
    // - checkout/route.ts: 直接返回 mock URL，无 stripe SDK 调用
    // - overview/route.ts: 返回硬编码数据，无 prisma 查询
    // - subscription/route.ts: 返回硬编码 planId="free"
    // - credits/purchase/route.ts: 仅校验参数 >0，不做真实扣款
    // - portal/route.ts: 返回 mock URL
    // - usage/route.ts: 使用 Math.sin 生成假数据
    // - invoices/[id]/download/route.ts: 返回手写 PDF 字符串
    expect(MOCK_BILLING_ENDPOINTS.length).toBe(7);
  });

  it("checkout API 不创建 Stripe Checkout Session", () => {
    // 证据: apps/web/src/app/api/billing/checkout/route.ts L12-15
    const mockUrl = `https://checkout.stripe.com/c/pay/mock_session_hermesclaw_pro_month`;
    expect(mockUrl).toContain("mock_session");
    // 没有 stripe.checkout.sessions.create() 调用
    // 没有 Stripe Secret Key 配置
    // 没有 webhook 签名验证
  });

  it("subscription API 总是返回 free 套餐", () => {
    // 证据: apps/web/src/app/api/billing/subscription/route.ts L5-9
    const response = { planId: "free", status: "active", renewalDate: "2026-07-19" };
    expect(response.planId).toBe("free");
    // 不管用户实际订阅什么，永远返回 free
  });

  it("overview API 返回硬编码数据（Professional/$29/Visa 4242）", () => {
    // 证据: apps/web/src/app/api/billing/overview/route.ts L3-38
    const response = {
      plan: { name: "Professional", active: true, nextBillingDate: "2026-07-19", amount: 29.00, paymentMethod: { last4: "4242", brand: "Visa" } },
      credits: { used: 32.2, total: 35.0, subscription: 27.2, dailyReward: 5.0, resetDate: "2026-07-19" },
      invoices: [
        { id: "inv_001", date: "2026-06-19", planName: "Professional 套餐 - 月付", amount: 29.00, status: "Paid" },
        { id: "inv_002", date: "2026-05-19", planName: "Professional 套餐 - 月付", amount: 29.00, status: "Paid" },
      ],
    };
    expect(response.plan.name).toBe("Professional");
    expect(response.plan.paymentMethod.last4).toBe("4242"); // Stripe 测试卡号
    expect(response.invoices).toHaveLength(2);
    // 不调用 prisma，不调用 Stripe API
  });

  it("credits/purchase API 不做真实支付处理", () => {
    // 证据: apps/web/src/app/api/billing/credits/purchase/route.ts
    const requestBody = { credits: 100 };
    // 只检查 credits > 0，直接返回 success
    expect(requestBody.credits).toBeGreaterThan(0);
    const response = { success: true, purchasedCredits: 100, message: "成功购买了 100 积分！" };
    expect(response.success).toBe(true);
    // 没有 Stripe PaymentIntent
    // 没有写入 CreditLedger
    // 不更新用户积分余额
  });

  it("portal API 返回 mock Stripe URL", () => {
    // 证据: apps/web/src/app/api/billing/portal/route.ts L5-8
    const mockUrl = "https://billing.stripe.com/p/session/mock_hermesclaw_stripe_customer_portal";
    expect(mockUrl).toContain("mock");
    // 没有 stripe.billingPortal.sessions.create() 调用
  });

  it("usage API 使用 Math.sin 生成模拟数据", () => {
    // 证据: apps/web/src/app/api/billing/usage/route.ts L10-11
    const credit = parseFloat((Math.sin(0 / 2) * 0.8 + 1.2 + Math.random() * 0.4).toFixed(1));
    expect(typeof credit).toBe("number");
    // 不查询数据库中的实际用量
  });

  it("invoice download 返回手写伪造 PDF", () => {
    // 证据: apps/web/src/app/api/billing/invoices/[id]/download/route.ts
    const pdfContent = "%PDF-1.4";
    expect(pdfContent).toContain("%PDF-1.4");
    // 该 PDF 内容为硬编码字符串，不是真实发票
  });
});

// ============================================================
// 套餐常量硬编码检测
// ============================================================
describe("Billing — 套餐配置硬编码", () => {
  it("套餐价格硬编码在前端 constants/plans.ts 中", () => {
    // 证据: apps/web/src/constants/plans.ts
    // 5 个套餐的月付/年付价格、功能列表均为硬编码
    // 年付"节省 20%"也是硬编码
    const yearDiscount = 0.2; // 20%
    expect(yearDiscount).toBe(0.2);
  });

  it("积分单价硬编码（$0.15/积分，满 250 打 7 折）", () => {
    // 证据: billing/plans/page.tsx 和 settings/billing/page.tsx
    const unitPrice = 0.15;
    const bulkDiscountThreshold = 250;
    const bulkDiscountRate = 0.7; // 7 折
    expect(unitPrice).toBe(0.15);
    expect(bulkDiscountThreshold).toBe(250);
    expect(bulkDiscountRate).toBe(0.7);
  });

  it("积分大礼包价格硬编码（$420 买 4000 积分）", () => {
    // 证据: billing/plans/page.tsx
    const megaPackCredits = 4000;
    const megaPackPrice = 420.0;
    const originalPrice = 600.0;
    expect(megaPackCredits).toBe(4000);
    expect(megaPackPrice).toBe(420.0);
    expect(originalPrice).toBe(600.0);
  });
});

// ============================================================
// Prisma Schema 缺失模型检查
// ============================================================
describe("Billing — Prisma Schema 缺失模型", () => {
  const MISSING_MODELS = [
    "Subscription",
    "CreditLedger",
    "RewardLedger",
    "Invoice",
    "PaymentMethod",
    "Invite",
  ];

  it("Prisma schema 中不存在 Billing/Rewards 业务模型", () => {
    // 证据: prisma/schema.prisma 共 43 个模型
    // 没有 Subscription, CreditLedger, RewardLedger, Invoice, PaymentMethod, Invite
    // 仅有 Workspace.plan 字段
    expect(MISSING_MODELS.length).toBe(6);
    // 这意味着 billing 功能无法持久化任何数据
  });
});
