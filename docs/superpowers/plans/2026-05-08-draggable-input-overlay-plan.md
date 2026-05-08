# Draggable Input Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a draggable handle to the pet input overlay so users can position it anywhere on screen; remember the position within an app session, but reset to default on app restart. Also add a "reset position" button in the Settings page that talks to the pet window via Tauri event.

**Architecture:** Pure frontend change. New `inputPosition` field on existing `petStore` (in-memory only, NOT persisted). `InputOverlay` gets a top drag handle; mousedown on the handle attaches window-level mousemove/mouseup listeners with hard clamping to viewport. Settings → Pet window communication uses Tauri's `emit`/`listen` cross-window event API; no Rust changes needed.

**Tech Stack:** React 19, Zustand 5, TypeScript, `@tauri-apps/api/event`, Vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-05-08-draggable-input-overlay-design.md` (Part 1)

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/stores/petStore.ts` | Modify | Add `inputPosition: {x,y} \| null` + `setInputPosition` + `resetInputPosition` |
| `src/windows/pet/InputOverlay.tsx` | Modify | Top drag handle, drag logic, conditional positioning style |
| `src/windows/pet/PetApp.tsx` | Modify | Listen for `reset-input-position` Tauri event |
| `src/windows/settings/tabs/General.tsx` | Modify | Add "Reset Input Position" button that emits the event |
| `src/locales/zh-TW.json` | Modify | i18n strings |
| `src/locales/en.json` | Modify | i18n strings |
| `tests/petStore.test.ts` | Create | Test new store fields |
| `tests/InputOverlay.test.tsx` | Create | Test drag + clamp + reset |

---

## Conventions

- Run frontend tests with `npx vitest run <file>` from `/Users/chiyi/Desktop/Antigravity/desktop-pet`. Add `-t "<test name>"` to target a single test.
- Type-check with `npx tsc --noEmit`.
- Commit after each task, message in conventional-commits style.

---

## Task 1: Add `inputPosition` state to `petStore`

**Files:**
- Create: `tests/petStore.test.ts`
- Modify: `src/stores/petStore.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/petStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { usePetStore } from "../src/stores/petStore";

describe("petStore inputPosition", () => {
  beforeEach(() => {
    usePetStore.getState().resetInputPosition();
  });

  it("starts as null (use default position)", () => {
    expect(usePetStore.getState().inputPosition).toBeNull();
  });

  it("setInputPosition stores the coords", () => {
    usePetStore.getState().setInputPosition({ x: 100, y: 200 });
    expect(usePetStore.getState().inputPosition).toEqual({ x: 100, y: 200 });
  });

  it("resetInputPosition clears the coords back to null", () => {
    usePetStore.getState().setInputPosition({ x: 50, y: 60 });
    usePetStore.getState().resetInputPosition();
    expect(usePetStore.getState().inputPosition).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/petStore.test.ts
```

Expected: FAIL — `inputPosition`, `setInputPosition`, `resetInputPosition` are undefined on the store.

- [ ] **Step 3: Update the store interface and state**

Edit `src/stores/petStore.ts`. In the `PetState` interface, add (next to `inputVisible`):

```ts
  /** Custom drag-positioned coords for InputOverlay. null = use default
   *  bottom-center placement. In-memory only — resets on app restart. */
  inputPosition: { x: number; y: number } | null;
  setInputPosition: (pos: { x: number; y: number }) => void;
  resetInputPosition: () => void;
```

In the `create` body, add (next to `inputVisible: false,`):

```ts
  inputPosition: null,
  setInputPosition: (inputPosition) => set({ inputPosition }),
  resetInputPosition: () => set({ inputPosition: null }),
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/petStore.test.ts
```

Expected: PASS — 3/3.

- [ ] **Step 5: Commit**

```bash
git add tests/petStore.test.ts src/stores/petStore.ts
git commit -m "feat(petStore): add inputPosition state for draggable overlay"
```

---

