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
  // After loadAnim plays the dynamic GIF, this timer flips to <anim>_static if
  // such a file exists, so e.g. sit.gif's transition stops looping and the
  // character stays in the seated still frame.
  const staticSwapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Time the dynamic GIF plays before swapping to its _static variant. Roughly
  // matches one cycle of a typical 4-frame, 8-fps sprite.
  const STATIC_SWAP_MS = 1500;
  // True while any non-movement animation is occupying the slot
  const interactionActiveRef = useRef(false);
  // Stable ref so timeout callbacks always call the latest runIdleCycle
  const runIdleCycleRef = useRef<() => void>(() => {});

  const { isMoving } = usePetStore();

  const loadAnim = useCallback(async (state: AnimationState) => {
    setAnimState(state);
    if (staticSwapTimerRef.current) {
      clearTimeout(staticSwapTimerRef.current);
      staticSwapTimerRef.current = null;
    }
    try {
      // walk / run can use directional sprites if the character ships them
      // (e.g. walk_left.gif). Other states ignore direction and use the
      // standard lookup.
      const direction =
        state === "walk" || state === "run"
          ? usePetStore.getState().movementDirection
          : null;
      const path = await invoke<string>("get_animation_path", {
        animName: state,
        direction,
      });
      setAnimPath(path);
    } catch {}
    // After the GIF has had a chance to play one cycle, check whether the
    // character ships a `<state>_static.<ext>` and swap to it. No-op if the
    // file doesn't exist (Rust returns "").
    staticSwapTimerRef.current = setTimeout(async () => {
      try {
        const staticPath = await invoke<string>("get_animation_static_path", { animName: state });
        if (staticPath) setAnimPath(staticPath);
      } catch {}
    }, STATIC_SWAP_MS);
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
      // Movement starts → preempt any in-flight variety animation (sit/dance/
      // happy/think) and switch to walk immediately. Without this the user
      // sees the character gliding around still showing the sit-down GIF until
      // its 2–5 s timer expires, which looks broken.
      if (varietyTimerRef.current) {
        clearTimeout(varietyTimerRef.current);
        varietyTimerRef.current = null;
      }
      if (interactionTimerRef.current) {
        clearTimeout(interactionTimerRef.current);
        interactionTimerRef.current = null;
      }
      interactionActiveRef.current = false;
      loadAnim("walk");
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
    if (staticSwapTimerRef.current) clearTimeout(staticSwapTimerRef.current);
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
