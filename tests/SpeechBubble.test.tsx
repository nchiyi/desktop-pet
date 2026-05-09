import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { SpeechBubble } from "../src/windows/pet/SpeechBubble";

describe("SpeechBubble", () => {
  it("renders short text content", () => {
    render(
      <SpeechBubble text="hello world" durationMs={999999} onExpire={() => {}} />
    );
    expect(screen.getByText("hello world")).toBeTruthy();
  });

  it("shows pager + expand hint when multi-segment with onClickExpand", () => {
    // Text segmentation now lives in petStore.chunkText; SpeechBubble just
    // renders one already-chunked segment with pager metadata.
    render(
      <SpeechBubble
        text="第 1 段內容"
        durationMs={999999}
        segIndex={1}
        segTotal={3}
        onExpire={() => {}}
        onClickExpand={() => {}}
      />
    );
    expect(screen.getByText(/點我看完整/)).toBeTruthy();
    expect(screen.getByText(/1\/3/)).toBeTruthy();
  });

  it("calls onExpire after computed reading time", async () => {
    // readMs = max(durationMs, min(12_000, 2500 + len*80)). Pass durationMs
    // above the 2500ms reading-time floor so the timer is dominated by it.
    vi.useFakeTimers();
    const onExpire = vi.fn();
    render(<SpeechBubble text="hi" durationMs={5000} onExpire={onExpire} />);
    await act(async () => { vi.advanceTimersByTime(5001); });
    expect(onExpire).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("does not auto-expire when persistent", async () => {
    vi.useFakeTimers();
    const onExpire = vi.fn();
    render(
      <SpeechBubble text="思考中…" durationMs={0} persistent onExpire={onExpire} />
    );
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(onExpire).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
