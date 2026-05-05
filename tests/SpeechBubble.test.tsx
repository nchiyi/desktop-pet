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

  it("truncates text over 100 chars and shows expand hint", () => {
    const long = "a".repeat(150);
    render(
      <SpeechBubble text={long} durationMs={999999} onExpire={() => {}} />
    );
    expect(screen.getByText(/點我查看/)).toBeTruthy();
  });

  it("calls onExpire after duration", async () => {
    vi.useFakeTimers();
    const onExpire = vi.fn();
    render(<SpeechBubble text="hi" durationMs={1000} onExpire={onExpire} />);
    await act(async () => { vi.advanceTimersByTime(1001); });
    expect(onExpire).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
