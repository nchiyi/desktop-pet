import { create } from "zustand";
import { Message } from "../types/session";

const TURN_LIMIT = 30;

interface SessionState {
  messages: Message[];
  addExchange: (userMsg: string, assistantMsg: string) => void;
  setMessages: (messages: Message[]) => void;
  turnCount: () => number;
  atTurnLimit: () => boolean;
  reset: () => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  messages: [],
  addExchange: (userMsg, assistantMsg) =>
    set((s) => ({
      messages: [
        ...s.messages,
        { role: "user", content: userMsg },
        { role: "assistant", content: assistantMsg },
      ],
    })),
  setMessages: (messages) => set({ messages }),
  turnCount: () => Math.floor(get().messages.length / 2),
  atTurnLimit: () => Math.floor(get().messages.length / 2) >= TURN_LIMIT,
  reset: () => set({ messages: [] }),
}));
