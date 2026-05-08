import React, { useEffect, useRef, useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { MovementMode } from "../types/settings";
import { usePetStore } from "../stores/petStore";

export interface ScreenBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AreaBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export function clampToScreen(
  pos: { x: number; y: number },
  size: number,
  screen: ScreenBounds
): { x: number; y: number } {
  return {
    x: Math.max(screen.x, Math.min(pos.x, screen.x + screen.width - size)),
    y: Math.max(screen.y, Math.min(pos.y, screen.y + screen.height - size)),
  };
}

export function getFixedAreaBounds(
  mode: MovementMode,
  screen: ScreenBounds
): AreaBounds {
  const bw = screen.width * 0.1;
  const bh = screen.height * 0.1;
  switch (mode) {
    case "FixedTop":
      return { minX: screen.x, maxX: screen.x + screen.width, minY: screen.y, maxY: screen.y + bh };
    case "FixedBottom":
      return { minX: screen.x, maxX: screen.x + screen.width, minY: screen.y + screen.height - bh, maxY: screen.y + screen.height };
    case "FixedLeft":
      return { minX: screen.x, maxX: screen.x + bw, minY: screen.y, maxY: screen.y + screen.height };
    case "FixedRight":
      return { minX: screen.x + screen.width - bw, maxX: screen.x + screen.width, minY: screen.y, maxY: screen.y + screen.height };
    default:
      return { minX: screen.x, maxX: screen.x + screen.width, minY: screen.y, maxY: screen.y + screen.height };
  }
}

export function usePetMovement(
  mode: MovementMode,
  speed: number,
  characterSize: number
) {
  const { position, setPosition, isDragging, setDragging, setIsMoving } = usePetStore();
  const targetRef = useRef<{ x: number; y: number }>(position);
  const rafRef = useRef<number>(0);
  const isDraggingRef = useRef(isDragging);
  const isMovingRef = useRef(false);
  const pauseUntilRef = useRef<number>(0);

  // Work-area from Rust. Updated on mount and whenever Rust emits
  // `screen-info-updated` (display added/removed at runtime — e.g., user
  // undocked an external monitor while the screen was locked).
  const [workArea, setWorkArea] = useState<ScreenBounds>({
    x: 0, y: 0,
    width: window.screen.width,
    height: window.screen.height,
  });
  useEffect(() => {
    let cancelled = false;
    const fetchInfo = () => {
      invoke<{ work_x: number; work_y: number; work_w: number; work_h: number }>(
        "get_screen_info"
      ).then((info) => {
        if (!cancelled && info.work_w > 0 && info.work_h > 0) {
          setWorkArea({ x: info.work_x, y: info.work_y, width: info.work_w, height: info.work_h });
        }
      }).catch(() => {});
    };
    fetchInfo();
    let unlisten: (() => void) | undefined;
    listen("screen-info-updated", fetchInfo).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => { cancelled = true; unlisten?.(); };
  }, []);

  // When the visible area shrinks (e.g., second monitor unplugged), the
  // character may end up outside the new bounds. Clamp it back into view.
  // Note: we deliberately do NOT touch `targetRef.current` here — the
  // animation effect's `getScreenBounds` dependency forces a restart whenever
  // workArea changes, and that restart calls `pickNewTarget()` which assigns
  // targetRef itself. Writing to it here would just be overwritten.
  useEffect(() => {
    setPosition((prev) => clampToScreen(prev, characterSize, workArea));
  }, [workArea, characterSize, setPosition]);

  // Keep isDraggingRef current without triggering the animation effect
  useEffect(() => { isDraggingRef.current = isDragging; }, [isDragging]);

  const getScreenBounds = useCallback((): ScreenBounds => workArea, [workArea]);

  const pickNewTarget = useCallback(() => {
    const screen = getScreenBounds();
    const bounds =
      mode === "FullScreen"
        ? { minX: 0, maxX: screen.width, minY: 0, maxY: screen.height }
        : getFixedAreaBounds(mode, screen);
    targetRef.current = {
      x: bounds.minX + Math.random() * (bounds.maxX - bounds.minX - characterSize),
      y: bounds.minY + Math.random() * (bounds.maxY - bounds.minY - characterSize),
    };
    // Stay at destination 15–35 seconds (doing idle variety animations)
    pauseUntilRef.current = performance.now() + 15000 + Math.random() * 20000;
  }, [mode, characterSize, getScreenBounds]);

  useEffect(() => {
    if (mode === "Fixed") {
      if (isMovingRef.current) { isMovingRef.current = false; setIsMoving(false); }
      return;
    }
    pickNewTarget();

    const SPEED = 1.0 * speed;
    let lastTime = performance.now();

    const setMoving = (v: boolean) => {
      if (isMovingRef.current !== v) {
        isMovingRef.current = v;
        setIsMoving(v);
      }
    };

    const animate = (now: number) => {
      if (isDraggingRef.current) {
        setMoving(false);
        lastTime = now;
        rafRef.current = requestAnimationFrame(animate);
        return;
      }

      // Hold position while user is conversing: either typing (inputVisible)
      // or waiting for a reply (loadingBubble). The character should look
      // attentive, not wander off mid-sentence.
      const ps = usePetStore.getState();
      if (ps.loadingBubble || ps.inputVisible) {
        setMoving(false);
        lastTime = now;
        rafRef.current = requestAnimationFrame(animate);
        return;
      }

      // Wait at current position until pause expires
      if (now < pauseUntilRef.current) {
        setMoving(false);
        lastTime = now;
        rafRef.current = requestAnimationFrame(animate);
        return;
      }

      const dt = Math.min((now - lastTime) / 16, 3);
      lastTime = now;

      let reached = false;
      setPosition((prev: { x: number; y: number }) => {
        const dx = targetRef.current.x - prev.x;
        const dy = targetRef.current.y - prev.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < SPEED * dt) {
          reached = true;
          return prev;
        }
        const nx = prev.x + (dx / dist) * SPEED * dt;
        const ny = prev.y + (dy / dist) * SPEED * dt;
        return clampToScreen({ x: nx, y: ny }, characterSize, getScreenBounds());
      });

      if (reached) {
        setMoving(false);
        pickNewTarget();
      } else {
        setMoving(true);
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
    // isDragging intentionally omitted — read via ref to avoid animation restart on each drag
  }, [mode, speed, characterSize, pickNewTarget, setPosition, getScreenBounds]);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setDragging(true);
      const startX = e.clientX - position.x;
      const startY = e.clientY - position.y;
      const onMove = (ev: MouseEvent) => {
        setPosition(
          clampToScreen(
            { x: ev.clientX - startX, y: ev.clientY - startY },
            characterSize,
            getScreenBounds()
          )
        );
      };
      const onUp = () => {
        setDragging(false);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [position, setPosition, setDragging, characterSize, getScreenBounds]
  );

  return { position, onMouseDown };
}
