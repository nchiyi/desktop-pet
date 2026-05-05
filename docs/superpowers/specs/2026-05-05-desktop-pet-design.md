# Desktop Pet App — Design Spec
**Date:** 2026-05-05
**Project:** desktop-pet
**Status:** Approved

---

## Overview

一個跨平台（Windows / macOS）桌面寵物 app，讓角色在桌面上遊走、透過快速鍵與使用者互動，並串接本機已安裝的 CLI AI 工具（Claude Code / Gemini CLI / Codex）。

目標使用者：一般大眾，包含公司電腦使用者（有安裝權限限制）。
設計原則：免安裝、單一可攜式執行檔、零 API Key、開箱即用。

---

## 技術棧

| 層 | 技術 |
|---|---|
| 框架 | Tauri v2（Rust 後端 + WebView 前端） |
| 前端 | React + TypeScript |
| 後端 | Rust |
| 打包 | Tauri bundler（生成 .exe / .dmg / .app） |
| 設定格式 | TOML |

**選用理由：**
- 執行檔約 5~15MB，免安裝，適合公司限制環境
- Rust 子程序管理穩定，無 GC pause
- 前端 React/TypeScript 易於擴充 UI 功能
- Adapter trait 架構讓新增 CLI 只需加一個檔案

---

## 整體架構

```
┌─────────────────────────────────────────────────────┐
│                   Desktop Pet App                    │
│                                                      │
│  ┌─────────────────┐      ┌──────────────────────┐  │
│  │   Pet Window    │      │   Chat Panel Window  │  │
│  │  (透明懸浮視窗)  │      │   (點擊角色時展開)    │  │
│  │                 │      │                      │  │
│  │  [角色動畫]     │      │  [完整對話記錄]       │  │
│  │  [氣泡對話框]   │      │  [輸入框]            │  │
│  └────────┬────────┘      └──────────────────────┘  │
│           │                                          │
│  ┌────────▼────────────────────────────────────┐    │
│  │              Tauri Core (Rust)               │    │
│  │                                              │    │
│  │  ┌──────────┐  ┌──────────┐  ┌───────────┐  │    │
│  │  │Hotkey Mgr│  │ Session  │  │CLI Adapter│  │    │
│  │  │(快速鍵)  │  │ Manager  │  │ Manager   │  │    │
│  │  └──────────┘  └──────────┘  └─────┬─────┘  │    │
│  └──────────────────────────────────────────────┘   │
│                                        │             │
│              ┌─────────────────────────┘             │
│         ┌────┴────┐  ┌────────┐  ┌────────┐        │
│         │ Claude  │  │ Gemini │  │ Codex  │        │
│         │Adapter  │  │Adapter │  │Adapter │        │
│         └────┬────┘  └───┬────┘  └───┬────┘        │
└──────────────┼───────────┼───────────┼──────────────┘
               │           │           │
        [claude CLI]  [gemini CLI]  [codex CLI]
         (本機已安裝並登入)
```

---

## UI 互動流程

### 正常狀態
- 角色在桌面遊走（依移動模式設定）
- 每 30~120 秒隨機觸發偶發動畫
- 偶爾頭頂出現閒聊氣泡（可關閉）

### 快速鍵呼出流程
```
使用者按快速鍵（預設 Alt+Space）
  → 懸浮輸入框出現（畫面中央偏下）
  → 輸入問題 → Enter / 點送出
  → 輸入框消失，角色顯示 think 動畫
  → ACP 送入 CLI subprocess
  → 收到回覆
    ├── 回覆 ≤ 100 字 → 氣泡顯示，8 秒後淡出
    └── 回覆 > 100 字 → 氣泡顯示「回覆較長，點我查看 →」
          → 使用者點擊角色 → Chat Panel 展開
```

### Chat Panel
- 獨立視窗，顯示本次 session 全部對話記錄
- 達到 30 輪（user + AI = 1 輪）時，角色觸發 dance 動畫，氣泡提醒：
  「我們聊了很多了！要幫你總結這段對話嗎？」
  - [總結] → 送入總結 prompt，顯示摘要
  - [繼續聊] → 繼續目前 session
  - [重新開始] → 清空 session，重置計數

---

## 角色移動模式

使用者可在設定中選擇：

| 模式 | 說明 |
|---|---|
| 全畫面隨機遊走 | 隨機目標點，靠近邊緣自動轉向 |
| 固定區域 | 限制在上 / 下 / 左 / 右 某一邊緣帶狀區域移動 |
| 定點模式 | 固定在上次拖曳的位置，播放各種動畫（不只 idle）|

**拖曳規則（三種模式通用）：**
- 任何時候可用滑鼠拖曳角色到新位置
- 拖曳時觸發 `drag` 動畫，放下後觸發 `surprised` → 回到 `idle`
- 模式 A/B 從新位置繼續遊走；模式 C 固定在新位置

**多螢幕 & 解析度：**

| 情境 | 處理 |
|---|---|
| 單螢幕 | 以主螢幕實際解析度為邊界 |
| 多螢幕 | 設定：限制主螢幕 / 允許跨螢幕（預設限制主螢幕）|
| HiDPI / Retina | Tauri scale factor 自動處理，以邏輯像素計算 |
| 解析度變更 / 插拔螢幕 | 監聽系統事件，角色超出邊界時自動移回可見區域 |

---

## 角色動畫狀態機

### 動畫觸發對照表

