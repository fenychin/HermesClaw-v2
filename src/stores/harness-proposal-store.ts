import { create } from "zustand";
import type { HarnessProposal, ProposalStatus } from "@/types";
import { mockProposals } from "@/app/(workspace)/settings/harness/_data/mock-proposals";

interface HarnessProposalState {
  proposals: HarnessProposal[];
  loading: boolean;
  error: string | null;
  fetchProposals: () => Promise<void>;
  approveProposal: (proposalId: string, reviewer: string) => void;
  rejectProposal: (proposalId: string, reviewer: string, reason?: string) => void;
}

export const useHarnessProposalStore = create<HarnessProposalState>((set) => ({
  proposals: mockProposals,
  loading: false,
  error: null,
  fetchProposals: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch("/api/harness/proposals");
      if (!res.ok) throw new Error("获取升级提案列表失败");
      const body = await res.json();
      if (body.success && Array.isArray(body.data)) {
        set({ proposals: body.data, loading: false });
      } else {
        set({ proposals: body.proposals || [], loading: false });
      }
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "未知错误",
        loading: false,
      });
    }
  },
  approveProposal: (proposalId, reviewer) =>
    set((state) => ({
      proposals: state.proposals.map((p) =>
        p.id === proposalId
          ? {
              ...p,
              status: "approved" as ProposalStatus,
              reviewedAt: new Date().toISOString(),
              reviewedBy: reviewer,
            }
          : p
      ),
    })),
  rejectProposal: (proposalId, reviewer) =>
    set((state) => ({
      proposals: state.proposals.map((p) =>
        p.id === proposalId
          ? {
              ...p,
              status: "rejected" as ProposalStatus,
              reviewedAt: new Date().toISOString(),
              reviewedBy: reviewer,
            }
          : p
      ),
    })),
}));
