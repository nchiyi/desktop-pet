# Chat History & Daily Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist a human-readable per-day chat log (`logs/YYYY-MM-DD.txt`), keep only the last 3 days; let the user browse Today / Yesterday / Day-Before-Yesterday in the chat window (past days read-only); export the currently-viewed day to a `.txt` file via native save dialog; and add a "Open chat history" entry in Settings → General.

**Architecture:** New Rust module `daily_log.rs` owns file-append, per-day read, and cleanup. `send_message` calls `daily_log::append_entry(...)` after `Session::add_exchange` succeeds. New Tauri commands `read_daily_log(day)` and `export_session(content, default_name)` (uses `tauri-plugin-dialog`). On startup, `setup.rs` calls `daily_log::cleanup_old_logs(...)`. Frontend: `ChatApp` adds a tab bar (`今天/昨天/前天`) with `viewDay: 0|-1|-2` state — `0` shows the live `useSessionStore`, `-1`/`-2` invoke `read_daily_log` and render the file content read-only; `Settings → General` gets an "Open chat history" button calling the existing `show_chat_window` command.

**Tech Stack:** Rust + Tauri v2, `chrono` (new), `tauri-plugin-dialog` (new), `tempfile` (existing dev dep), React 19, Vitest, i18next.

**Spec:** `docs/superpowers/specs/2026-05-08-draggable-input-overlay-design.md` (Part 2)

**Existing facts you must not duplicate:**
- `commands.rs:351 show_chat_window` already exists — Settings just `invoke`s it.
- `tray.rs:68-69` comment confirms opening chat does NOT hide the pet — already correct behaviour.
- `tauri.conf.json` chat window is already `resizable: true, decorations: true` — drag/resize already work natively.
- `commands.rs:218` `state.session.lock().unwrap().add_exchange(prompt, response.clone())` is where the daily log hook goes (right after this line).
- `AppConfig::app_data_dir()` is the canonical data root; sessions are stored at `app_data_dir()/sessions/`. Logs go at `app_data_dir()/logs/`.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src-tauri/Cargo.toml` | Modify | Add `chrono = "0.4"` and `tauri-plugin-dialog = "2"` |
| `src-tauri/capabilities/default.json` | Modify | Add `dialog:allow-save` permission |
| `src-tauri/src/daily_log.rs` | Create | `append_entry`, `read_for_day`, `cleanup_old_logs` |
| `src-tauri/src/lib.rs` | Modify | `pub mod daily_log;` |
| `src-tauri/src/commands.rs` | Modify | Call `daily_log::append_entry`; add `read_daily_log` + `export_session` commands |
| `src-tauri/src/setup.rs` | Modify | Call `daily_log::cleanup_old_logs` in `init_app_data` |
| `src-tauri/src/main.rs` | Modify | Register `tauri-plugin-dialog` plugin and the two new commands |
| `src/windows/chat/ChatApp.tsx` | Modify | Tab bar, read-only mode, export button |
| `src/windows/settings/tabs/General.tsx` | Modify | "Open chat history" button |
| `src/locales/zh-TW.json` | Modify | i18n strings |
| `src/locales/en.json` | Modify | i18n strings |

---

## Conventions

- Run Rust tests: `cargo test --manifest-path src-tauri/Cargo.toml <name>`. Filtering by name is `cargo test --manifest-path src-tauri/Cargo.toml -- daily_log::tests::<name>`.
- Run frontend tests: `npx vitest run <path>`.
- Type-check frontend: `npx tsc --noEmit`.
- All Rust I/O uses `anyhow::Result` + the project's existing pattern (`std::fs`, no `tokio::fs`).

---

## Task 1: Add Cargo deps and register dialog plugin

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Add deps**

Edit `src-tauri/Cargo.toml`. In `[dependencies]`, append:

```toml
chrono = { version = "0.4", default-features = false, features = ["clock"] }
tauri-plugin-dialog = "2"
```

- [ ] **Step 2: Register the dialog plugin**

Edit `src-tauri/src/main.rs`. Find the existing `.plugin(tauri_plugin_global_shortcut...)` line and add a new `.plugin(...)` line:

```rust
        .plugin(tauri_plugin_dialog::init())
