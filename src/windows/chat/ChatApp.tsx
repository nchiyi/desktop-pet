import React, { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { MessageList } from "./MessageList";
import { useSessionStore } from "../../stores/sessionStore";
import { useSessionSync } from "../../hooks/useSessionSync";
import { Message } from "../../types/session";

function btnStyle(bg: string): React.CSSProperties {
  return {
    background: bg,
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "6px 14px",
    cursor: "pointer",
    fontSize: 13,
  };
}

export function ChatApp() {
  useSessionSync();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  // Optimistic placeholder shown immediately after Enter so the user sees
  // their message + a "思考中…" reply while the CLI is running. Cleared
  // when the corresponding pair lands in the synced session, or on error.
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const { messages, addExchange, atTurnLimit, reset } = useSessionStore();

  // Drop the pending placeholder once the synced session contains the prompt.
  useEffect(() => {
    if (!pendingPrompt) return;
    const lastUser = messages.length >= 2
      ? messages[messages.length - 2]
      : messages[messages.length - 1];
    if (lastUser?.role === "user" && lastUser.content === pendingPrompt) {
      setPendingPrompt(null);
    }
  }, [messages, pendingPrompt]);

  const displayMessages = useMemo<Message[]>(() => {
    if (!pendingPrompt) return messages;
    return [
      ...messages,
      { role: "user", content: pendingPrompt },
      { role: "assistant", content: "思考中…", pending: true },
    ];
  }, [messages, pendingPrompt]);

  const handleSend = async () => {
    const prompt = input.trim();
    if (!prompt || loading) return;
    setInput("");
    setLoading(true);
    setPendingPrompt(prompt);
    try {
      // Rust appends to session and emits "session-updated"; useSessionSync
      // handles the store update — do NOT addExchange locally or we risk
      // duplicating the pair if the event arrives before this resolves.
      await invoke<string>("send_message", { prompt });
    } catch (e) {
      // Error path doesn't go through Rust's session, so no session-updated
      // will arrive — drop the placeholder and surface the error locally.
      addExchange(prompt, `錯誤：${e}`);
      setPendingPrompt(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSummarize = async () => {
    setLoading(true);
    setPendingPrompt("請幫我總結這段對話的重點");
    try {
      await invoke<string>("send_message", {
        prompt: "請幫我總結這段對話的重點",
      });
    } catch (e) {
      addExchange("[總結請求]", `錯誤：${e}`);
      setPendingPrompt(null);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    await invoke("reset_session");
    reset();
    setPendingPrompt(null);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid #eee",
          fontWeight: 600,
          fontSize: 15,
        }}
      >
        對話記錄
      </div>

      {atTurnLimit() && (
        <div
          style={{
            background: "#FFF3CD",
            padding: "8px 16px",
            fontSize: 13,
            display: "flex",
            gap: 8,
            alignItems: "center",
          }}
        >
          <span>我們聊了很多了！</span>
          <button onClick={handleSummarize} style={btnStyle("#4A90D9")}>
            總結
          </button>
          <button onClick={handleReset} style={btnStyle("#e55")}>
            重新開始
          </button>
        </div>
      )}

      <MessageList messages={displayMessages} />

      <div
        style={{
          padding: "10px 16px",
          borderTop: "1px solid #eee",
          display: "flex",
          gap: 8,
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={loading ? "思考中…請稍候" : "輸入訊息..."}
          style={{
            flex: 1,
            border: "1.5px solid #ddd",
            borderRadius: 10,
            padding: "8px 12px",
            fontSize: 14,
            outline: "none",
            background: loading ? "#f5f5f5" : "#fff",
          }}
          disabled={loading}
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          style={btnStyle("#4A90D9")}
        >
          {loading ? "思考中…" : "送出"}
        </button>
      </div>
    </div>
  );
}
