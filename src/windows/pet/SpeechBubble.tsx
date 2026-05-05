import { useEffect } from "react";

const MAX_BUBBLE_CHARS = 100;

interface Props {
  text: string;
  durationMs: number;
  onExpire: () => void;
  onClickExpand?: () => void;
}

export function SpeechBubble({ text, durationMs, onExpire, onClickExpand }: Props) {
  const isTruncated = text.length > MAX_BUBBLE_CHARS;
  const displayText = isTruncated ? text.slice(0, MAX_BUBBLE_CHARS) + "…" : text;

  useEffect(() => {
    const t = setTimeout(onExpire, durationMs);
    return () => clearTimeout(t);
  }, [durationMs, onExpire]);

  return (
    <div
      style={{
        position: "absolute",
        bottom: "100%",
        left: "50%",
        transform: "translateX(-50%)",
        background: "rgba(255,255,255,0.95)",
        border: "1.5px solid #aaa",
        borderRadius: 12,
        padding: "6px 10px",
        maxWidth: 220,
        fontSize: 13,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        cursor: isTruncated ? "pointer" : "default",
        userSelect: "none",
        zIndex: 1000,
      }}
      onClick={isTruncated ? onClickExpand : undefined}
    >
      {displayText}
      {isTruncated && (
        <span style={{ color: "#888", fontSize: 11 }}> 點我查看 →</span>
      )}
    </div>
  );
}