```

Place it next to the other `.plugin(...)` calls (order doesn't matter functionally).

- [ ] **Step 3: Build to confirm deps resolve**

```bash
cargo build --manifest-path src-tauri/Cargo.toml
```

Expected: builds clean. Resolution may take ~30 s for first compile.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/main.rs
git commit -m "chore(deps): add chrono and tauri-plugin-dialog"
```

---

## Task 2: Create `daily_log` module — `append_entry`

**Files:**
- Create: `src-tauri/src/daily_log.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Register the module**

Edit `src-tauri/src/lib.rs`. Add next to the other `pub mod ...;` lines:

```rust
pub mod daily_log;
```

- [ ] **Step 2: Write the failing test**

Create `src-tauri/src/daily_log.rs`:

```rust
use anyhow::Result;
use chrono::{DateTime, Local, NaiveDate};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

/// Append a single chat exchange to today's log file under `<dir>/YYYY-MM-DD.txt`.
/// Format is human-readable plain text. Failures are returned to the caller, who
/// must decide whether to surface them — the chat send path uses `let _ = ...`.
pub fn append_entry(dir: &Path, user_msg: &str, assistant_msg: &str) -> Result<()> {
    append_entry_at(dir, user_msg, assistant_msg, Local::now())
}

fn append_entry_at(
    dir: &Path,
    user_msg: &str,
    assistant_msg: &str,
    now: DateTime<Local>,
) -> Result<()> {
    fs::create_dir_all(dir)?;
    let date = now.format("%Y-%m-%d").to_string();
    let timestamp = now.format("%Y-%m-%d %H:%M:%S").to_string();
    let path = dir.join(format!("{date}.txt"));
    let entry = format!(
        "[{timestamp}]\n👤 你：{user_msg}\n🤖 寵物：{assistant_msg}\n\n"
    );
    let mut file = OpenOptions::new().create(true).append(true).open(path)?;
    file.write_all(entry.as_bytes())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;
    use tempfile::TempDir;

    #[test]
    fn append_entry_creates_file_with_expected_content() {
        let tmp = TempDir::new().unwrap();
        let when = Local.with_ymd_and_hms(2026, 5, 8, 14, 32, 10).unwrap();
        append_entry_at(tmp.path(), "今天天氣怎樣？", "天氣很好喔！", when).unwrap();
        let content = fs::read_to_string(tmp.path().join("2026-05-08.txt")).unwrap();
        assert!(content.contains("[2026-05-08 14:32:10]"));
        assert!(content.contains("👤 你：今天天氣怎樣？"));
        assert!(content.contains("🤖 寵物：天氣很好喔！"));
    }

    #[test]
    fn append_entry_appends_when_called_twice_same_day() {
        let tmp = TempDir::new().unwrap();
        let when = Local.with_ymd_and_hms(2026, 5, 8, 14, 32, 10).unwrap();
        append_entry_at(tmp.path(), "first q", "first a", when).unwrap();
        append_entry_at(tmp.path(), "second q", "second a", when).unwrap();
        let content = fs::read_to_string(tmp.path().join("2026-05-08.txt")).unwrap();
        assert!(content.contains("first q") && content.contains("second q"));
        assert!(content.matches("[2026-05-08 14:32:10]").count() == 2);
    }

    #[test]
    fn append_entry_creates_directory_if_missing() {
        let tmp = TempDir::new().unwrap();
        let nested = tmp.path().join("does/not/exist/yet");
        let when = Local.with_ymd_and_hms(2026, 5, 8, 0, 0, 0).unwrap();
        append_entry_at(&nested, "q", "a", when).unwrap();
        assert!(nested.join("2026-05-08.txt").exists());
    }
}
```

- [ ] **Step 3: Run tests to verify they pass**

```bash
cargo test --manifest-path src-tauri/Cargo.toml daily_log
```

Expected: 3/3 PASS for `daily_log::tests::*`. If `chrono` features fail to resolve, double-check Task 1.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/daily_log.rs src-tauri/src/lib.rs
git commit -m "feat(daily_log): append_entry writes per-day chat log"
```

---

## Task 3: `daily_log::read_for_day`

**Files:**
- Modify: `src-tauri/src/daily_log.rs`

- [ ] **Step 1: Write failing tests**

Append to `src-tauri/src/daily_log.rs` (in the `tests` module):

