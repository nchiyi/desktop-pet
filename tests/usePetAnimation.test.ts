import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePetAnimation } from "../src/hooks/usePetAnimation";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue("/path/to/idle.gif"),
}));

describe("usePetAnimation", () => {
  it("starts in idle state", () => {
    const { result } = renderHook(() => usePetAnimation());
    expect(result.current.animState).toBe("idle");
  });

  it("transitionTo changes animState", async () => {
    const { result } = renderHook(() => usePetAnimation());
    await act(async () => { result.current.transitionTo("think"); });
    expect(result.current.animState).toBe("think");
  });

  it("onPromptSent sets think state", async () => {
    const { result } = renderHook(() => usePetAnimation());
    await act(async () => { result.current.onPromptSent(); });
    expect(result.current.animState).toBe("think");
  });

  it("onReplyReceived sets happy state", async () => {
    const { result } = renderHook(() => usePetAnimation());
    await act(async () => { result.current.onReplyReceived(); });
    expect(result.current.animState).toBe("happy");
  });
});
