import React, { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
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

function formatTodayMessages(messages: Message[]): string {
  const lines: string[] = [];
  for (let i = 0; i < messages.length; i += 2) {
    const u = messages[i];
    const a = messages[i + 1];
    if (!u) continue;
    lines.push(`👤 你：${u.content}`);
    if (a) lines.push(`🤖 寵物：${a.content}`);
    lines.push("");
  }
  return lines.join("\n");
}

function exportFileNameFor(viewDay: 0 | -1 | -2): string {
  const d = new Date();
  d.setDate(d.getDate() + viewDay);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `desktop-pet-chat-${yyyy}-${mm}-${dd}.txt`;
}

export function ChatApp() {
  useSessionSync();
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  // Optimistic placeholder shown immediately after Enter so the user sees
  // their message + a "思考中…" reply while the CLI is running. Cleared
  // when the corresponding pair lands in the synced session, or on error.
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [viewDay, setViewDay] = useState<0 | -1 | -2>(0);
  const [historyText, setHistoryText] = useState("");
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

  // Load historical log when viewing a past day.
  useEffect(() => {
    if (viewDay === 0) return;
    let cancelled = false;
    invoke<string>("read_daily_log", { day: viewDay })
      .then((s) => { if (!cancelled) setHistoryText(s); })
      .catch(() => { if (!cancelled) setHistoryText(""); });
    return () => { cancelled = true; };
  }, [viewDay]);

  // Drop optimistic placeholder when switching off Today.
  useEffect(() => {
    if (viewDay !== 0) setPendingPrompt(null);
  }, [viewDay]);

  const isReadOnly = viewDay !== 0;

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

  const handleExport = async () => {
    const content = viewDay === 0 ? formatTodayMessages(messages) : historyText;
    if (!content.trim()) return;
    try {
      await invoke("export_session", {
        content,
        defaultName: exportFileNameFor(viewDay),
      });
    } catch (e) {
      console.error("export failed", e);
    }
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
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <span>對話記錄</span>
        <div style={{ display: "flex", gap: 4 }}>
          {([
            [0, t("chat.tab_today")],
            [-1, t("chat.tab_yesterday")],
            [-2, t("chat.tab_day_before")],
          ] as const).map(([day, label]) => (
            <button
              key={day}
              onClick={() => setViewDay(day as 0 | -1 | -2)}
              style={{
                background: viewDay === day ? "#4A90D9" : "#eee",
                color: viewDay === day ? "#fff" : "#333",
                border: "none",
                borderRadius: 6,
                padding: "4px 10px",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button
          onClick={handleExport}
          style={{
            background: "#eee",
            color: "#333",
            border: "none",
            borderRadius: 6,
            padding: "4px 10px",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          {t("chat.export")}
        </button>
      </div>

      {!isReadOnly && atTurnLimit() && (
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

      {isReadOnly ? (
        <div style={{
          flex: 1,
          overflowY: "auto",
          padding: 16,
          fontSize: 13,
          whiteSpace: "pre-wrap",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        }}>
          {historyText.trim() === ""
            ? <div style={{ color: "#999" }}>{t("chat.no_log_for_day")}</div>
            : historyText}
        </div>
      ) : (
        <MessageList messages={displayMessages} />
      )}

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
          placeholder={isReadOnly ? t("chat.readonly_placeholder") : (loading ? "思考中…請稍候" : "輸入訊息...")}
          style={{
            flex: 1,
            border: "1.5px solid #ddd",
            borderRadius: 10,
            padding: "8px 12px",
            fontSize: 14,
            outline: "none",
            background: loading ? "#f5f5f5" : "#fff",
          }}
          disabled={loading || isReadOnly}
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim() || isReadOnly}
          style={btnStyle("#4A90D9")}
        >
          {loading ? "思考中…" : "送出"}
        </button>
      </div>
    </div>
  );
}
