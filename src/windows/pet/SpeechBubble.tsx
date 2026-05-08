import { useEffect } from "react";

interface Props {
  text: string;
  /** Base bubble duration (ms). The bubble auto-extends for long segments. */
  durationMs: number;
  /** 1-based current segment index, omitted for single-segment bubbles. */
  segIndex?: number;
  segTotal?: number;
  loopIndex?: number;
  loopTotal?: number;
  /** When true, the bubble does not auto-expire — caller controls dismissal.
   *  Used for the "思考中…" placeholder while the CLI runs. */
  persistent?: boolean;
  onExpire: () => void;
  onClickExpand?: () => void;
}

export function SpeechBubble({
  text,
  durationMs,
  segIndex,
  segTotal,
  loopIndex,
  loopTotal,
  persistent,
  onExpire,
  onClickExpand,
}: Props) {
  // Reading time scales with length: ~80 ms per char, with a sane min/max.
  // This prevents a 180-char segment from disappearing in 3 seconds.
  const readMs = Math.max(durationMs, Math.min(12_000, 2500 + text.length * 80));
  const showPager = (segTotal ?? 1) > 1;

  useEffect(() => {
    if (persistent) return; // caller owns dismissal
    const t = setTimeout(onExpire, readMs);
    return () => clearTimeout(t);
  }, [readMs, onExpire, persistent]);

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
        padding: "8px 12px",
        minWidth: 160,
        width: "max-content",
        maxWidth: 380,
        fontSize: 13,
        lineHeight: 1.55,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        cursor: onClickExpand ? "pointer" : "default",
        userSelect: "none",
        zIndex: 1000,
      }}
      onClick={onClickExpand}
    >
      {text}
      {showPager && (
        <div
          style={{
            marginTop: 4,
            fontSize: 11,
            color: "#888",
            display: "flex",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <span>
            {segIndex}/{segTotal}
            {loopTotal && loopTotal > 1 ? `　第 ${loopIndex}/${loopTotal} 輪` : ""}
          </span>
          {onClickExpand && <span>點我看完整 →</span>}
        </div>
      )}
    </div>
  );
}
