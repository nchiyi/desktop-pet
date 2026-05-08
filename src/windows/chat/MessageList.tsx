import { useEffect, useRef } from "react";
import { Message } from "../../types/session";

interface Props { messages: Message[]; }

export function MessageList({ messages }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "12px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {messages.map((m, i) => (
        <div
          key={i}
          style={{
            alignSelf: m.role === "user" ? "flex-end" : "flex-start",
            background: m.role === "user" ? "#4A90D9" : "#f0f0f0",
            color: m.role === "user" ? "#fff" : "#222",
            borderRadius:
              m.role === "user"
                ? "16px 16px 4px 16px"
                : "16px 16px 16px 4px",
            padding: "8px 12px",
            maxWidth: "80%",
            fontSize: 14,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            // Pending placeholder: visually distinct so the user sees that
            // their send is in progress (not the window frozen).
            opacity: m.pending ? 0.65 : 1,
            fontStyle: m.pending ? "italic" : "normal",
          }}
        >
          {m.content}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
