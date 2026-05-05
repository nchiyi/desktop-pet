import { create } from "zustand";
import { AnimationState } from "../types/character";

interface Position { x: number; y: number; }

interface PetState {
  animState: AnimationState;
  position: Position;
  isDragging: boolean;
  bubbleText: string | null;
  inputVisible: boolean;
  setAnimState: (s: AnimationState) => void;
  setPosition: (p: Position | ((prev: Position) => Position)) => void;
  setDragging: (v: boolean) => void;
  showBubble: (text: string) => void;
  clearBubble: () => void;
  setInputVisible: (v: boolean) => void;
}

export const usePetStore = create<PetState>((set) => ({
  animState: "idle",
  position: { x: 100, y: 100 },
  isDragging: false,
  bubbleText: null,
  inputVisible: false,
  setAnimState: (animState) => set({ animState }),
  setPosition: (p) =>
    set((s) => ({ position: typeof p === "function" ? p(s.position) : p })),
  setDragging: (isDragging) => set({ isDragging }),
  showBubble: (text) => set({ bubbleText: text }),
  clearBubble: () => set({ bubbleText: null }),
  setInputVisible: (inputVisible) => set({ inputVisible }),
}));
