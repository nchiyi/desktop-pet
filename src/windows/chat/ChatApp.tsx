import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { MessageList } from "./MessageList";
import { useSessionStore } from "../../stores/sessionStore";

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
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const { messages, addExchange, atTurnLimit, reset } = useSessionStore();

  const handleSend = async () => {
    const prompt = input.trim();
    if (!prompt || loading) return;
    setInput("");
    setLoading(true);
    try {
      const response = await invoke<string>("send_message", { prompt });
      addExchange(prompt, response);
    } catch (e) {
      addExchange(prompt, `錯誤：${e}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSummarize = async () => {
    setLoading(true);
    try {
      const summary = await invoke<string>("send_message", {
        prompt: "請幫我總結這段對話的重點",
      });
      addExchange("[總結請求]", summary);
    } catch (e) {
      addExchange("[總結請求]", `錯誤：${e}`);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    await invoke("reset_session");
    reset();
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

      <MessageList messages={messages} />

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
          placeholder="輸入訊息..."
          style={{
            flex: 1,
            border: "1.5px solid #ddd",
            borderRadius: 10,
            padding: "8px 12px",
            fontSize: 14,
            outline: "none",
          }}
          disabled={loading}
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          style={btnStyle("#4A90D9")}
        >
          {loading ? "…" : "送出"}
        </button>
      </div>
    </div>
  );
}
