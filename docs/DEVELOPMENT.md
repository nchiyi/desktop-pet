# Desktop Pet 開發規範

最後更新：2026-05-08（合併 Plan 1+2 後校準）

這份文件是「Claude / 任何協作者開始改這個專案前必讀的 ground truth」。任何流程或規則想改 → 先改這份文件，再做事。

---

## 1. 版號規則（每次釋出必對齊）

語意化版本：`MAJOR.MINOR.PATCH`

| 改動類型 | 升哪個 | 範例 |
|---|---|---|
| 修 bug / 文字校正 / 內部重構不改行為 | `PATCH` | `0.4.0 → 0.4.1` |
| 新功能 / 使用者可見的行為變化 | `MINOR` | `0.4.0 → 0.5.0` |
| 重大破壞 / API/UX 巨變 | `MAJOR` | `0.4.0 → 1.0.0` |

**Baseline 從哪裡升：**
- 從目前 `main` HEAD 的版本（已 commit）開始升，**不是從 worktree 基底**。
- 動工前先 `git log -1 main -- package.json` 確認 main 真實版本。
- 如果 main 上有 uncommitted WIP 已經升過版號，**先決定那個 WIP 的命運**（合併、stash、或丟）再升新版。

**三檔同步（不能漏）：**
- `package.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

升完跑 `cargo build` 一次，讓 `Cargo.lock` 同步更新。

---

## 2. 分支策略

- 新 feature → 開 `feat/<name>` 分支，從 main 出發
- 修 bug → `fix/<name>` 分支
- Worktree 隔離放 `.worktrees/<name>/`（已 gitignore），跨分支同時開發時用

**合併回 main 前必做：**
1. 確認 main 沒有未合併的 WIP（否則先處理那個 WIP）
2. 把 feature 分支跟 main 校準（rebase 或 merge，看哪個衝突少）
3. 跑完整測試套（Cargo + Vitest）
4. 升版號
5. Commit 整合
6. Build dmg 驗證

合併完成後刪分支：`git branch -d feat/<name>` 和對應 worktree。

---

## 3. Build & 產物路徑

```bash
npm run tauri build
```

預設輸出：
```
src-tauri/target/release/bundle/dmg/Desktop Pet_<version>_aarch64.dmg
src-tauri/target/release/bundle/macos/Desktop Pet.app
```

**dmg 留在原路徑，不要自作主張複製到桌面或其他位置。** 使用者要拿就直接用這個路徑。需要時提示路徑就好。

如果路徑太深 → 提供 `cd` 指令給使用者，不複製檔案。

---

## 4. 測試規範

### 後端 Rust
```bash
cargo test --manifest-path src-tauri/Cargo.toml
```
- 純單元測試（無 Tauri runtime）放 `#[cfg(test)] mod tests` 內
- 用 `tempfile::TempDir` 隔離檔案 I/O
- 可注入時間（`*_at(..., now: DateTime<Local>)`）讓測試 deterministic

### 前端 Vitest
```bash
npx vitest run --exclude '.worktrees/**'
```
- 一律加 `--exclude '.worktrees/**'`，否則會把 worktree 內的測試也抓進來跑（用於主分支）
- 設定在 `vite.config.ts` 的 `test` 區塊
- jsdom + @testing-library/react，setup 在 `tests/setup.ts`

### TypeScript
```bash
npx tsc --noEmit
```

### Smoke test 設計原則
**測試使用者面對的功能流程，不要叫使用者翻 file system 或 Application Support 資料夾。**

例子：
- ❌ 「打開 Finder 看 `~/Library/Application Support/DesktopPet/logs/2026-05-08.txt`」
- ✅ 「按系統匣『歷史紀錄』→ 點『昨天』tab → 看到內容」

如果某功能無法在 app 內驗證（例如啟動清理 4 天前的 log），把它丟進 Rust 單元測試覆蓋，smoke test 就跳過。

---

## 5. Commit 規範

- 用 conventional commits：`feat:` / `fix:` / `chore:` / `docs:` / `test:` / `refactor:`
- 一個 commit 做一件事
- Stage 時用 `git add -u` 加修改 + 明確 `git add <new-file>` 加新檔，不要 `git add -A`（會誤加桌面雜物）
- 升版號用獨立 commit：`chore: bump version to X.Y.Z`
- 整合 / 合併用 commit：`feat: integrate <branch>`

---

## 6. App data 路徑（macOS）

```
~/Library/Application Support/DesktopPet/
├── characters/         # 多角色資料夾，每個 sub-dir 是一個角色
├── sessions/           # 即時對話 session JSON
├── logs/               # daily log 純文字檔（YYYY-MM-DD.txt，最多保留 3 天）
└── config.toml         # app config
```

**不是 `com.chiyi.desktop-pet`** — bundle identifier ≠ AppConfig::app_data_dir() 路徑。看 `src-tauri/src/config.rs` 的 `app_data_dir()` 是真實答案。

---

## 7. 跨視窗通訊

| 情境 | 機制 |
|---|---|
| Settings / Pet / Chat 之間要溝通 | Tauri `emit` / `listen` 跨視窗事件 |
| 持久化狀態 | Rust 端的 AppState（mutex 包好）+ session.json / config.toml |
| 純 UI in-memory 狀態（重啟可丟） | Zustand store（不要加 persist middleware） |

事件名稱集中放在 PetApp.tsx 的 `useEffect listener` block，新增事件時跟既有的放一起。

---

## 8. Plan-and-Build / Subagent 流程下的注意

當用 superpowers 系列工作流時：
1. **Brainstorming → Spec → Plan → Subagent execution**
2. **每個 plan 要先 pre-flight 檢查 main 真實狀態**（已 commit / 有 WIP / 版號）
3. **Plan 寫完先 review 是否與目前 main 一致**，否則 subagent 會以為 plan 是真理結果合併時驚嚇
4. **合併前必確認 WIP 命運**（保留 / stash / 丟），不要假設 main 是乾淨的
5. **Smoke test 列在 plan 內，但實際跑在使用者那端**

---

## 9. 已知技術債（待處理）

- `tests/SpeechBubble.test.tsx`：2 個測試停在單段播放假設，需更新到 multi-segment chunkText 行為（commit 7928eff 引入 multi-segment 但測試未同步）
- daily log 寫入格式包含硬編碼中文 `👤 你 / 🤖 寵物`，未隨 i18n 切換
- 對話視窗 `chat.title` / `chat.placeholder` 等 i18n key 已定義但未使用（`ChatApp.tsx` 直接寫 zh-TW）
- 6px drag handle 在 4K 螢幕上手感偏窄，可考慮加 padding hit zone

---

## 10. 發生「胡亂搞」時的回復

如果一連串改動感覺失控，立即停下，做這幾件事：
1. `git status` 看現況
2. `git log --oneline -10` 看最近 commits
3. `git stash list` 看是否有未 pop 的 stash
4. 找最近的 backup branch（命名慣例 `backup/<reason>-YYYY-MM-DD`）
5. 必要時 `git reset --hard backup/...` 復原（先確認 stash + reflog 都已留底）

每次大規模合併前**先建 backup 分支**：
```bash
git branch backup/pre-<reason>-$(date +%Y-%m-%d)
```
