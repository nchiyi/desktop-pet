import { useState, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AnimationState } from "../types/character";

const HAPPY_DURATION_MS = 3000;
const IDLE_AFTER_DRAG_MS = 500;

export function usePetAnimation() {
  const [animState, setAnimState] = useState<AnimationState>("idle");
  const [animPath, setAnimPath] = useState<string>("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const transitionTo = useCallback(
    async (state: AnimationState, durationMs?: number) => {
      clearTimer();
      setAnimState(state);
      try {
        const path = await invoke<string>("get_animation_path", { animName: state });
        setAnimPath(path);
      } catch {
        // fallback handled by Rust
      }
      if (durationMs) {
        timerRef.current = setTimeout(() => transitionTo("idle"), durationMs);
      }
    },
    []
  );

  const onPromptSent = useCallback(() => transitionTo("think"), [transitionTo]);
  const onReplyReceived = useCallback(
    () => transitionTo("happy", HAPPY_DURATION_MS),
    [transitionTo]
  );
  const onDragStart = useCallback(() => transitionTo("drag"), [transitionTo]);
  const onDragEnd = useCallback(
    () => transitionTo("surprised", IDLE_AFTER_DRAG_MS),
    [transitionTo]
  );
  const onWaitTimeout = useCallback(() => transitionTo("sad"), [transitionTo]);

  useEffect(() => {
    transitionTo("idle");
  }, []);

  useEffect(() => () => clearTimer(), []);

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
