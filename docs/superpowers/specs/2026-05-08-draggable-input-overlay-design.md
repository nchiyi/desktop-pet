# 對話框互動強化：可拖曳輸入框 + 對話紀錄與日誌

**日期：** 2026-05-08
**狀態：** Spec / 待實作
**範圍：**
- Part 1（可拖曳輸入框）：前端 only（React + Zustand + Tauri event），不動 Rust、不動 config 持久化
- Part 2（對話紀錄與日誌）：前端 + Rust（檔案 I/O、daily log、save dialog）

---

# Part 1：可拖曳對話輸入框（Draggable Input Overlay）

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

---

# Part 2：對話紀錄與日誌（Chat History & Daily Log）

## 目標

1. **設定頁加開啟入口** — 從設定頁可以打開既有的 chat 對話紀錄視窗（目前入口只在系統匣）
2. **自動 daily log** — 每次對話後 append 到 `logs/YYYY-MM-DD.txt`，最近 3 天保留
3. **三天歷史查詢** — chat 視窗加「今天 / 昨天 / 前天」切換鈕，可瀏覽過去兩天紀錄
4. **手動匯出** — chat 視窗可匯出當前檢視內容為 `.txt`

## 非目標

- 不做搜尋框（YAGNI；3 天資料量小）
- 不做「自訂保留天數」設定（明確需求是 3 天）
- 不做 JSON / CSV 匯出（純文字夠用）
- 不在 chat 視窗加拖曳 / 縮放邏輯（原生視窗裝飾已支援，`tauri.conf.json` 的 chat window 已是 `resizable: true`、`decorations: true`）

## 現況確認

`tauri.conf.json` 中 chat window 已具備：
- `resizable: true` → 可自由縮放
- `decorations: true` → 有原生 title bar，可拖動位置
- `width: 380, height: 560` → 預設大小

`tray.rs:68-69` 註解明確指出：使用者透過 tray 開啟 chat / settings 時不會隱藏 pet。**「開啟對話紀錄時角色不會隱藏」這項已是現有行為**，不需新做。

`session.rs` 已有 `Session::save` 寫 JSON 到 `dir/{id}.json`，但 JSON 對人類不友善，且沒有按日切割，所以仍需做 daily log。

## 設計

### 1. 設定頁「開啟對話紀錄」按鈕

`src/windows/settings/tabs/General.tsx` 在 Part 1 的「重置對話框位置」按鈕下方加：

```
對話紀錄          [ 開啟對話紀錄 ]
```

點擊：`invoke('show_chat_window')`（新增的 Rust command；行為等同 tray.rs:93 既有的 `"history" => show_window(app, "chat")`）。

### 2. 自動 daily log

**位置：**
```
<Tauri app_data_dir>/logs/YYYY-MM-DD.txt
```
macOS 實際路徑為 `~/Library/Application Support/com.chiyi.desktop-pet/logs/YYYY-MM-DD.txt`（bundle id 來自 `tauri.conf.json:5`）。與 session JSON 同層。

**寫入時機：**
`session.rs::Session::add_exchange` 完成後，呼叫新增的 `append_daily_log(user_msg, assistant_msg)`：

```rust
fn append_daily_log(dir: &Path, user_msg: &str, assistant_msg: &str) -> Result<()> {
    let now = Local::now();
    let date = now.format("%Y-%m-%d").to_string();
    let timestamp = now.format("%Y-%m-%d %H:%M:%S").to_string();
    let log_dir = dir.join("logs");
    fs::create_dir_all(&log_dir)?;
    let file_path = log_dir.join(format!("{date}.txt"));
    let entry = format!("[{timestamp}]\n👤 你：{user_msg}\n🤖 寵物：{assistant_msg}\n\n");
    let mut file = OpenOptions::new().create(true).append(true).open(file_path)?;
    file.write_all(entry.as_bytes())?;
    Ok(())
}
```

- 檔名用本地日期（`chrono::Local`）
- append 模式
- **失敗只記 stderr 不打斷主流程**（呼叫端 `let _ = ...`）
- 不關心 session reset（log 是純歷史，session reset 只清當前 context）

**自動清理：**
App 啟動時 `setup.rs` 呼叫 `cleanup_old_logs(dir)`：
- 列出 `logs/*.txt`
- 解析檔名日期，刪除 4 天以上（保留今天 + 昨天 + 前天 = 3 天）
- 失敗只記 log

### 3. Chat 視窗加三天切換

`src/windows/chat/ChatApp.tsx` 在 header「對話記錄」下方加 tab bar：

```
[ 今天 ] [ 昨天 ] [ 前天 ]                          [ 匯出 ]
```

State：`const [viewDay, setViewDay] = useState<0 | -1 | -2>(0);`

行為：
- **viewDay === 0（今天，預設）** — 沿用現況：
  - `displayMessages` 來自 `useSessionStore`（即時 session）
  - 輸入框可用、可送訊息
  - 顯示「總結 / 重新開始」按鈕（依 `atTurnLimit`）
  - 「重新開始」只清 session、不動 log

