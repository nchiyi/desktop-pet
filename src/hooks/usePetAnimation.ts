import { useState, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AnimationState } from "../types/character";
import { usePetStore } from "../stores/petStore";

const IDLE_VARIETY: AnimationState[] = ["sit", "dance", "happy", "think"];

export function usePetAnimation() {
  const [animState, setAnimState] = useState<AnimationState>("idle");
  const [animPath, setAnimPath] = useState<string>("");

  const interactionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const varietyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True while any non-movement animation is occupying the slot
  const interactionActiveRef = useRef(false);
  // Stable ref so timeout callbacks always call the latest runIdleCycle
  const runIdleCycleRef = useRef<() => void>(() => {});

  const { isMoving } = usePetStore();

  const loadAnim = useCallback(async (state: AnimationState) => {
    setAnimState(state);
    try {
      const path = await invoke<string>("get_animation_path", { animName: state });
      setAnimPath(path);
    } catch {}
  }, []);

  /**
   * Play an animation.
   * If durationMs given: return to walk/idle after that time, unlock, and restart
   * idle cycle if the pet is still standing.
   */
  const transitionTo = useCallback(
    (state: AnimationState, durationMs?: number) => {
      if (interactionTimerRef.current) {
        clearTimeout(interactionTimerRef.current);
        interactionTimerRef.current = null;
      }
      loadAnim(state);
      if (durationMs) {
        interactionTimerRef.current = setTimeout(() => {
          interactionTimerRef.current = null;
          interactionActiveRef.current = false;
          const { isMoving: moving } = usePetStore.getState();
          loadAnim(moving ? "walk" : "idle");
          if (!moving) runIdleCycleRef.current();
        }, durationMs);
      }
    },
    [loadAnim]
  );

  /**
   * Idle cycle: wait 1–3 s showing idle, then play a random variety animation
   * for 2–5 s, then repeat. Runs whenever the pet is standing still and no
   * interaction is active.
   */
  const runIdleCycle = useCallback(() => {
    if (varietyTimerRef.current) {
      clearTimeout(varietyTimerRef.current);
      varietyTimerRef.current = null;
    }
    if (usePetStore.getState().isMoving || interactionActiveRef.current) return;

    // Brief idle before the next activity
    const idleDelay = 1000 + Math.random() * 2000;
    varietyTimerRef.current = setTimeout(() => {
      varietyTimerRef.current = null;
      const { isMoving: moving } = usePetStore.getState();
      if (moving || interactionActiveRef.current) {
        if (!moving) runIdleCycleRef.current(); // still idle — retry
        return;
      }
      const pick = IDLE_VARIETY[Math.floor(Math.random() * IDLE_VARIETY.length)];
      const duration = 2000 + Math.random() * 3000; // 2–5 s
      interactionActiveRef.current = true;
      transitionTo(pick, duration); // when done, transitionTo restarts the cycle
    }, idleDelay);
  }, [transitionTo]);

  // Keep the ref pointing at the latest closure
  useEffect(() => { runIdleCycleRef.current = runIdleCycle; }, [runIdleCycle]);

  // React to movement changes: switch walk/idle and start/stop the idle cycle
  useEffect(() => {
    if (isMoving) {
      // Cancel any pending variety timer; let a running animation finish on its own
      if (varietyTimerRef.current) {
        clearTimeout(varietyTimerRef.current);
        varietyTimerRef.current = null;
      }
      if (!interactionActiveRef.current) loadAnim("walk");
    } else {
      // Arrived at destination (or app start / Fixed mode)
      if (!interactionActiveRef.current) {
        loadAnim("idle");
        runIdleCycle();
      }
    }
  }, [isMoving, loadAnim, runIdleCycle]);

  // --- Interaction callbacks ---

  const onDragStart = useCallback(() => {
    interactionActiveRef.current = true;
    if (varietyTimerRef.current) { clearTimeout(varietyTimerRef.current); varietyTimerRef.current = null; }
    transitionTo("drag");
  }, [transitionTo]);

  const onDragEnd = useCallback(() => {
    interactionActiveRef.current = true;
    transitionTo("surprised", 500);
  }, [transitionTo]);

  const onPromptSent = useCallback(() => {
    interactionActiveRef.current = true;
    if (varietyTimerRef.current) { clearTimeout(varietyTimerRef.current); varietyTimerRef.current = null; }
    transitionTo("think");
  }, [transitionTo]);

  const onReplyReceived = useCallback(() => {
    interactionActiveRef.current = true;
    transitionTo("happy", 3000);
  }, [transitionTo]);

  const onWaitTimeout = useCallback(() => {
    interactionActiveRef.current = true;
    transitionTo("sad", 3000);
  }, [transitionTo]);

  // Cleanup on unmount
  useEffect(() => () => {
    if (interactionTimerRef.current) clearTimeout(interactionTimerRef.current);
    if (varietyTimerRef.current) clearTimeout(varietyTimerRef.current);
  }, []);

  return {
    animState,
    animPath,
    transitionTo,
    onPromptSent,
    onReplyReceived,
    onDragStart,
    onDragEnd,
    onWaitTimeout,
  };
}
