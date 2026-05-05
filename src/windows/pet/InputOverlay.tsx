import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { usePetStore } from "../../stores/petStore";
import { useSessionStore } from "../../stores/sessionStore";

export function InputOverlay() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const { inputVisible, setInputVisible, showBubble } = usePetStore();
  const { addExchange } = useSessionStore();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputVisible) inputRef.current?.focus();
  }, [inputVisible]);

  if (!inputVisible) return null;

  const handleSend = async () => {
    const prompt = input.trim();
    if (!prompt || loading) return;
    setInput("");
    setInputVisible(false);
    setLoading(true);
    try {
      const response = await invoke<string>("send_message", { prompt });
      addExchange(prompt, response);
      showBubble(response);
    } catch (e) {
      showBubble(`錯誤：${e}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
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