```rust
    #[test]
    fn read_for_day_returns_file_contents() {
        let tmp = TempDir::new().unwrap();
        let when = Local.with_ymd_and_hms(2026, 5, 8, 12, 0, 0).unwrap();
        append_entry_at(tmp.path(), "q", "a", when).unwrap();
        let target = NaiveDate::from_ymd_opt(2026, 5, 8).unwrap();
        let got = read_for_day_at(tmp.path(), target).unwrap();
        assert!(got.contains("q") && got.contains("a"));
    }

    #[test]
    fn read_for_day_returns_empty_when_missing() {
        let tmp = TempDir::new().unwrap();
        let target = NaiveDate::from_ymd_opt(2026, 5, 1).unwrap();
        let got = read_for_day_at(tmp.path(), target).unwrap();
        assert_eq!(got, "");
    }

    #[test]
    fn day_offset_resolves_relative_to_today() {
        let today = Local::now().date_naive();
        assert_eq!(date_for_offset_at(today, 0), today);
        assert_eq!(
            date_for_offset_at(today, -1),
            today.pred_opt().unwrap()
        );
    }
```

Then add to the public API section above `#[cfg(test)]`:

```rust
/// Read the log file for the given local date. Returns "" if the file doesn't
/// exist (treated as "no records on that day"). Other I/O errors propagate.
pub fn read_for_day(dir: &Path, day_offset: i32) -> Result<String> {
    let date = date_for_offset_at(Local::now().date_naive(), day_offset);
    read_for_day_at(dir, date)
}

fn read_for_day_at(dir: &Path, date: NaiveDate) -> Result<String> {
    let path = dir.join(format!("{}.txt", date.format("%Y-%m-%d")));
    match fs::read_to_string(&path) {
        Ok(s) => Ok(s),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(e.into()),
    }
}

fn date_for_offset_at(today: NaiveDate, offset: i32) -> NaiveDate {
    if offset == 0 {
        today
    } else if offset > 0 {
        today + chrono::Duration::days(offset as i64)
    } else {
        today - chrono::Duration::days((-offset) as i64)
    }
}
```

- [ ] **Step 2: Run tests**

```bash
cargo test --manifest-path src-tauri/Cargo.toml daily_log
```

Expected: 6/6 PASS.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/daily_log.rs
git commit -m "feat(daily_log): read_for_day with offset-based lookup"
```

---

## Task 4: `daily_log::cleanup_old_logs`

**Files:**
- Modify: `src-tauri/src/daily_log.rs`

- [ ] **Step 1: Write failing tests**

Append to the `tests` module in `daily_log.rs`:

```rust
    #[test]
    fn cleanup_keeps_last_three_days() {
        let tmp = TempDir::new().unwrap();
        let today = NaiveDate::from_ymd_opt(2026, 5, 8).unwrap();

        // Create files for D-0, D-1, D-2, D-3, D-4, D-10
        for offset in [0, -1, -2, -3, -4, -10] {
            let d = if offset == 0 {
                today
            } else {
                today - chrono::Duration::days((-offset) as i64)
            };
            let path = tmp.path().join(format!("{}.txt", d.format("%Y-%m-%d")));
            std::fs::write(&path, "noise").unwrap();
        }

        cleanup_old_logs_at(tmp.path(), today, 3).unwrap();

        // Survivors: today, today-1, today-2
        for offset in [0, -1, -2] {
            let d = if offset == 0 {
                today
            } else {
                today - chrono::Duration::days((-offset) as i64)
            };
            assert!(
                tmp.path().join(format!("{}.txt", d.format("%Y-%m-%d"))).exists(),
                "expected D{} to survive",
                offset
            );
        }
        // Casualties: D-3, D-4, D-10
        for offset in [-3, -4, -10] {
            let d = today - chrono::Duration::days((-offset) as i64);
            assert!(
                !tmp.path().join(format!("{}.txt", d.format("%Y-%m-%d"))).exists(),
                "expected D{} to be deleted",
                offset
            );
        }
    }

    #[test]
    fn cleanup_ignores_non_log_files_and_bad_names() {
        let tmp = TempDir::new().unwrap();
        let today = NaiveDate::from_ymd_opt(2026, 5, 8).unwrap();
        std::fs::write(tmp.path().join("not-a-log.txt"), "x").unwrap();
        std::fs::write(tmp.path().join("README.md"), "x").unwrap();
        std::fs::write(tmp.path().join("garbage-2026-XX-YY.txt"), "x").unwrap();
        cleanup_old_logs_at(tmp.path(), today, 3).unwrap();
        assert!(tmp.path().join("not-a-log.txt").exists());
        assert!(tmp.path().join("README.md").exists());
        assert!(tmp.path().join("garbage-2026-XX-YY.txt").exists());
    }

    #[test]
    fn cleanup_handles_missing_dir_silently() {
        let tmp = TempDir::new().unwrap();
        let missing = tmp.path().join("nope");
        let today = NaiveDate::from_ymd_opt(2026, 5, 8).unwrap();
        cleanup_old_logs_at(&missing, today, 3).unwrap();
    }
