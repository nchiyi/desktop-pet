import React, { useEffect, useCallback } from "react";
import { register, unregisterAll } from "@tauri-apps/plugin-global-shortcut";
import { invoke } from "@tauri-apps/api/core";
import { PetCharacter } from "./PetCharacter";
import { SpeechBubble } from "./SpeechBubble";
import { InputOverlay } from "./InputOverlay";
import { usePetMovement } from "../../hooks/usePetMovement";
import { usePetAnimation } from "../../hooks/usePetAnimation";
import { usePetStore } from "../../stores/petStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useSessionStore } from "../../stores/sessionStore";

export function PetApp() {
  const { config, load } = useSettingsStore();
  const { bubbleText, clearBubble, setInputVisible, showBubble } = usePetStore();
  const { atTurnLimit } = useSessionStore();
  const { animState, animPath, onDragStart, onDragEnd } = usePetAnimation();
  const { position, onMouseDown: movementMouseDown } = usePetMovement(
    config.movement_mode,
    config.movement_speed,
    config.character_size
  );

  useEffect(() => { load(); }, [load]);

  // Register global hotkey
  useEffect(() => {
    register(config.hotkey, () => setInputVisible(true)).catch(console.error);
    return () => { unregisterAll().catch(console.error); };
  }, [config.hotkey, setInputVisible]);

  // Idle bubbles
  useEffect(() => {
    if (!config.show_idle_bubbles) return;
    const scheduleNext = (): ReturnType<typeof setTimeout> => {
      const ms =
        (config.idle_anim_interval_min +
          Math.random() *
            (config.idle_anim_interval_max - config.idle_anim_interval_min)) *
        1000;
      return setTimeout(async () => {
        try {
          const phrases = await invoke<string[]>("get_idle_phrases");
          if (phrases.length > 0) {
            showBubble(phrases[Math.floor(Math.random() * phrases.length)]);
          }
        } catch {
          // ignore
        }
        scheduleNext();
      }, ms);
    };
    const t = scheduleNext();
    return () => clearTimeout(t);
  }, [
    config.show_idle_bubbles,
    config.idle_anim_interval_min,
    config.idle_anim_interval_max,
    showBubble,
  ]);

  // 30-turn warning
  useEffect(() => {
    if (atTurnLimit()) {
      showBubble("我們聊了很多了！要幫你總結這段對話嗎？");
    }
  }, [atTurnLimit, showBubble]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      onDragStart();
      movementMouseDown(e);
    },
    [onDragStart, movementMouseDown]
  );

  const handleMouseUp = useCallback(() => { onDragEnd(); }, [onDragEnd]);

  return (
    <div
      style={{
        position: "fixed",
        left: position.x,
        top: position.y,
        width: config.character_size,
        height: config.character_size,
        cursor: "grab",
        userSelect: "none",
        pointerEvents: "auto",
      }}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
    >
      {bubbleText && (
        <SpeechBubble
          text={bubbleText}
          durationMs={config.bubble_duration_secs * 1000}
          onExpire={clearBubble}
          onClickExpand={() => {
            clearBubble();
            invoke("show_chat_window").catch(console.error);
          }}
        />
      )}
      <PetCharacter
        animPath={animPath}
        animState={animState}
        size={config.character_size}
      />
      <InputOverlay />
    </div>
  );
}
