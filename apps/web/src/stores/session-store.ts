"use client";

import { create } from "zustand";
import type { ChatMessage } from "@/types/chat";
import type { ExecutionEvent } from "@hermesclaw/event-contracts";

interface SessionState {
  sessionId: string | null;
  messages: ChatMessage[];
  executionEvents: ExecutionEvent[];
  isStreaming: boolean;
  actions: {
    setSession: (sessionId: string) => void;
    appendEvent: (event: ExecutionEvent) => void;
    reset: () => void;
  };
}

export const useSessionStore = create<SessionState>((set) => ({
  sessionId: null,
  messages: [],
  executionEvents: [],
  isStreaming: false,
  actions: {
    setSession: (sessionId) => set({ sessionId }),
    appendEvent: (event) =>
      set((state) => ({
        executionEvents: [...state.executionEvents, event],
      })),
    reset: () =>
      set({
        sessionId: null,
        messages: [],
        executionEvents: [],
        isStreaming: false,
      }),
  },
}));