```

Add to the public API section:

```rust
/// Delete log files older than `keep_days` (counting today). `keep_days = 3`
/// preserves today + yesterday + day-before-yesterday.
pub fn cleanup_old_logs(dir: &Path, keep_days: i64) -> Result<()> {
    cleanup_old_logs_at(dir, Local::now().date_naive(), keep_days)
}

fn cleanup_old_logs_at(dir: &Path, today: NaiveDate, keep_days: i64) -> Result<()> {
    let cutoff = today - chrono::Duration::days(keep_days - 1);
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(e.into()),
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("txt") {
            continue;
        }
        let stem = match path.file_stem().and_then(|s| s.to_str()) {
            Some(s) => s,
            None => continue,
        };
        let date = match NaiveDate::parse_from_str(stem, "%Y-%m-%d") {
            Ok(d) => d,
            Err(_) => continue,
        };
        if date < cutoff {
            let _ = fs::remove_file(&path);
        }
    }
    Ok(())
}
```

- [ ] **Step 2: Run tests**

```bash
cargo test --manifest-path src-tauri/Cargo.toml daily_log
```

Expected: 9/9 PASS.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/daily_log.rs
git commit -m "feat(daily_log): cleanup_old_logs keeps last N days"
```

---

## Task 5: Hook `daily_log::append_entry` into `send_message`

**Files:**
- Modify: `src-tauri/src/commands.rs`

- [ ] **Step 1: Locate the call site**

Open `src-tauri/src/commands.rs`. Find line 218:

```rust
state.session.lock().unwrap().add_exchange(prompt, response.clone());
```

This is the only place where exchanges are persisted in-memory. Note the variable shadowing: `prompt` is consumed here. The `let response = ...` above provides the assistant text.

- [ ] **Step 2: Add the daily-log call below it**

Replace lines 218–221 (the `add_exchange` line plus the `sessions_dir` save block) with:

```rust
    // Capture the user prompt before add_exchange takes ownership of it.
    let user_prompt_for_log = prompt.clone();
    state.session.lock().unwrap().add_exchange(prompt, response.clone());
    let sessions_dir = AppConfig::app_data_dir().join("sessions");
    let _ = state.session.lock().unwrap().save(&sessions_dir);

    // Append to the human-readable per-day log. Failures are non-fatal:
    // the active conversation already lives in `Session`, so a failed log
    // write should never abort the response that's about to be returned.
    let logs_dir = AppConfig::app_data_dir().join("logs");
    if let Err(e) = crate::daily_log::append_entry(&logs_dir, &user_prompt_for_log, &response) {
        eprintln!("daily_log append failed: {e}");
    }
```

(Reference the actual existing block; the only changes are: `let user_prompt_for_log = prompt.clone();` before `add_exchange`, and the new logs append after `save`.)

- [ ] **Step 3: Build**

```bash
cargo build --manifest-path src-tauri/Cargo.toml
```

Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands.rs
git commit -m "feat(commands): write daily log on every send_message"
```

---

## Task 6: Add `read_daily_log` and `export_session` Tauri commands

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/main.rs`
- Modify: `src-tauri/capabilities/default.json`

- [ ] **Step 1: Add the commands**

Append to `src-tauri/src/commands.rs` (near `show_chat_window`):

