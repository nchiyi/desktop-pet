import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { usePetStore } from "../../stores/petStore";

interface Props {
  onPromptSent?: () => void;
  onReplyReceived?: () => void;
  onImpatient?: () => void;
  onWaitTimeout?: () => void;
}

// Wait-state thresholds for the pet's reaction while the CLI is thinking.
const IMPATIENT_AFTER_MS = 30_000;
const SAD_AFTER_MS = 60_000;

export function InputOverlay({
  onPromptSent,
  onReplyReceived,
  onImpatient,
  onWaitTimeout,
}: Props) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const {
    inputVisible,
    setInputVisible,
    showBubble,
    setLoadingBubble,
    inputPosition,
    setInputPosition,
  } = usePetStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const impatientTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearWaitTimers = () => {
    if (impatientTimerRef.current) {
      clearTimeout(impatientTimerRef.current);
      impatientTimerRef.current = null;
    }
    if (sadTimerRef.current) {
      clearTimeout(sadTimerRef.current);
      sadTimerRef.current = null;
    }
  };

  useEffect(() => {
    if (!inputVisible) return;
    // Hotkey path: window may still be activating. Retry focus across a few
    // frames so the input reliably becomes the keyboard focus target.
    const t1 = setTimeout(() => inputRef.current?.focus(), 0);
    const t2 = setTimeout(() => inputRef.current?.focus(), 50);
    const t3 = setTimeout(() => inputRef.current?.focus(), 150);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [inputVisible]);

  // Tear down any in-flight drag listeners on unmount (e.g. user pressed Esc
  // mid-drag) so they don't outlive the component and corrupt state.
  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
      dragCleanupRef.current = null;
      clearWaitTimers();
    };
  }, []);

  if (!inputVisible) return null;

  const handleSend = async () => {
    const prompt = input.trim();
    if (!prompt || loading) return;
    setInput("");
    setInputVisible(false);
    setLoading(true);
    // Persistent placeholder — stays until response/error replaces it.
    // No flicker because SpeechBubble's auto-expire is disabled in this mode.
    setLoadingBubble(true);
    onPromptSent?.();
    // Tier the wait reaction: think → impatient → sad. Both are persistent
    // and get overwritten by happy when the reply arrives.
    clearWaitTimers();
    impatientTimerRef.current = setTimeout(() => {
      impatientTimerRef.current = null;
      onImpatient?.();
    }, IMPATIENT_AFTER_MS);
    sadTimerRef.current = setTimeout(() => {
      sadTimerRef.current = null;
      onWaitTimeout?.();
    }, SAD_AFTER_MS);
    try {
      // Rust appends to session and emits "session-updated"; useSessionSync in
      // PetApp updates the store — do not addExchange locally.
      const response = await invoke<string>("send_message", { prompt });
      clearWaitTimers();
      onReplyReceived?.();
      // showBubble flips loadingBubble off as part of its set() — see store.
      showBubble(response);
    } catch (e) {
      clearWaitTimers();
      showBubble(`錯誤：${e}`);
    } finally {
      setLoading(false);
      // Belt-and-braces: if showBubble was suppressed by trim() guard, ensure
      // the loading placeholder doesn't linger.
      setLoadingBubble(false);
    }
  };

  const handleDragStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const root = rootRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const dragOffsetX = e.clientX - rect.left;
    const dragOffsetY = e.clientY - rect.top;
    const w = rect.width;
    const h = rect.height;

    // Defensively unbind any leftover pair from a previous drag that didn't
    // see its mouseup (rare — duplicate mousedown, simultaneous events, etc).
    dragCleanupRef.current?.();

    const prevCursor = document.body.style.cursor;
    document.body.style.cursor = "grabbing";

    const onMove = (ev: MouseEvent) => {
      const rawX = ev.clientX - dragOffsetX;
      const rawY = ev.clientY - dragOffsetY;
      const x = Math.max(0, Math.min(rawX, window.innerWidth - w));
      const y = Math.max(0, Math.min(rawY, window.innerHeight - h));
      setInputPosition({ x, y });
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = prevCursor;
      dragCleanupRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    dragCleanupRef.current = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = prevCursor;
    };
  };

  return (
    <div
      ref={rootRef}
      onMouseDown={(e) => {
        // Clicking padding/whitespace should still focus the input — without this
        // the user has to hit the small <input> rectangle exactly. Stop the click
        // from bubbling to PetApp's drag handler.
        e.stopPropagation();
        if (e.target !== inputRef.current) {
          e.preventDefault();
          inputRef.current?.focus();
        }
      }}
      style={{
        position: "fixed",
        ...(inputPosition
          ? { left: inputPosition.x, top: inputPosition.y, transform: "none" }
          : { bottom: 80, left: "50%", transform: "translateX(-50%)" }),
        background: "rgba(255,255,255,0.97)",
        borderRadius: 16,
        boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
        display: "flex",
        flexDirection: "column",
        zIndex: 9999,
        minWidth: 300,
        cursor: "text",
        overflow: "hidden",
      }}
    >
      <div
        data-testid="input-drag-handle"
        onMouseDown={handleDragStart}
        style={{
          height: 6,
          background: "#d0d0d0",
          cursor: "grab",
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
        }}
      />
      <div style={{ display: "flex", gap: 8, padding: "10px 14px" }}>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSend();
            if (e.key === "Escape") setInputVisible(false);
          }}
          placeholder="問我任何問題..."
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            fontSize: 14,
            background: "transparent",
          }}
          disabled={loading}
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          style={{
            background: "#4A90D9",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "4px 12px",
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          {loading ? "…" : "送出"}
        </button>
      </div>
    </div>
  );
}