- **viewDay === -1 或 -2（昨天 / 前天）** — 唯讀：
  - 載入時 `invoke<string>('read_daily_log', { day: viewDay })` 取純文字
  - 解析成 Messages（按 `[YYYY-MM-DD HH:MM:SS]\n👤 你：xxx\n🤖 寵物：xxx` 分塊）；解析失敗則顯示為單一 `assistant` 文字塊
  - 輸入框 `disabled`，placeholder 換成「歷史紀錄為唯讀」
  - 隱藏「總結 / 重新開始」與 turn limit 警示
  - 該日無 log → 顯示「該日無對話紀錄」

切換 tab 時取消任何進行中的 `pendingPrompt` 顯示。

### 4. 手動匯出

Chat 視窗 header 右側加「匯出」按鈕。

點擊：

```ts
const content = viewDay === 0
  ? formatMessages(messages)
  : await invoke<string>('read_daily_log', { day: viewDay });
const defaultName = `desktop-pet-chat-${formatDate(viewDay)}.txt`;
await invoke('export_session', { content, defaultName });
```

Rust `export_session(content, default_name)`：
- 用 `tauri-plugin-dialog` 開原生 save dialog（如尚未引入需加進 `Cargo.toml` 與 capabilities）
- 使用者選位置 → 寫檔
- 取消 → no-op

### 5. 新增的 Rust commands

| Command | 簽名 | 行為 |
|---|---|---|
| `show_chat_window` | `() -> Result<()>` | 等同 tray 「歷史紀錄」（顯示 chat window） |
| `read_daily_log` | `(day: i32) -> Result<String>` | day 為 0/-1/-2，計算對應日期，讀 `logs/YYYY-MM-DD.txt`；不存在回空字串（或專屬錯誤讓前端顯示「無紀錄」） |
| `export_session` | `(content: String, default_name: String) -> Result<()>` | 開 save dialog 寫檔 |

### 6. 檔案異動

| 檔案 | 異動 |
|---|---|
| `src-tauri/src/session.rs` | `add_exchange` 寫入 daily log |
| `src-tauri/src/commands.rs` | `show_chat_window`、`read_daily_log`、`export_session` |
| `src-tauri/src/setup.rs` | 啟動時 `cleanup_old_logs` |
| `src-tauri/src/lib.rs` 或 `main.rs` | 註冊三個新 command |
| `src-tauri/Cargo.toml` | 確認 `tauri-plugin-dialog`、`chrono` 已引入 |
| `src-tauri/capabilities/default.json` | 加 `dialog:allow-save` 權限 |
| `src/windows/chat/ChatApp.tsx` | tab bar、匯出按鈕、唯讀模式、daily log 解析 |
| `src/windows/settings/tabs/General.tsx` | 加「開啟對話紀錄」按鈕 |
| `src/locales/*.json` | `chat.tab_today` / `..._yesterday` / `..._day_before`、`chat.export`、`chat.readonly_placeholder`、`chat.no_log_for_day`、`settings.open_chat_history` |

### 7. 互動流程

#### 場景 A：日常對話
1. 使用者透過 pet 對話框或 chat 視窗送訊息
2. Rust `send_message` 處理完 → `add_exchange` → 自動寫 `logs/2026-05-08.txt`
3. session-updated 事件 → 前端更新

#### 場景 B：查昨天
1. 設定頁 → 「開啟對話紀錄」 → chat 視窗開啟
2. 點「昨天」tab → `invoke('read_daily_log', { day: -1 })` → 顯示昨天記錄
3. 輸入框變唯讀
4. 切回「今天」 → 恢復活動 session 與輸入功能

#### 場景 C：匯出
1. 點「前天」→ 看到內容
2. 點「匯出」 → 原生 save dialog → 使用者選 Desktop → 存成 `desktop-pet-chat-2026-05-06.txt`

#### 場景 D：清理
1. 程式啟動（2026-05-08）
2. `cleanup_old_logs` 掃 `logs/`
3. 刪除 `2026-05-04.txt` 及更早；保留 `2026-05-06`、`2026-05-07`、`2026-05-08`

## 測試重點

- [ ] 設定頁按鈕能開啟 chat 視窗
- [ ] 對話後 daily log 正確寫入、格式可讀
- [ ] 失敗（disk full / no permission）不打斷對話流程
- [ ] 「今天」tab 行為與既有完全一致
- [ ] 「昨天」/「前天」唯讀、輸入框 disabled
- [ ] 該日無 log 顯示提示文字
- [ ] 切換 tab 不會 leak 任何 pending state
- [ ] 匯出對話框正常開啟、取消不報錯
- [ ] 啟動時清理舊 log（建檔老檔案測試）
- [ ] 跨日邊界：23:59 寫入 → 00:01 寫入 → 兩個檔
- [ ] 中文 / emoji 編碼正確（UTF-8 append）
- [ ] log 路徑與 `app_data_dir` 一致

## 不做的事 / YAGNI

- 不加日期選擇器（明確只給 3 天）
- 不加搜尋
- 不加分頁載入（單日資料量可控）
- 不加分享 / 雲端上傳
- 不為了「歷史視窗大小」加額外設定（原生記憶機制 / 預設值已足夠）