```rust
#[tauri::command]
pub fn read_daily_log(day: i32) -> Result<String, String> {
    let logs_dir = AppConfig::app_data_dir().join("logs");
    crate::daily_log::read_for_day(&logs_dir, day).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_session(
    app: tauri::AppHandle,
    content: String,
    default_name: String,
) -> Result<(), String> {
    use tauri_plugin_dialog::DialogExt;
    let path = app
        .dialog()
        .file()
        .set_file_name(&default_name)
        .add_filter("Text", &["txt"])
        .blocking_save_file();
    let Some(path) = path else { return Ok(()); };
    let path = path.into_path().map_err(|e| e.to_string())?;
    std::fs::write(path, content).map_err(|e| e.to_string())
}
```

- [ ] **Step 2: Register commands in main.rs**

Edit `src-tauri/src/main.rs`. In the `tauri::generate_handler![...]` macro (currently ends around line 74), add two more entries:

```rust
            tauri_app_lib::commands::read_daily_log,
            tauri_app_lib::commands::export_session,
```

- [ ] **Step 3: Add capability**

Edit `src-tauri/capabilities/default.json`. Add `"dialog:allow-save"` to the `permissions` array:

```json
  "permissions": [
    "core:default",
    "global-shortcut:allow-register",
    "global-shortcut:allow-unregister-all",
    "core:window:allow-set-ignore-cursor-events",
    "core:window:allow-set-focus",
    "core:window:allow-set-always-on-top",
    "core:window:allow-show",
    "core:window:allow-hide",
    "dialog:allow-save"
  ]
```

- [ ] **Step 4: Build to confirm registration**

```bash
cargo build --manifest-path src-tauri/Cargo.toml
```

Expected: clean build.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/main.rs src-tauri/capabilities/default.json
git commit -m "feat(commands): add read_daily_log and export_session"
```

---

## Task 7: Wire startup cleanup in `setup.rs`

**Files:**
- Modify: `src-tauri/src/setup.rs`

- [ ] **Step 1: Add cleanup call**

Open `src-tauri/src/setup.rs`. Find `pub fn init_app_data(app: &mut App) -> ...` (around line 134). At the end of that function, before the final `Ok(())`, add:

```rust
    let logs_dir = AppConfig::app_data_dir().join("logs");
    if let Err(e) = crate::daily_log::cleanup_old_logs(&logs_dir, 3) {
        eprintln!("daily_log cleanup failed: {e}");
    }
```

- [ ] **Step 2: Build**

```bash
cargo build --manifest-path src-tauri/Cargo.toml
```

Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/setup.rs
git commit -m "feat(setup): cleanup old daily logs on startup"
```

---

## Task 8: Settings page "Open chat history" button

**Files:**
- Modify: `src/windows/settings/tabs/General.tsx`
- Modify: `src/locales/zh-TW.json`
- Modify: `src/locales/en.json`

- [ ] **Step 1: Add i18n keys**

In `src/locales/zh-TW.json` `settings` block:

```json
    "open_chat_history": "開啟對話紀錄",
    "open_chat_history_hint": "查看今天 / 昨天 / 前天的對話"
```

In `src/locales/en.json` `settings` block:

```json
    "open_chat_history": "Open chat history",
    "open_chat_history_hint": "Browse today / yesterday / day-before-yesterday conversations"
```

- [ ] **Step 2: Add the button**

Edit `src/windows/settings/tabs/General.tsx`. Near the input-position reset row (added in Plan 1, Task 6), add another row:

```tsx
import { invoke } from "@tauri-apps/api/core";

// ...inside JSX:
<div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 12 }}>
  <label style={{ fontSize: 14, fontWeight: 500 }}>
    {t("settings.open_chat_history")}
  </label>
  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
    <button
      onClick={() => { void invoke("show_chat_window"); }}
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
      {t("settings.open_chat_history")}
    </button>
    <span style={{ fontSize: 12, color: "#777" }}>
      {t("settings.open_chat_history_hint")}
    </span>
  </div>
</div>
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/windows/settings/tabs/General.tsx src/locales/zh-TW.json src/locales/en.json
git commit -m "feat(settings): add 'open chat history' button"
```

---

## Task 9: ChatApp tab bar + viewDay state (read-only past days)

**Files:**
- Modify: `src/windows/chat/ChatApp.tsx`
- Modify: `src/locales/zh-TW.json`
- Modify: `src/locales/en.json`

- [ ] **Step 1: Add i18n keys**

