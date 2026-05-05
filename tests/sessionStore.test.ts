import { describe, it, expect, beforeEach } from "vitest";
import { useSessionStore } from "../src/stores/sessionStore";

describe("sessionStore", () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
  });

  it("starts with empty messages", () => {
    expect(useSessionStore.getState().messages).toHaveLength(0);
  });

  it("addExchange appends two messages", () => {
    useSessionStore.getState().addExchange("hi", "hello");
    expect(useSessionStore.getState().messages).toHaveLength(2);
  });

  it("turnCount returns half of messages length", () => {
    useSessionStore.getState().addExchange("q", "a");
    useSessionStore.getState().addExchange("q2", "a2");
    expect(useSessionStore.getState().turnCount()).toBe(2);
  });

  it("atTurnLimit is false below 30 turns", () => {
    useSessionStore.getState().addExchange("q", "a");
    expect(useSessionStore.getState().atTurnLimit()).toBe(false);
  });

  it("atTurnLimit is true at 30 turns", () => {
    for (let i = 0; i < 30; i++) {
      useSessionStore.getState().addExchange(`q${i}`, `a${i}`);
    }
    expect(useSessionStore.getState().atTurnLimit()).toBe(true);
  });

  it("reset clears messages", () => {
    useSessionStore.getState().addExchange("q", "a");
    useSessionStore.getState().reset();
    expect(useSessionStore.getState().messages).toHaveLength(0);
  });
});
