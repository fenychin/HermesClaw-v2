import { create } from "zustand";
import type { HarnessProposal, ProposalStatus } from "@/types";
import { mockProposals } from "@/app/(workspace)/settings/harness/_data/mock-proposals";

interface HarnessProposalState {
  proposals: HarnessProposal[];
  approveProposal: (proposalId: string, reviewer: string) => void;
  rejectProposal: (proposalId: string, reviewer: string, reason?: string) => void;
}

export const useHarnessProposalStore = create<HarnessProposalState>((set) => ({
  proposals: mockProposals,
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