## Task 2: Add drag handle UI to `InputOverlay`

**Files:**
- Create: `tests/InputOverlay.test.tsx`
- Modify: `src/windows/pet/InputOverlay.tsx`

- [ ] **Step 1: Write the failing UI test**

Create `tests/InputOverlay.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { InputOverlay } from "../src/windows/pet/InputOverlay";
import { usePetStore } from "../src/stores/petStore";

// Tauri's invoke is called from handleSend; stub it to avoid loading the bridge.
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue("stub reply"),
}));

describe("InputOverlay drag handle", () => {
  beforeEach(() => {
    usePetStore.getState().setInputVisible(true);
    usePetStore.getState().resetInputPosition();
  });

  it("renders a drag handle when overlay is visible", () => {
    render(<InputOverlay />);
    expect(screen.getByTestId("input-drag-handle")).toBeTruthy();
  });
});
```

Add `import { vi } from "vitest";` at the top alongside the other imports if vitest globals aren't already enabled (the project's `vite.config.ts` sets `globals: true`, so `vi` is available without import — keep both forms safe by importing explicitly).

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/InputOverlay.test.tsx
```

Expected: FAIL — `getByTestId("input-drag-handle")` not found.

- [ ] **Step 3: Add the drag handle markup**

Edit `src/windows/pet/InputOverlay.tsx`. Replace the outermost `<div>` and its children with this structure (keeping all existing logic intact):

```tsx
  return (
    <div
      onMouseDown={(e) => {
        // Clicking padding/whitespace should still focus the input — without this
        // the user has to hit the small <input> rectangle exactly. Stop the click
        // from bubbling to PetApp's drag handler.
        e.stopPropagation();
        if (e.target !== inputRef.current) {
          e.preventDefault();
          inputRef.current?.focus();
        }
      }}
      style={{
        position: "fixed",
        bottom: 80,
        left: "50%",
        transform: "translateX(-50%)",
        background: "rgba(255,255,255,0.97)",
        borderRadius: 16,
        boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
        display: "flex",
        flexDirection: "column",
        zIndex: 9999,
        minWidth: 300,
        cursor: "text",
        overflow: "hidden",
      }}
    >
      <div
        data-testid="input-drag-handle"
        style={{
          height: 6,
          background: "#d0d0d0",
          cursor: "grab",
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
        }}
      />
      <div style={{ display: "flex", gap: 8, padding: "10px 14px" }}>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSend();
            if (e.key === "Escape") setInputVisible(false);
          }}
          placeholder="問我任何問題..."
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            fontSize: 14,
            background: "transparent",
          }}
          disabled={loading}
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          style={{
            background: "#4A90D9",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "4px 12px",
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          {loading ? "…" : "送出"}
        </button>
      </div>
    </div>
  );
```

(Note: removed the original `padding: "10px 14px"` from the outer container and moved it onto the inner row so the handle sits flush against the rounded corner.)

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/InputOverlay.test.tsx
```

Expected: PASS — handle is present in the DOM.

- [ ] **Step 5: Commit**

```bash
git add tests/InputOverlay.test.tsx src/windows/pet/InputOverlay.tsx
git commit -m "feat(InputOverlay): add top drag handle"
```

---

## Task 3: Apply `inputPosition` to overlay style

**Files:**
- Modify: `tests/InputOverlay.test.tsx`
- Modify: `src/windows/pet/InputOverlay.tsx`

- [ ] **Step 1: Write the failing test**

Append to `tests/InputOverlay.test.tsx` inside the same `describe` block:

```tsx
  it("uses default bottom-center style when inputPosition is null", () => {
    render(<InputOverlay />);
    const root = screen.getByTestId("input-drag-handle").parentElement!;
    expect(root.style.bottom).toBe("80px");
    expect(root.style.left).toBe("50%");
    expect(root.style.transform).toContain("translateX(-50%)");
  });

  it("uses absolute coords when inputPosition is set", () => {
    usePetStore.getState().setInputPosition({ x: 200, y: 150 });
    render(<InputOverlay />);
    const root = screen.getByTestId("input-drag-handle").parentElement!;
    expect(root.style.left).toBe("200px");
    expect(root.style.top).toBe("150px");
    // Bottom-center anchoring should be cleared
    expect(root.style.bottom).toBe("");
    expect(root.style.transform === "" || root.style.transform === "none").toBe(true);
  });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/InputOverlay.test.tsx
```

Expected: FAIL — second test fails because the coords aren't honoured.

- [ ] **Step 3: Apply conditional style**

Edit `src/windows/pet/InputOverlay.tsx`. Pull `inputPosition` out of the store at the top of the component (next to the existing destructure):

```tsx
  const { inputVisible, setInputVisible, showBubble, setLoadingBubble, inputPosition } =
    usePetStore();
```

Replace the outermost `<div>` `style` object with a computed style:

```tsx
      style={{
        position: "fixed",
        ...(inputPosition
          ? { left: inputPosition.x, top: inputPosition.y, transform: "none" }
          : { bottom: 80, left: "50%", transform: "translateX(-50%)" }),
        background: "rgba(255,255,255,0.97)",
        borderRadius: 16,
        boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
        display: "flex",
        flexDirection: "column",
        zIndex: 9999,
        minWidth: 300,
        cursor: "text",
        overflow: "hidden",
      }}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/InputOverlay.test.tsx
```

Expected: PASS — all 3 InputOverlay tests now green.

- [ ] **Step 5: Commit**

```bash
git add tests/InputOverlay.test.tsx src/windows/pet/InputOverlay.tsx
git commit -m "feat(InputOverlay): apply custom inputPosition coords"
```

---

## Task 4: Add drag logic with hard clamping

**Files:**
- Modify: `tests/InputOverlay.test.tsx`
- Modify: `src/windows/pet/InputOverlay.tsx`

- [ ] **Step 1: Write the failing test**

Append to `tests/InputOverlay.test.tsx`:

```tsx
import { fireEvent } from "@testing-library/react";

  it("dragging the handle updates inputPosition", () => {
    // Stub viewport size and element rect so clamping is deterministic.
    Object.defineProperty(window, "innerWidth", { value: 1024, writable: true, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 768, writable: true, configurable: true });

    render(<InputOverlay />);
    const handle = screen.getByTestId("input-drag-handle");
    const root = handle.parentElement! as HTMLElement;

    // jsdom returns 0 width/height for getBoundingClientRect by default — stub it.
    root.getBoundingClientRect = () => ({
      x: 0, y: 0, top: 0, left: 0, right: 300, bottom: 100,
      width: 300, height: 100, toJSON: () => {},
    } as DOMRect);

    fireEvent.mouseDown(handle, { clientX: 50, clientY: 10 });
    fireEvent.mouseMove(window, { clientX: 250, clientY: 110 });
    fireEvent.mouseUp(window);

    const pos = usePetStore.getState().inputPosition;
    expect(pos).not.toBeNull();
    expect(pos!.x).toBe(200); // 250 - dragOffset.x (50) = 200
    expect(pos!.y).toBe(100); // 110 - dragOffset.y (10) = 100
  });

  it("clamps inputPosition within viewport bounds", () => {
    Object.defineProperty(window, "innerWidth", { value: 1024, writable: true, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 768, writable: true, configurable: true });

    render(<InputOverlay />);
    const handle = screen.getByTestId("input-drag-handle");
    const root = handle.parentElement! as HTMLElement;
    root.getBoundingClientRect = () => ({
      x: 0, y: 0, top: 0, left: 0, right: 300, bottom: 100,
      width: 300, height: 100, toJSON: () => {},
    } as DOMRect);

    fireEvent.mouseDown(handle, { clientX: 50, clientY: 10 });
    // Try to drag way off-screen (negative + beyond max)
    fireEvent.mouseMove(window, { clientX: -500, clientY: -500 });
    fireEvent.mouseUp(window);
    expect(usePetStore.getState().inputPosition).toEqual({ x: 0, y: 0 });

    fireEvent.mouseDown(handle, { clientX: 50, clientY: 10 });
    fireEvent.mouseMove(window, { clientX: 5000, clientY: 5000 });
    fireEvent.mouseUp(window);
    // Max x = 1024 - 300 = 724; max y = 768 - 100 = 668
    expect(usePetStore.getState().inputPosition).toEqual({ x: 724, y: 668 });
  });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/InputOverlay.test.tsx
```

Expected: FAIL — drag handlers not yet wired.

- [ ] **Step 3: Add drag logic**

Edit `src/windows/pet/InputOverlay.tsx`. Pull `setInputPosition` out of the store:

```tsx
  const { inputVisible, setInputVisible, showBubble, setLoadingBubble, inputPosition, setInputPosition } =
    usePetStore();
```

Add a `rootRef` near the existing `inputRef`:

```tsx
  const rootRef = useRef<HTMLDivElement>(null);
```

Add a `handleDragStart` callback above the `return`:

```tsx
  const handleDragStart = (e: React.MouseEvent) => {
    // Don't start a drag from the input row.
    e.stopPropagation();
    e.preventDefault();
    const root = rootRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const dragOffsetX = e.clientX - rect.left;
    const dragOffsetY = e.clientY - rect.top;
    const w = rect.width;
    const h = rect.height;

    const onMove = (ev: MouseEvent) => {
      const rawX = ev.clientX - dragOffsetX;
      const rawY = ev.clientY - dragOffsetY;
      const x = Math.max(0, Math.min(rawX, window.innerWidth - w));
      const y = Math.max(0, Math.min(rawY, window.innerHeight - h));
      setInputPosition({ x, y });
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };
```

Attach it to the handle div and add the ref to the root div:

```tsx
    <div ref={rootRef} ...existing onMouseDown / style...>
      <div
        data-testid="input-drag-handle"
        onMouseDown={handleDragStart}
        style={{ height: 6, background: "#d0d0d0", cursor: "grab", borderTopLeftRadius: 16, borderTopRightRadius: 16 }}
      />
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/InputOverlay.test.tsx
```

Expected: PASS — all 5 InputOverlay tests green.

- [ ] **Step 5: Commit**

```bash
git add tests/InputOverlay.test.tsx src/windows/pet/InputOverlay.tsx
git commit -m "feat(InputOverlay): drag handle with viewport clamping"
```

---

## Task 5: Listen for `reset-input-position` event in PetApp

**Files:**
- Modify: `src/windows/pet/PetApp.tsx`

- [ ] **Step 1: Read the existing event listeners**

```bash
grep -n "listen\|@tauri-apps/api/event" /Users/chiyi/Desktop/Antigravity/desktop-pet/src/windows/pet/PetApp.tsx | head -10
```

The file already imports from `@tauri-apps/api/event`. Find the existing `useEffect` that registers listeners (look for `listen("config-updated"...)` or `listen("session-updated"...)`).

- [ ] **Step 2: Add the listener**

Inside `PetApp.tsx`, near the existing `listen(...)` calls, add:

```tsx
  useEffect(() => {
    const unlistenPromise = listen("reset-input-position", () => {
      usePetStore.getState().resetInputPosition();
    });
    return () => {
      unlistenPromise.then((fn) => fn());
    };
  }, []);
```

If `usePetStore` isn't imported in this file yet, add `import { usePetStore } from "../../stores/petStore";`.
If `listen` isn't imported, add `import { listen } from "@tauri-apps/api/event";`.

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: PASS — no errors.

- [ ] **Step 4: Commit**

```bash
git add src/windows/pet/PetApp.tsx
git commit -m "feat(PetApp): listen for reset-input-position event"
```

---

## Task 6: Add reset button in Settings → General

**Files:**
- Modify: `src/windows/settings/tabs/General.tsx`
- Modify: `src/locales/zh-TW.json`
- Modify: `src/locales/en.json`

- [ ] **Step 1: Add i18n keys**

In `src/locales/zh-TW.json`, find the `settings` block and add:

```json
    "input_position_label": "對話框位置",
    "input_position_reset": "重置為預設位置",
    "input_position_hint": "對話框拖到自訂位置後，可從這裡重置回底部置中"
```

In `src/locales/en.json` settings block:

```json
    "input_position_label": "Input box position",
    "input_position_reset": "Reset to default",
    "input_position_hint": "After dragging the input box, click here to restore bottom-center placement"
```

- [ ] **Step 2: Add the button**

In `src/windows/settings/tabs/General.tsx`, near the existing hotkey settings, add:

```tsx
import { emit } from "@tauri-apps/api/event";

// ... inside the component's JSX, near other settings rows:
<div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 12 }}>
  <label style={{ fontSize: 14, fontWeight: 500 }}>
    {t("settings.input_position_label")}
  </label>
  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
    <button
      onClick={() => { void emit("reset-input-position"); }}
      style={{
        background: "#4A90D9",
        color: "#fff",
        border: "none",
        borderRadius: 8,
        padding: "6px 14px",
        cursor: "pointer",
        fontSize: 13,
      }}
    >
      {t("settings.input_position_reset")}
    </button>
    <span style={{ fontSize: 12, color: "#777" }}>
      {t("settings.input_position_hint")}
    </span>
  </div>
</div>
```

(Match the existing button / row visual style if it differs — copy from a sibling row in the same file. The label/button structure above is generic.)

- [ ] **Step 3: Type-check & build sanity**

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/windows/settings/tabs/General.tsx src/locales/zh-TW.json src/locales/en.json
git commit -m "feat(settings): add 'reset input position' button"
```

---

## Task 7: Manual smoke test

**Files:** none (smoke test only)

- [ ] **Step 1: Launch dev build**

```bash
npm run tauri dev
```

- [ ] **Step 2: Verify default position**

Press `Alt+Space`. Input box appears at bottom-center.

- [ ] **Step 3: Verify drag**

Grab the grey handle bar at the top of the input box, drag to top-right corner. The box follows the cursor smoothly. Release. Type a message — input still works.

- [ ] **Step 4: Verify clamping**

Drag the input box hard against each screen edge. It should stop at the edge, never spill off-screen.

- [ ] **Step 5: Verify session persistence**

Press Esc to close. Press `Alt+Space` again. Box opens at the dragged position (NOT default).

- [ ] **Step 6: Verify reset button**

Open Settings → General → click "Reset to default". Open input again — back at bottom-center.

- [ ] **Step 7: Verify restart resets**

Quit the app. Reopen. Press `Alt+Space` → bottom-center.

- [ ] **Step 8: Verify click-through still works**

With input closed, mouse over empty desktop area should not capture clicks. Mouse over pet character should still allow drag/double-click.

- [ ] **Step 9: Final commit**

If any inline fix was needed during smoke test, commit it. Otherwise no commit needed.

---

## Self-Review Checklist (run after all tasks done)

- [ ] All 5 InputOverlay tests pass + 3 petStore tests pass: `npx vitest run tests/InputOverlay.test.tsx tests/petStore.test.ts`
- [ ] `npx tsc --noEmit` clean
- [ ] No leftover `console.log` in `InputOverlay.tsx` / `PetApp.tsx`
- [ ] i18n keys present in both locales
- [ ] Spec Part 1 requirements all covered:
  - [x] Hotkey opens input (existing — unchanged)
  - [x] User can drag to any position (Task 4)
  - [x] Position remembered within session (Task 1 + 4)
  - [x] Resets to default on app restart (Task 1 — store not persisted)
  - [x] Settings page reset button (Task 5 + 6)
  - [x] Hard clamp to viewport (Task 4)
  - [x] Default position bottom-center (Task 3)
