import { useState, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AnimationState } from "../types/character";
import { usePetStore } from "../stores/petStore";
import { useSettingsStore } from "../stores/settingsStore";

const IDLE_VARIETY: AnimationState[] = [
  "sit", "dance", "happy", "think", "sway", "stretch", "sleep",
];
// movement_speed at or above this swaps the walk sprite for run.
const RUN_SPEED_THRESHOLD = 1.5;

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
  const movementSpeed = useSettingsStore((s) => s.config.movement_speed);
  const bubbleSegments = usePetStore((s) => s.bubbleSegments);
  const loadingBubble = usePetStore((s) => s.loadingBubble);
  // True when a real reply bubble (not the "思考中…" placeholder) is on screen.
  const bubbleActive = bubbleSegments.length > 0 && !loadingBubble;

  // Walk vs run is purely a function of configured speed. Re-runs when the
  // user changes the slider so the sprite swaps live.
  const moveState = useCallback(
    (): AnimationState => (movementSpeed >= RUN_SPEED_THRESHOLD ? "run" : "walk"),
    [movementSpeed]
  );

  // The "ambient" state to drop into whenever no interaction lock is held:
  // walk/run > talk (bubble visible) > idle.
  const ambientState = useCallback((): AnimationState => {
    const ps = usePetStore.getState();
    if (ps.isMoving) return moveState();
    if (ps.bubbleSegments.length > 0 && !ps.loadingBubble) return "talk";
    return "idle";
  }, [moveState]);

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
          const next = ambientState();
          loadAnim(next);
          // Variety only spins while truly idle, not while talking or moving.
          if (next === "idle") runIdleCycleRef.current();
        }, durationMs);
      }
    },
    [loadAnim, ambientState]
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
    const ps = usePetStore.getState();
    if (ps.isMoving || interactionActiveRef.current) return;
    // Don't interrupt the talk animation with variety frames.
    if (ps.bubbleSegments.length > 0 && !ps.loadingBubble) return;

    // Brief idle before the next activity
    const idleDelay = 1000 + Math.random() * 2000;
    varietyTimerRef.current = setTimeout(() => {
      varietyTimerRef.current = null;
      const s = usePetStore.getState();
      const talking = s.bubbleSegments.length > 0 && !s.loadingBubble;
      if (s.isMoving || interactionActiveRef.current || talking) {
        // Stay idle and re-arm only when the reason was "still idle waiting"
        if (!s.isMoving && !interactionActiveRef.current && !talking) {
          runIdleCycleRef.current();
        }
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

  // React to movement changes: switch walk/run/idle/talk and start/stop the idle cycle
  useEffect(() => {
    if (isMoving) {
      // Movement starts → preempt any in-flight variety animation (sit/dance/
      // happy/think) and switch to walk/run immediately. Without this the user
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
      loadAnim(moveState());
    } else {
      // Arrived at destination (or app start / Fixed mode)
      if (!interactionActiveRef.current) {
        const next = ambientState();
        loadAnim(next);
        if (next === "idle") runIdleCycle();
      }
    }
  }, [isMoving, loadAnim, runIdleCycle, moveState, ambientState]);

  // React to bubble visibility: swap to talk while a real reply is on screen,
  // and resume idle (with variety) once it clears. Skipped while another
  // interaction (drag / happy / think / impatient / sad) is locked or while
  // the character is moving — those have priority.
  useEffect(() => {
    if (interactionActiveRef.current) return;
    if (usePetStore.getState().isMoving) return;
    if (bubbleActive) {
      if (varietyTimerRef.current) {
        clearTimeout(varietyTimerRef.current);
        varietyTimerRef.current = null;
      }
      loadAnim("talk");
    } else {
      loadAnim("idle");
      runIdleCycle();
    }
  }, [bubbleActive, loadAnim, runIdleCycle]);

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

  // Persistent (no auto-return): stays until reply / next prompt / new
  // interaction replaces it. Reply path (onReplyReceived) overwrites with
  // happy; a fresh prompt (onPromptSent) overwrites with think.
  const onImpatient = useCallback(() => {
    interactionActiveRef.current = true;
    if (varietyTimerRef.current) { clearTimeout(varietyTimerRef.current); varietyTimerRef.current = null; }
    transitionTo("impatient");
  }, [transitionTo]);

  const onWaitTimeout = useCallback(() => {
    interactionActiveRef.current = true;
    if (varietyTimerRef.current) { clearTimeout(varietyTimerRef.current); varietyTimerRef.current = null; }
    transitionTo("sad");
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
    onImpatient,
    onWaitTimeout,
  };
}
