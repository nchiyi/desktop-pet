import React, { useEffect, useRef, useCallback } from "react";
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
  const { position, setPosition, isDragging, setDragging } = usePetStore();
  const targetRef = useRef<{ x: number; y: number }>(position);
  const rafRef = useRef<number>(0);

  const getScreenBounds = useCallback((): ScreenBounds => ({
    x: 0,
    y: 0,
    width: window.screen.width,
    height: window.screen.height,
  }), []);

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
  }, [mode, characterSize, getScreenBounds]);

  useEffect(() => {
    if (mode === "Fixed") return;
    pickNewTarget();

    const SPEED = 1.5 * speed;
    let lastTime = performance.now();

    const animate = (now: number) => {
      if (isDragging) {
        lastTime = now;
        rafRef.current = requestAnimationFrame(animate);
        return;
      }
      const dt = Math.min((now - lastTime) / 16, 3);
      lastTime = now;

      setPosition((prev: { x: number; y: number }) => {
        const dx = targetRef.current.x - prev.x;
        const dy = targetRef.current.y - prev.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < SPEED * dt) {
          pickNewTarget();
          return prev;
        }
        const nx = prev.x + (dx / dist) * SPEED * dt;
        const ny = prev.y + (dy / dist) * SPEED * dt;
        return clampToScreen({ x: nx, y: ny }, characterSize, getScreenBounds());
      });

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [mode, speed, characterSize, isDragging, pickNewTarget, setPosition, getScreenBounds]);

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