`zh-TW.json` add a new top-level `chat` block (or extend if already exists):

```json
  "chat": {
    "tab_today": "今天",
    "tab_yesterday": "昨天",
    "tab_day_before": "前天",
    "readonly_placeholder": "歷史紀錄為唯讀",
    "no_log_for_day": "該日無對話紀錄",
    "export": "匯出"
  }
```

`en.json`:

```json
  "chat": {
    "tab_today": "Today",
    "tab_yesterday": "Yesterday",
    "tab_day_before": "Day before",
    "readonly_placeholder": "History is read-only",
    "no_log_for_day": "No conversation on this day",
    "export": "Export"
  }
```

- [ ] **Step 2: Add tab bar + viewDay state**

Edit `src/windows/chat/ChatApp.tsx`. Add imports if not present:

```tsx
import { useTranslation } from "react-i18next";
```

Inside `ChatApp()` after the existing hooks, add:

```tsx
  const { t } = useTranslation();
  const [viewDay, setViewDay] = useState<0 | -1 | -2>(0);
  const [historyText, setHistoryText] = useState("");

  // Load historical log when viewDay changes to a past day.
  useEffect(() => {
    if (viewDay === 0) return;
    let cancelled = false;
    invoke<string>("read_daily_log", { day: viewDay })
      .then((s) => { if (!cancelled) setHistoryText(s); })
      .catch(() => { if (!cancelled) setHistoryText(""); });
    return () => { cancelled = true; };
  }, [viewDay]);

  // When switching tabs, drop any optimistic placeholder.
  useEffect(() => { if (viewDay !== 0) setPendingPrompt(null); }, [viewDay]);

  const isReadOnly = viewDay !== 0;
```

- [ ] **Step 3: Render the tab bar in the header**

Replace the existing header `<div>` (the one containing "對話記錄") with:

```tsx
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid #eee",
          fontWeight: 600,
          fontSize: 15,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span>對話記錄</span>
        <div style={{ display: "flex", gap: 4, marginLeft: 8 }}>
          {([
            [0, t("chat.tab_today")],
            [-1, t("chat.tab_yesterday")],
            [-2, t("chat.tab_day_before")],
          ] as const).map(([day, label]) => (
            <button
              key={day}
              onClick={() => setViewDay(day as 0 | -1 | -2)}
              style={{
                background: viewDay === day ? "#4A90D9" : "#eee",
                color: viewDay === day ? "#fff" : "#333",
                border: "none",
                borderRadius: 6,
                padding: "4px 10px",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
      </div>
```

- [ ] **Step 4: Render history content when viewDay !== 0**

Replace the `<MessageList messages={displayMessages} />` line with conditional content:

```tsx
      {isReadOnly ? (
        <div style={{ flex: 1, overflowY: "auto", padding: 16, fontSize: 13, whiteSpace: "pre-wrap", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
          {historyText.trim() === ""
            ? <div style={{ color: "#999" }}>{t("chat.no_log_for_day")}</div>
            : historyText}
        </div>
      ) : (
        <MessageList messages={displayMessages} />
      )}
```

- [ ] **Step 5: Disable input + hide control buttons when read-only**

Modify the bottom input row's `<input>` `disabled` and `placeholder`:

```tsx
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={isReadOnly ? t("chat.readonly_placeholder") : (loading ? "思考中…請稍候" : "輸入訊息...")}
          style={{ /* unchanged */ }}
          disabled={loading || isReadOnly}
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim() || isReadOnly}
          style={btnStyle("#4A90D9")}
        >
          {loading ? "思考中…" : "送出"}
        </button>
```

Wrap the existing `atTurnLimit() && (...)` warning block with `!isReadOnly && atTurnLimit() && (...)`.

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/windows/chat/ChatApp.tsx src/locales/zh-TW.json src/locales/en.json
git commit -m "feat(ChatApp): add today/yesterday/day-before tabs with read-only past days"
```

---

## Task 10: Export button

**Files:**
- Modify: `src/windows/chat/ChatApp.tsx`

- [ ] **Step 1: Add helper to format current-day messages**

Add to `ChatApp.tsx` near the top of the file (above `ChatApp`):

```tsx
function formatTodayMessages(messages: Message[]): string {
  const lines: string[] = [];
  for (let i = 0; i < messages.length; i += 2) {
    const u = messages[i];
    const a = messages[i + 1];
    if (!u) continue;
    lines.push(`👤 你：${u.content}`);
    if (a) lines.push(`🤖 寵物：${a.content}`);
    lines.push("");
  }
  return lines.join("\n");
}

