import { create } from "zustand";
import { AnimationState } from "../types/character";

interface Position { x: number; y: number; }

const MAX_SEG_LEN = 180;
const TOTAL_LOOPS = 2;

/**
 * Split text into ≤MAX_SEG_LEN segments at sentence boundaries when possible,
 * falling back to hard splits. Length is measured in Unicode code points so
 * emoji surrogate pairs are never bisected. Returns [] for empty/whitespace.
 */
function chunkText(text: string, maxLen = MAX_SEG_LEN): string[] {
  const trimmed = text?.trim();
  if (!trimmed) return [];

  // Codepoint-aware length helper to avoid splitting surrogate pairs.
  const cpLen = (s: string) => Array.from(s).length;

  if (cpLen(trimmed) <= maxLen) return [trimmed];

  const parts = trimmed
    .split(/(?<=[。．.！!？?\n])/g)
    .filter((s) => s.length > 0);
  const out: string[] = [];
  let cur = "";
  const flushHardSplit = () => {
    let chars = Array.from(cur);
    while (chars.length > maxLen) {
      out.push(chars.slice(0, maxLen).join(""));
      chars = chars.slice(maxLen);
    }
    cur = chars.join("");
  };

  for (const s of parts) {
    if (cpLen(cur) + cpLen(s) > maxLen && cur) {
      out.push(cur);
      cur = s;
    } else {
      cur += s;
    }
    flushHardSplit();
  }
  if (cur) out.push(cur);
  return out;
}

interface PetState {
  animState: AnimationState;
  position: Position;
  isDragging: boolean;
  isMoving: boolean;
  /** Segments currently scheduled for playback. */
  bubbleSegments: string[];
  /** Index of segment shown right now within `bubbleSegments`. */
  bubbleSegIndex: number;
  /** Loop counter (0..TOTAL_LOOPS). When it reaches TOTAL_LOOPS, bubble clears. */
  bubbleLoopIndex: number;
  /** Stable token; bumps every time showBubble is called so the SpeechBubble re-mounts. */
  bubbleToken: number;
  /** When true, render the persistent "思考中…" placeholder instead of segments.
   *  InputOverlay flips this on at send and off when the response arrives. */
  loadingBubble: boolean;
  inputVisible: boolean;
  /** Custom drag-positioned coords for InputOverlay. null = use default
   *  bottom-center placement. In-memory only — resets on app restart. */
  inputPosition: { x: number; y: number } | null;
  setInputPosition: (pos: { x: number; y: number }) => void;
  resetInputPosition: () => void;
  setAnimState: (s: AnimationState) => void;
  setPosition: (p: Position | ((prev: Position) => Position)) => void;
  setDragging: (v: boolean) => void;
  setIsMoving: (v: boolean) => void;
  /** Replace the bubble queue with segments derived from `text`.
   *  Empty / whitespace input is silently ignored. */
  showBubble: (text: string) => void;
  /** Move to the next segment / loop, or clear if all loops done. */
  advanceBubble: () => void;
  /** Hide the bubble immediately. */
  clearBubble: () => void;
  setLoadingBubble: (v: boolean) => void;
  setInputVisible: (v: boolean) => void;
}

export const usePetStore = create<PetState>((set) => ({
  animState: "idle",
  position: { x: 100, y: 100 },
  isDragging: false,
  isMoving: false,
  bubbleSegments: [],
  bubbleSegIndex: 0,
  bubbleLoopIndex: 0,
  bubbleToken: 0,
  loadingBubble: false,
  inputVisible: false,
  inputPosition: null,
  setInputPosition: (inputPosition) => set({ inputPosition }),
  resetInputPosition: () => set({ inputPosition: null }),
  setAnimState: (animState) => set({ animState }),
  setPosition: (p) =>
    set((s) => ({ position: typeof p === "function" ? p(s.position) : p })),
  setDragging: (isDragging) => set({ isDragging }),
  setIsMoving: (isMoving) => set({ isMoving }),
  showBubble: (text) =>
    set((s) => {
      const segments = chunkText(text);
      if (!segments.length) return s; // ignore empty / whitespace
      return {
        bubbleSegments: segments,
        bubbleSegIndex: 0,
        bubbleLoopIndex: 0,
        bubbleToken: s.bubbleToken + 1,
        loadingBubble: false, // a real bubble replaces any loading placeholder
      };
    }),
  advanceBubble: () =>
    set((s) => {
      if (!s.bubbleSegments.length) return s;
      const nextSeg = s.bubbleSegIndex + 1;
      if (nextSeg < s.bubbleSegments.length) {
        return { bubbleSegIndex: nextSeg };
      }
      const nextLoop = s.bubbleLoopIndex + 1;
      if (nextLoop < TOTAL_LOOPS) {
        return { bubbleSegIndex: 0, bubbleLoopIndex: nextLoop };
      }
      return {
        bubbleSegments: [],
        bubbleSegIndex: 0,
        bubbleLoopIndex: 0,
      };
    }),
  clearBubble: () =>
    set({ bubbleSegments: [], bubbleSegIndex: 0, bubbleLoopIndex: 0, loadingBubble: false }),
  setLoadingBubble: (loadingBubble) => set({ loadingBubble }),
  setInputVisible: (inputVisible) => set({ inputVisible }),
}));
