import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useSessionStore } from "../stores/sessionStore";
import { Session } from "../types/session";

/**
 * Each Tauri window has its own JS context and Zustand store, so the chat and
 * pet windows would otherwise hold divergent message lists. This hook keeps
 * the local store in sync with the canonical Rust-side session by:
 *   1. Hydrating from `get_session` on mount.
 *   2. Re-fetching when Rust emits `session-updated` (after any send/reset),
 *      debounced 50 ms to coalesce bursts.
 */
export function useSessionSync() {
  const setMessages = useSessionStore((s) => s.setMessages);

  useEffect(() => {
    let cancelled = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const fetchSession = async () => {
      try {
        const session = await invoke<Session>("get_session");
        if (!cancelled) setMessages(session.messages ?? []);
      } catch (e) {
        if (!cancelled) console.error("get_session failed:", e);
      }
    };

    fetchSession();

    let unlisten: (() => void) | undefined;
    listen("session-updated", () => {
      if (cancelled) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (!cancelled) fetchSession();
      }, 50);
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });

    return () => {
      cancelled = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      unlisten?.();
    };
  }, [setMessages]);
}
