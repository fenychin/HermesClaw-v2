"use client";

import { create } from "zustand";
import type {
  Inquiry,
  MarketIntelligence,
  Quotation,
  HarnessProposal,
} from "@/types";
import { apiClient } from "@/lib/api-client";

/** 外贸模块筛选条件 */
interface TradeFilter {
  country: string;
  priority: string;
  type: string;
}

/**
 * 外贸模块状态管理
 * —— 管理询盘、市场情报、报价、Harness 提案及其审批操作
 *    询盘 / 情报 / 报价 / 提案均从真实 API 加载（已清除 mock）
 */
interface TradeState {
  /** 询盘列表（从 API 加载） */
  inquiries: Inquiry[];
  /** 市场情报列表（从 API 加载） */
  intelligence: MarketIntelligence[];
  /** 报价列表（从 API 加载） */
  quotations: Quotation[];
  /** Harness 进化提案列表（从 API 加载） */
  harnessProposals: HarnessProposal[];
  /** 加载中 */
  loading: boolean;
  /** 错误信息 */
  error: string | null;
  /** 筛选条件 */
  filter: TradeFilter;
  /** 筛选后的询盘列表 */
  getFilteredInquiries: () => Inquiry[];
  /** 筛选后的情报列表 */
  getFilteredIntelligence: () => MarketIntelligence[];

  // ---- 操作方法 ----
  /** 从 API 加载询盘 */
  loadInquiries: () => Promise<void>;
  /** 从 API 加载市场情报 */
  loadIntelligence: () => Promise<void>;
  /** 从 API 加载报价 */
  loadQuotations: () => Promise<void>;
  /** 从 API 加载 Harness 提案 */
  loadProposals: () => Promise<void>;
  /** 设置筛选条件（支持部分更新） */
  setFilter: (filter: Partial<TradeFilter>) => void;
  /**
   * 审批通过提案（调 API）。
   * @param confirm L3 二次确认标记；L4 后端硬拒绝，错误会上抛供 UI 处理
   * @throws ConfirmationRequiredError L3 缺确认（409）；Error L4 禁止（403）
   */
  approveProposal: (id: string, reviewedBy: string, confirm?: boolean) => Promise<void>;
  /** 驳回提案（调 API） */
  rejectProposal: (id: string, reviewedBy: string) => Promise<void>;
}

export const useTradeStore = create<TradeState>((set, get) => ({
  inquiries: [],
  intelligence: [],
  quotations: [],
  harnessProposals: [],
  loading: false,
  error: null,
  filter: {
    country: "",
    priority: "",
    type: "",
  },

  getFilteredInquiries: () => {
    const { inquiries, filter } = get();
    return inquiries.filter((inquiry) => {
      if (filter.country && inquiry.fromCountry !== filter.country) return false;
      if (filter.priority && inquiry.priority !== filter.priority) return false;
      return true;
    });
  },

  getFilteredIntelligence: () => {
    const { intelligence, filter } = get();
    return intelligence.filter((intel) => {
      if (filter.type && intel.type !== filter.type) return false;
      return true;
    });
  },

  loadInquiries: async () => {
    try {
      const data = await apiClient.getInquiries();
      set({ inquiries: data.inquiries as Inquiry[] });
    } catch (err) {
      const message = err instanceof Error ? err.message : "加载询盘失败";
      set({ error: message });
    }
  },

  loadIntelligence: async () => {
    try {
      const data = await apiClient.getIntelligence();
      set({ intelligence: data.intelligence as MarketIntelligence[] });
    } catch (err) {
      const message = err instanceof Error ? err.message : "加载市场情报失败";
      set({ error: message });
    }
  },

  loadQuotations: async () => {
    try {
      const data = await apiClient.getQuotations();
      set({ quotations: data.quotations as Quotation[] });
    } catch (err) {
      const message = err instanceof Error ? err.message : "加载报价失败";
      set({ error: message });
    }
  },

  loadProposals: async () => {
    set({ loading: true, error: null });
    try {
      const data = await apiClient.getProposals();
      set({
        harnessProposals: data.proposals as HarnessProposal[],
        loading: false,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "加载提案列表失败";
      set({ error: message, loading: false });
    }
  },

  setFilter: (partial) =>
    set((state) => ({
      filter: { ...state.filter, ...partial },
    })),

  approveProposal: async (id, reviewedBy, confirm = false) => {
    // 不做乐观更新：L3 缺确认会 409、L4 会 403，须等后端放行后再落地状态，
    // 否则会先误显示「已批准」。失败上抛供 UI 弹确认 / 提示。
    await apiClient.reviewProposal(id, "approve", reviewedBy, confirm);
    set((state) => ({
      harnessProposals: state.harnessProposals.map((p) =>
        p.id === id
          ? {
              ...p,
              status: "approved" as const,
              reviewedBy,
              reviewedAt: new Date().toISOString(),
            }
          : p,
      ),
    }));
  },

  rejectProposal: async (id, reviewedBy) => {
    // 乐观更新
    set((state) => ({
      harnessProposals: state.harnessProposals.map((p) =>
        p.id === id
          ? {
              ...p,
              status: "rejected" as const,
              reviewedBy,
              reviewedAt: new Date().toISOString(),
            }
          : p,
      ),
    }));
    try {
      await apiClient.reviewProposal(id, "reject", reviewedBy);
    } catch {
      get().loadProposals();
    }
  },
}));
