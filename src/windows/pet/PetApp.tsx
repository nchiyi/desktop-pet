import React, { useEffect, useCallback, useRef } from "react";
import { register, unregisterAll } from "@tauri-apps/plugin-global-shortcut";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { PetCharacter } from "./PetCharacter";
import { SpeechBubble } from "./SpeechBubble";
import { InputOverlay } from "./InputOverlay";
import { usePetMovement } from "../../hooks/usePetMovement";
import { usePetAnimation } from "../../hooks/usePetAnimation";
import { useSessionSync } from "../../hooks/useSessionSync";
import { usePetStore } from "../../stores/petStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useSessionStore } from "../../stores/sessionStore";

export function PetApp() {
  useSessionSync();
  const { config, load } = useSettingsStore();
  const {
    bubbleSegments,
    bubbleSegIndex,
    bubbleLoopIndex,
    bubbleToken,
    loadingBubble,
    advanceBubble,
    clearBubble,
    setInputVisible,
    showBubble,
    inputVisible,
  } = usePetStore();
  const TOTAL_LOOPS = 3;
  const currentSegment = bubbleSegments[bubbleSegIndex];
  const atTurnLimit = useSessionStore((s) => s.atTurnLimit());
  const { animState, animPath, onDragStart, onDragEnd, onPromptSent, onReplyReceived } = usePetAnimation();
  const { position, onMouseDown: movementMouseDown } = usePetMovement(
    config.movement_mode,
    config.movement_speed,
    config.character_size
  );

  useEffect(() => { load(); }, [load]);

  // Reload config whenever settings window saves changes; also handle tray "Open Chat"
  useEffect(() => {
    let unlistenConfig: (() => void) | undefined;
    let unlistenInput: (() => void) | undefined;
    listen("config-updated", () => { load(); }).then(fn => { unlistenConfig = fn; });
    listen("open-input", () => {
      setInputVisible(true);
      getCurrentWindow().setFocus().catch(() => {});
    }).then(fn => { unlistenInput = fn; });
    return () => { unlistenConfig?.(); unlistenInput?.(); };
  }, [load, setInputVisible]);

  // Keep Rust cursor-tracker in sync with character position. Throttled to
  // 50 ms (matches the cursor tracker's poll cadence) — at 60 Hz movement we
  // would otherwise fire ~60 IPC calls/sec for no benefit. A trailing-edge
  // timer guarantees the final resting position is sent even when frames stop.
  const lastSentRef = useRef(0);
  const trailingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const send = () => {
      lastSentRef.current = performance.now();
      invoke("update_char_pos", {
        x: Math.round(position.x),
        y: Math.round(position.y),
        size: config.character_size,
      }).catch(console.error);
    };
    const elapsed = performance.now() - lastSentRef.current;
    if (trailingTimerRef.current) {
      clearTimeout(trailingTimerRef.current);
      trailingTimerRef.current = null;
    }
    if (elapsed >= 50) {
      send();
    } else {
      trailingTimerRef.current = setTimeout(send, 50 - elapsed);
    }
    return () => {
      if (trailingTimerRef.current) {
        clearTimeout(trailingTimerRef.current);
        trailingTimerRef.current = null;
      }
    };
  }, [position, config.character_size]);

  // Let Rust know when input overlay is open so click-through stays disabled
  useEffect(() => {
    invoke("set_input_visible", { visible: inputVisible }).catch(console.error);
  }, [inputVisible]);

  // Disable WebView right-click context menu
  useEffect(() => {
    const prevent = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", prevent);
    return () => document.removeEventListener("contextmenu", prevent);
  }, []);

  // Auto-dismiss the input overlay when the user moves focus elsewhere
  // (e.g., opens settings or chat from the tray). Otherwise the hotkey-opened
  // overlay would linger as a stale input field over the pet.
  useEffect(() => {
    const onBlur = () => {
      if (usePetStore.getState().inputVisible) {
        setInputVisible(false);
      }
    };
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [setInputVisible]);

  // Refs so event handlers always read latest values without re-registering each frame
  const posRef = useRef(position);
  const charSizeRef = useRef(config.character_size);
  useEffect(() => { posRef.current = position; }, [position]);
  useEffect(() => { charSizeRef.current = config.character_size; }, [config.character_size]);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // JS-side backup: when window receives events (cursor near character), watch for
  // cursor leaving and restore OS-level click-through after a short delay.
  // The delay must be >= double-click timeout so we don't interrupt the second click.
  useEffect(() => {
    if (inputVisible) {
      if (leaveTimerRef.current) { clearTimeout(leaveTimerRef.current); leaveTimerRef.current = null; }
      return;
    }
    const appWindow = getCurrentWindow();
    const BUBBLE_H = 220;
    const onMouseMove = (e: MouseEvent) => {
      const { x: px, y: py } = posRef.current;
      const ps = charSizeRef.current;
      const over = e.clientX >= px && e.clientX <= px + ps
                && e.clientY >= py - BUBBLE_H && e.clientY <= py + ps;
      if (over) {
        if (leaveTimerRef.current) { clearTimeout(leaveTimerRef.current); leaveTimerRef.current = null; }
      } else if (!leaveTimerRef.current) {
        // 600ms > 400ms double-click window so the timer never fires mid-double-click
        leaveTimerRef.current = setTimeout(() => {
          leaveTimerRef.current = null;
          appWindow.setIgnoreCursorEvents(true).catch(() => {});
        }, 600);
      }
    };
    // When user clicks on transparent background (not the character), immediately
    // restore click-through so subsequent desktop clicks are not blocked.
    const onDocMouseDown = (e: MouseEvent) => {
      const { x: px, y: py } = posRef.current;
      const ps = charSizeRef.current;
      const onChar = e.clientX >= px && e.clientX <= px + ps
                  && e.clientY >= py && e.clientY <= py + ps;
      if (!onChar) {
        appWindow.setIgnoreCursorEvents(true).catch(() => {});
      }
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mousedown", onDocMouseDown);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mousedown", onDocMouseDown);
      if (leaveTimerRef.current) { clearTimeout(leaveTimerRef.current); leaveTimerRef.current = null; }
    };
  }, [inputVisible]);

  // Register global hotkeys: one to summon the input overlay, one to toggle
  // the pet's visibility on/off so the user can hide the character without
  // navigating to the tray.
  useEffect(() => {
    register(config.hotkey, () => {
      setInputVisible(true);
      getCurrentWindow().setFocus().catch(() => {});
    }).catch(console.error);
    if (config.toggle_hotkey && config.toggle_hotkey !== config.hotkey) {
      register(config.toggle_hotkey, () => {
        invoke("toggle_pet_visibility").catch(console.error);
      }).catch(console.error);
    }
    return () => { unregisterAll().catch(console.error); };
  }, [config.hotkey, config.toggle_hotkey, setInputVisible]);

  // Idle bubbles — use a variable that the cleanup always points to the latest timer
  useEffect(() => {
    if (!config.show_idle_bubbles) return;
    let current: ReturnType<typeof setTimeout>;
    const scheduleNext = () => {
      const ms =
        (config.idle_anim_interval_min +
          Math.random() *
            (config.idle_anim_interval_max - config.idle_anim_interval_min)) *
        1000;
      current = setTimeout(async () => {
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
    scheduleNext();
    return () => clearTimeout(current);
  }, [
    config.show_idle_bubbles,
    config.idle_anim_interval_min,
    config.idle_anim_interval_max,
    showBubble,
  ]);

  // 30-turn warning
  useEffect(() => {
    if (atTurnLimit) {
      showBubble("我們聊了很多了！要幫你總結這段對話嗎？");
    }
  }, [atTurnLimit, showBubble]);

  // Detect double-click in mousedown to avoid relying on the dblclick event.
  // movementMouseDown calls e.preventDefault(), which in WebKit suppresses click
  // events, making dblclick never fire. We detect rapid successive mousedowns instead.
  const lastMouseDownTimeRef = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Clicking on character — cancel any pending click-through restoration
      if (leaveTimerRef.current) { clearTimeout(leaveTimerRef.current); leaveTimerRef.current = null; }

      const now = performance.now();
      if (now - lastMouseDownTimeRef.current < 400) {
        // Double-click detected
        lastMouseDownTimeRef.current = 0;
        setInputVisible(true);
        getCurrentWindow().setFocus().catch(() => {});
        return;
      }
      lastMouseDownTimeRef.current = now;
      onDragStart();
      movementMouseDown(e);
    },
    [onDragStart, movementMouseDown, setInputVisible]
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
      {loadingBubble ? (
        <SpeechBubble
          key="loading"
          text="思考中…"
          durationMs={0}
          persistent
          onExpire={() => {}}
        />
      ) : currentSegment ? (
        <SpeechBubble
          // Re-mount per segment / loop / new bubble so the timer resets.
          key={`${bubbleToken}-${bubbleLoopIndex}-${bubbleSegIndex}`}
          text={currentSegment}
          durationMs={config.bubble_duration_secs * 1000}
          segIndex={bubbleSegments.length > 1 ? bubbleSegIndex + 1 : undefined}
          segTotal={bubbleSegments.length > 1 ? bubbleSegments.length : undefined}
          loopIndex={bubbleSegments.length > 1 ? bubbleLoopIndex + 1 : undefined}
          loopTotal={bubbleSegments.length > 1 ? TOTAL_LOOPS : undefined}
          onExpire={advanceBubble}
          onClickExpand={() => {
            clearBubble();
            invoke("show_chat_window").catch(console.error);
          }}
        />
      ) : null}
      <PetCharacter
        animPath={animPath}
        animState={animState}
        size={config.character_size}
      />
      <InputOverlay onPromptSent={onPromptSent} onReplyReceived={onReplyReceived} />
    </div>
  );
}
