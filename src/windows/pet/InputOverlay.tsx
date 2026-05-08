import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { usePetStore } from "../../stores/petStore";

interface Props {
  onPromptSent?: () => void;
  onReplyReceived?: () => void;
}

export function InputOverlay({ onPromptSent, onReplyReceived }: Props) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const { inputVisible, setInputVisible, showBubble, setLoadingBubble } = usePetStore();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!inputVisible) return;
    // Hotkey path: window may still be activating. Retry focus across a few
    // frames so the input reliably becomes the keyboard focus target.
    const t1 = setTimeout(() => inputRef.current?.focus(), 0);
    const t2 = setTimeout(() => inputRef.current?.focus(), 50);
    const t3 = setTimeout(() => inputRef.current?.focus(), 150);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [inputVisible]);

  // No more 4-s setInterval (it caused visible flicker when the bubble's own
  // auto-expire fired before the next re-issue). The persistent "思考中…"
  // bubble is rendered by PetApp from the loadingBubble flag and stays put
  // until either showBubble(response) replaces it or setLoadingBubble(false)
  // dismisses it on error.

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
    try {
      // Rust appends to session and emits "session-updated"; useSessionSync in
      // PetApp updates the store — do not addExchange locally.
      const response = await invoke<string>("send_message", { prompt });
      onReplyReceived?.();
      // showBubble flips loadingBubble off as part of its set() — see store.
      showBubble(response);
    } catch (e) {
      showBubble(`錯誤：${e}`);
    } finally {
      setLoading(false);
      // Belt-and-braces: if showBubble was suppressed by trim() guard, ensure
      // the loading placeholder doesn't linger.
      setLoadingBubble(false);
    }
  };

  return (
    <div
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
        bottom: 80,
        left: "50%",
        transform: "translateX(-50%)",
        background: "rgba(255,255,255,0.97)",
        borderRadius: 16,
        padding: "10px 14px",
        boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
        display: "flex",
        gap: 8,
        zIndex: 9999,
        minWidth: 300,
        cursor: "text",
      }}
    >
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
  );
}