function exportFileNameFor(viewDay: 0 | -1 | -2): string {
  const d = new Date();
  d.setDate(d.getDate() + viewDay);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `desktop-pet-chat-${yyyy}-${mm}-${dd}.txt`;
}
```

- [ ] **Step 2: Add the export handler and button**

Inside the component, near `handleSend`, add:

```tsx
  const handleExport = async () => {
    const content = viewDay === 0 ? formatTodayMessages(messages) : historyText;
    if (!content.trim()) return;
    try {
      await invoke("export_session", {
        content,
        defaultName: exportFileNameFor(viewDay),
      });
    } catch (e) {
      console.error("export failed", e);
    }
  };
```

In the header (added in Task 9), replace the trailing `<div style={{ flex: 1 }} />` with:

```tsx
        <div style={{ flex: 1 }} />
        <button
          onClick={handleExport}
          style={{
            background: "#eee",
            color: "#333",
            border: "none",
            borderRadius: 6,
            padding: "4px 10px",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          {t("chat.export")}
        </button>
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/windows/chat/ChatApp.tsx
git commit -m "feat(ChatApp): export current view to .txt via native dialog"
```

---

## Task 11: Manual smoke test

**Files:** none (smoke test only)

- [ ] **Step 1: Launch dev build**

```bash
npm run tauri dev
```

- [ ] **Step 2: Verify automatic daily log writing**

Send a message via the pet input box (`Alt+Space` or double-click character). Open Finder → `~/Library/Application Support/com.chiyi.desktop-pet/logs/` → confirm a `YYYY-MM-DD.txt` exists with the expected format.

- [ ] **Step 3: Verify settings → open chat history**

Open Settings (tray menu or `⌘,`). Click "Open chat history". The chat window appears (or comes to front).

- [ ] **Step 4: Verify tabs**

In the chat window, click "今天" — sees current session. Click "昨天" — should show yesterday's log if it exists, or "該日無對話紀錄" placeholder. Switch back to "今天" — input enabled again.

- [ ] **Step 5: Verify read-only**

While on "昨天" or "前天", confirm input is disabled with the read-only placeholder. "Reset / 總結" buttons are hidden. Switch back to "今天" — restored.

- [ ] **Step 6: Verify export**

On "今天" with some messages, click "匯出". Native save dialog opens. Pick Desktop. File saves with the expected default name and human-readable content. Cancel the dialog on a second try — no error in console.

- [ ] **Step 7: Verify cleanup**

Quit the app. Manually create a fake old log file:

```bash
touch ~/Library/Application\ Support/com.chiyi.desktop-pet/logs/2020-01-01.txt
```

Reopen the app. Confirm `2020-01-01.txt` is gone, but recent logs remain.

- [ ] **Step 8: Verify chat does not hide pet**

Open the chat window. Pet character is still visible on the desktop (existing behaviour from `tray.rs:68-69`).

- [ ] **Step 9: Final commit (if any inline fix)**

If smoke test surfaced bugs, fix and commit. Otherwise no commit.

---

## Self-Review Checklist (run after all tasks done)

- [ ] All 9 daily_log Rust tests pass: `cargo test --manifest-path src-tauri/Cargo.toml daily_log`
- [ ] `npx tsc --noEmit` clean
- [ ] No leftover `eprintln!` debug noise other than the documented log-failure prints
- [ ] i18n keys present in both locales
- [ ] Spec Part 2 requirements all covered:
  - [x] Open chat history from settings (Task 8)
  - [x] Daily log auto-written every exchange (Task 5)
  - [x] Last 3 days kept; older deleted on startup (Task 4 + 7)
  - [x] Today / Yesterday / Day-before tabs (Task 9)
  - [x] Past days read-only (Task 9)
  - [x] No record placeholder (Task 9)
  - [x] Export to .txt via native save dialog (Task 6 + 10)
  - [x] Pet not hidden when chat opens (existing behaviour, verified in smoke test)
  - [x] Chat window already resizable + draggable (existing, no work needed)