| 情境 | 觸發動畫 |
|---|---|
| 一般移動 | `walk` / `run` |
| 無操作，隨機（30~120s）| `sit` / `dance` / `sway` / `stretch` / `sleep` / ... |
| 送出問題 | `think`（持續直到回覆）|
| 收到 AI 回覆 | `happy` / `talk` |
| 等待超過 15 秒 | `sad` / `impatient` |
| 滑鼠按下角色 | `drag` |
| 放下角色 | `surprised` → `idle` |
| 達到 30 輪 | `dance` |
| 深夜時段（可選）| `sleep` |

### Fallback 機制
缺少動畫時依序 fallback：
- 指定動畫 → 相近動畫 → `idle` → `thumbnail.png` + 搖擺動效

---

## 角色系統 & 自訂圖片

### 資料夾結構
```
characters/
├── default/
│   ├── character.toml
│   ├── idle.gif          ← 必填
│   ├── walk.gif          ← 建議
│   ├── think.gif         ← 建議
│   ├── happy.gif         ← 建議
│   ├── thumbnail.png     ← 設定頁預覽
│   └── ...其他動畫
└── <使用者自訂>/
    └── ...
```

### character.toml
```toml
name = "角色名稱"
author = "作者"
version = "1.0"
size = 80          # 顯示大小（邏輯像素）

[animation]
idle_duration = 3.0
think_duration = 0   # 0 = 持續播放
```

### 支援格式
| 格式 | 說明 |
|---|---|
| `.gif` | 自動播放動畫幀 |
| `.webp` | 動畫 WebP |
| `.png` | 靜態圖，程式加搖擺/縮放動效 |
| Sprite Sheet | `<name>_sprite.png` + `<name>_sprite.toml` |

### 角色安裝方式（三種）
1. **資料夾方式**：設定 → 開啟角色資料夾 → 放入角色資料夾 → 重新整理
2. **ZIP 拖曳**：將角色資料夾壓成 .zip → 拖曳到 app 視窗 → 自動解壓安裝
3. **未來擴充**：角色商店 / URL 下載（架構預留入口，本版不實作）

---

## 設定系統

### 系統匣右鍵選單
```
🐱 Desktop Pet
─────────────────
▶ 顯示 / 隱藏角色
─────────────────
🎭 角色管理
   ├── 選擇角色
   ├── 開啟角色資料夾
   ├── 安裝角色 (.zip)
   └── 角色製作說明
─────────────────
⚙️ 設定
   ├── 一般設定
   ├── 移動模式
   ├── 動畫設定
   └── CLI 設定
─────────────────
💬 對話記錄
─────────────────
❓ 關於
🚪 退出
```

### 設定項目

**一般設定**
- 快速鍵設定（預設 `Alt+Space`）
- 開機自動啟動
- 閒置氣泡對話開關
- 深夜睡眠模式開關（時間範圍可設定）

**移動模式**
- 全畫面隨機遊走 / 固定區域（上下左右）/ 定點模式
- 多螢幕：限制主螢幕 / 允許跨螢幕

**動畫設定**
- 角色大小（px）
- 移動速度
- 偶發動畫頻率
- 氣泡顯示時間

**CLI 設定**
- 使用的 CLI（Claude / Gemini / Codex）
- CLI 執行路徑（自動偵測 / 手動指定）
- 連線測試
- 預設回覆語言

### 角色製作說明視窗
內建說明視窗，包含：
- 資料夾結構範例
- 建議規格（128×128px，12fps，透明背景）
- 動畫名稱對照表（idle / walk / run / sit / dance / sway / stretch / sleep / think / talk / happy / sad / drag / surprised）
- Sprite Sheet 設定說明
- [下載範例角色資料夾] 按鈕
- [開啟角色資料夾] 按鈕

---

## CLI Adapter 架構

### Rust Trait
```rust
trait CliAdapter {
    fn name(&self) -> &str;
    fn detect() -> Option<PathBuf>;   // 自動偵測是否安裝
    fn spawn(&self) -> Result<Child>; // 啟動 subprocess
    fn send(&mut self, prompt: &str) -> Result<()>;
    fn recv(&mut self) -> Result<String>; // streaming 讀取
    fn reset(&mut self);              // 重置 session
}
```

### 自動偵測路徑
| CLI | 偵測位置 |
|---|---|
| Claude Code | `which claude` / `%APPDATA%\npm\claude.cmd` |
| Gemini CLI | `which gemini` / `%APPDATA%\npm\gemini.cmd` |
| Codex | `which codex` / `%APPDATA%\npm\codex.cmd` |

### 連線測試流程
```
點「測試連線」
  → spawn CLI subprocess
  → 送入：「請回覆 OK」
  → 成功 → ✅ 連線成功（顯示 CLI 名稱）
  → 逾時 10 秒 → ❌ 找不到 CLI，請確認已安裝並登入
```

---

## Session 管理

- 每次 app 啟動為一個新 session
- 使用者手動「重新開始」也會建立新 session
- 每個 session 保留完整對話記錄（local JSON，存在 app data 目錄）
- 30 輪（user + AI = 1 輪）觸發提醒
- 對話記錄可從系統匣「對話記錄」瀏覽歷史 sessions

---

## 未來擴充預留（本版不實作）

- 角色商店 / URL 下載
- MAT 多 agent 協作模式
- MCP 串接
- 閒置語句自訂庫
- 多角色同時顯示
