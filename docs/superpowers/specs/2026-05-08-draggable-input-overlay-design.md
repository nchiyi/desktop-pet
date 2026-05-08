# 可拖曳對話輸入框（Draggable Input Overlay）

**日期：** 2026-05-08
**狀態：** Spec / 待實作
**範圍：** 前端 only（React + Zustand + Tauri event），不動 Rust，不動 config 持久化層

---

## 目標

讓使用者用熱鍵（既有 `Alt+Space`）開啟對話框後，可以把對話框拖到螢幕上任意位置；位置在 app session 內保留（多次開關熱鍵會回到上次位置），但**重新開啟程式會回到預設位置**。設定頁提供一顆「重置為預設位置」按鈕。

## 非目標

- 不持久化位置到 `config.toml` 或 localStorage
- 不支援多螢幕邊界處理（Pet 視窗本來就只在 primary screen 全螢幕）
- 不改既有熱鍵流程
- 不在 Pet 視窗本體加重置按鈕（只放設定頁）

## 現況

`src/windows/pet/InputOverlay.tsx` 目前是固定樣式：

```ts
position: "fixed",
bottom: 80,
left: "50%",
transform: "translateX(-50%)",
```

嵌在全螢幕透明 Pet 視窗內（3840×2160），由 `petStore.inputVisible` 控制顯示。元件在 `!inputVisible` 時 return null（unmount）。

## 設計

### 1. State：`petStore`

新增欄位：

```ts
inputPosition: { x: number; y: number } | null
setInputPosition: (pos: { x: number; y: number }) => void
resetInputPosition: () => void  // 設回 null
```

語義：
- `null` ⇒ 使用預設位置（底部置中，沿用既有樣式）
- `{x, y}` ⇒ 已被拖曳，使用絕對座標 `position: fixed; left: x; top: y`

Zustand store 預設值為 `null`，且**不**經過 persist middleware，所以程式關閉即重置。

### 2. UI：`InputOverlay`

加上頂部把手 bar：

```
┌───────────────────────────────────┐
│ ░░░░░░░░░ 把手 bar (6px) ░░░░░░░░ │  cursor: grab / grabbing
├───────────────────────────────────┤
│  [input...................] [送出] │
└───────────────────────────────────┘
```

- 把手 bar：高 6px、淺灰背景（例如 `#d0d0d0`）、整條可按
- `cursor: grab`，拖曳中切 `cursor: grabbing`
- `mousedown` 事件 `stopPropagation`（避免冒泡到 PetApp 的拖曳邏輯）

### 3. 拖曳邏輯

把手 bar 的 `mousedown` 觸發拖曳：

1. 記下 `dragOffset = { x: e.clientX - boxLeft, y: e.clientY - boxTop }`
2. 在 `window` 上掛 `mousemove` 與 `mouseup` listener（不掛在元件內，避免快速拖曳脫離元件）
3. `mousemove`：計算新位置 `(e.clientX - dragOffset.x, e.clientY - dragOffset.y)`
4. **硬 clamp** 到視窗邊界：

   ```ts
   x = Math.max(0, Math.min(x, window.innerWidth - boxWidth))
   y = Math.max(0, Math.min(y, window.innerHeight - boxHeight))
   ```

   `boxWidth` / `boxHeight` 透過 ref 量測元件實際大小。

5. 即時 `setInputPosition({x, y})`
6. `mouseup`：移除 listener、切回 `cursor: grab`

當 `inputPosition === null` 時，沿用既有預設樣式；非 null 時改用 `{ position: "fixed", left: x, top: y, transform: "none" }`。

### 4. 設定頁重置按鈕

`src/windows/settings/tabs/General.tsx` 在熱鍵設定附近加一列：

```
對話框位置        [ 重置為預設位置 ]
```

點擊後：

```ts
import { emit } from "@tauri-apps/api/event";
emit("reset-input-position");
```

PetApp 內監聽：

```ts
useEffect(() => {
  const unlisten = listen("reset-input-position", () => {
    resetInputPosition();
  });
  return () => { unlisten.then(fn => fn()); };
}, []);
```

按鈕一直可點，無需確認對話框，無狀態顯示。

### 5. 點擊穿透相容性

確認過 `src-tauri/src/setup.rs:348-356`：當 `input_visible == true` 時，cursor tracker 會直接 `set_ignore_cursor_events(false)` 關閉整個視窗的點擊穿透（不是用矩形判斷）。因此對話框拖到螢幕任何位置都能正常互動，**不需要動 Rust 端**。

副作用：對話框可見期間整個 3840×2160 視窗都接受點擊（透明背景區也不穿透）— 這是既有行為，與本需求無關。

## 互動流程

### 場景 A：第一次使用
1. 使用者按 `Alt+Space` → 對話框出現在底部置中（預設）
2. 拖把手把它拖到螢幕右上角 → `inputPosition = {x: 1500, y: 50}`
3. 按 Esc 關閉
4. 再按 `Alt+Space` → 對話框出現在右上角（記住的位置）

### 場景 B：重啟程式
1. 接續場景 A，quit app
2. 重新開啟程式
3. 按 `Alt+Space` → 對話框回到底部置中（`inputPosition` 又是 `null`）

### 場景 C：手動重置
1. 對話框已被拖到右上
2. 開啟設定 → General → 點「重置對話框位置」
3. 設定視窗 emit `reset-input-position`
4. PetApp 收到 → `resetInputPosition()` → `inputPosition = null`
5. 下次按 `Alt+Space` → 對話框回到底部置中

### 場景 D：邊界
1. 拖曳時嘗試把對話框甩到螢幕外
2. clamp 即時生效，對話框最遠只能停在邊界（每個邊都至少貼齊）

## 檔案異動

| 檔案 | 異動 |
|---|---|
| `src/stores/petStore.ts` | 新增 `inputPosition` 欄位 + `setInputPosition` + `resetInputPosition` |
| `src/windows/pet/InputOverlay.tsx` | 加把手 bar + 拖曳邏輯；條件套用座標樣式 |
| `src/windows/pet/PetApp.tsx` | 監聽 `reset-input-position` 事件 → 呼叫 `resetInputPosition()` |
| `src/windows/settings/tabs/General.tsx` | 加「重置對話框位置」按鈕，點擊 emit 事件 |
| `src/locales/zh-TW.json` / `en.json` | 加 `settings.reset_input_position` / `settings.reset_input_position_button` 翻譯 |

不動：`src-tauri/**`、`config.toml`、既有熱鍵邏輯。

## 測試重點

- [ ] 拖曳順暢（無延遲、無跳動）
- [ ] 邊界 clamp 正確（每個方向都試）
- [ ] 拖曳中按 Esc 關閉對話框 → 不會留下 dangling listener
- [ ] 拖曳中按 Enter 送訊息 → 對話框正常送出並關閉
- [ ] 多次開關熱鍵 → 位置保留
- [ ] quit + 重啟 → 位置回預設
- [ ] 設定頁重置按鈕 → Pet 視窗下次開啟回預設
- [ ] 點擊穿透在新位置仍正常（拖到角落後對話框仍可互動）

## 不做的事 / YAGNI

- 不加「目前是預設 / 已自訂」狀態文字（資訊冗余）
- 不加重置確認對話框（操作不破壞性）
- 不加多螢幕處理
- 不寫進 config 持久化（明確違反需求）
- 不加 Rust 端事件中繼（Tauri event 已能跨 webview）
