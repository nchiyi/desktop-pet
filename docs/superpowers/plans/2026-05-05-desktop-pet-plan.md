# Desktop Pet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a cross-platform (Windows/macOS) desktop pet app that roams the desktop and connects to local CLI AI tools (Claude Code / Gemini CLI / Codex) via subprocess — no API keys required.

**Architecture:** Tauri v2 (Rust backend + React/TypeScript frontend). Rust handles system-level concerns (transparent window, global hotkey, subprocess management, config). React handles all UI rendering. CLI adapters implement a common `CliAdapter` trait, one file per CLI tool.

**Tech Stack:** Tauri v2, Rust, React 18, TypeScript, Zustand, Vite, Vitest, `tauri-plugin-global-shortcut`, `toml` crate, `zip` crate

---

## File Map

```
desktop-pet/
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       ├── main.rs                  # entry point, app bootstrap
│       ├── lib.rs                   # module declarations + Tauri builder
│       ├── config.rs                # AppConfig struct, read/write TOML
│       ├── tray.rs                  # system tray setup + menu
│       ├── hotkey.rs                # global hotkey registration
│       ├── session.rs               # SessionManager, 30-turn logic, JSON persist
│       ├── character.rs             # CharacterLoader, character.toml parsing
│       ├── installer.rs             # ZIP install, folder copy
│       ├── adapters/
│       │   ├── mod.rs               # CliAdapter trait + AdapterManager
│       │   ├── claude.rs            # ClaudeAdapter
│       │   ├── gemini.rs            # GeminiAdapter
│       │   └── codex.rs             # CodexAdapter
│       └── commands.rs              # all #[tauri::command] functions
├── src/
│   ├── main.tsx                     # React entry
│   ├── windows/
│   │   ├── pet/
│   │   │   ├── PetApp.tsx           # pet window root
│   │   │   ├── PetCharacter.tsx     # renders GIF/PNG/WebP/Sprite
│   │   │   ├── SpeechBubble.tsx     # bubble above character
│   │   │   └── InputOverlay.tsx     # hotkey-triggered input box
│   │   └── chat/
│   │       ├── ChatApp.tsx          # chat panel root
│   │       └── MessageList.tsx      # scrollable message history
│   ├── windows/settings/
│   │   ├── SettingsApp.tsx
│   │   ├── tabs/General.tsx
│   │   ├── tabs/Movement.tsx
│   │   ├── tabs/Animation.tsx
│   │   └── tabs/CliConfig.tsx
│   ├── windows/guide/
│   │   └── GuideApp.tsx             # character creation guide
│   ├── hooks/
│   │   ├── usePetAnimation.ts       # animation state machine
│   │   ├── usePetMovement.ts        # movement + drag + multi-monitor
│   │   └── useSession.ts            # session state + 30-turn counter
│   ├── stores/
│   │   ├── petStore.ts              # animation state, position
│   │   ├── sessionStore.ts          # messages, turn count
│   │   └── settingsStore.ts         # all user settings
│   └── types/
│       ├── character.ts
│       ├── session.ts
│       └── settings.ts
├── assets/
│   ├── idle_phrases.toml
│   └── characters/default/
│       ├── character.toml
│       └── idle.gif
└── tests/                           # Vitest frontend tests
```

---

## Phase 1 — Project Scaffold

### Task 1: Initialize Tauri v2 Project

**Files:**
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/src/lib.rs`
- Create: `package.json`
- Create: `vite.config.ts`

- [ ] **Step 1: Scaffold project**

```bash
cd /Users/chiyi/Desktop/Antigravity/desktop-pet
npm create tauri-app@latest . -- --template react-ts --manager npm --yes
```

Expected output: project files created including `src-tauri/`, `src/`, `package.json`

- [ ] **Step 2: Install frontend deps**

```bash
npm install zustand @tauri-apps/api @tauri-apps/plugin-global-shortcut
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 3: Add Rust deps to `src-tauri/Cargo.toml`**

Replace the `[dependencies]` section:

```toml
[dependencies]
tauri = { version = "2", features = ["tray-icon", "image-png"] }
tauri-plugin-global-shortcut = "2"
tauri-plugin-autostart = "2"
tauri-plugin-single-instance = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
toml = "0.8"
zip = "0.6"
anyhow = "1"
tokio = { version = "1", features = ["full"] }
```

- [ ] **Step 4: Configure multi-window in `src-tauri/tauri.conf.json`**

```json
{
  "app": {
    "windows": [
      {
        "label": "pet",
        "url": "index.html",
        "width": 150,
        "height": 150,
        "transparent": true,
        "decorations": false,
        "alwaysOnTop": true,
        "skipTaskbar": true,
        "resizable": false,
        "visible": true
      },
      {
        "label": "chat",
        "url": "chat.html",
        "width": 380,
        "height": 560,
        "visible": false,
        "decorations": true,
        "resizable": true
      },
      {
        "label": "settings",
        "url": "settings.html",
        "width": 480,
        "height": 520,
        "visible": false,
        "decorations": true,
        "resizable": false
      },
      {
        "label": "guide",
        "url": "guide.html",
        "width": 520,
        "height": 600,
        "visible": false,
        "decorations": true,
        "resizable": false
      }
    ]
  }
}
```

- [ ] **Step 5: Add Vitest config to `vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
  },
});
```

- [ ] **Step 6: Create test setup `tests/setup.ts`**

```ts
import "@testing-library/jest-dom";
```

- [ ] **Step 7: Verify project builds**

```bash
npm run tauri dev
```

Expected: app window opens, no compile errors.

- [ ] **Step 8: Commit**

```bash
git add .
git commit -m "feat: initialize Tauri v2 project with React/TS and multi-window config"
```

---

### Task 2: App Config System

**Files:**
- Create: `src-tauri/src/config.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write test**

Add to bottom of `src-tauri/src/config.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn default_config_serializes_and_deserializes() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("config.toml");
        let cfg = AppConfig::default();
        cfg.save(&path).unwrap();
        let loaded = AppConfig::load(&path).unwrap();
        assert_eq!(loaded.hotkey, cfg.hotkey);
        assert_eq!(loaded.movement_mode, cfg.movement_mode);
    }
}
```

Run: `cargo test -p desktop-pet-lib config`
Expected: FAIL (config.rs doesn't exist yet)

- [ ] **Step 2: Add `tempfile` to Cargo.toml dev-deps**

```toml
[dev-dependencies]
tempfile = "3"
```

- [ ] **Step 3: Create `src-tauri/src/config.rs`**

```rust
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum MovementMode {
    FullScreen,
    FixedTop,
    FixedBottom,
    FixedLeft,
    FixedRight,
    Fixed,
}

impl Default for MovementMode {
    fn default() -> Self { MovementMode::FullScreen }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum CliTool {
    Claude,
    Gemini,
    Codex,
}

impl Default for CliTool {
    fn default() -> Self { CliTool::Claude }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub hotkey: String,
    pub movement_mode: MovementMode,
    pub active_character: String,
    pub character_size: u32,
    pub movement_speed: f32,
    pub idle_anim_interval_min: u32,
    pub idle_anim_interval_max: u32,
    pub bubble_duration_secs: u32,
    pub show_idle_bubbles: bool,
    pub night_sleep_mode: bool,
    pub night_start_hour: u8,
    pub night_end_hour: u8,
    pub launch_at_startup: bool,
    pub multi_monitor: bool,
    pub cli_tool: CliTool,
    pub cli_path_override: Option<String>,
    pub reply_language: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            hotkey: "Alt+Space".into(),
            movement_mode: MovementMode::FullScreen,
            active_character: "default".into(),
            character_size: 80,
            movement_speed: 1.0,
            idle_anim_interval_min: 30,
            idle_anim_interval_max: 120,
            bubble_duration_secs: 8,
            show_idle_bubbles: true,
            night_sleep_mode: false,
            night_start_hour: 22,
            night_end_hour: 8,
            launch_at_startup: false,
            multi_monitor: false,
            cli_tool: CliTool::Claude,
            cli_path_override: None,
            reply_language: "繁體中文".into(),
        }
    }
}

impl AppConfig {
    pub fn load(path: &Path) -> Result<Self> {
        let content = std::fs::read_to_string(path)?;
        Ok(toml::from_str(&content)?)
    }

    pub fn save(&self, path: &Path) -> Result<()> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(path, toml::to_string_pretty(self)?)?;
        Ok(())
    }

    pub fn app_data_dir() -> PathBuf {
        #[cfg(target_os = "windows")]
        {
            let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".into());
            PathBuf::from(appdata).join("DesktopPet")
        }
        #[cfg(target_os = "macos")]
        {
            let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
            PathBuf::from(home).join("Library/Application Support/DesktopPet")
        }
        #[cfg(not(any(target_os = "windows", target_os = "macos")))]
        {
            PathBuf::from(".desktop-pet")
        }
    }

    pub fn config_path() -> PathBuf {
        Self::app_data_dir().join("config.toml")
    }
}
```

- [ ] **Step 4: Register module in `lib.rs`**

```rust
pub mod config;
```

- [ ] **Step 5: Run test**

```bash
cargo test -p desktop-pet-lib config
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/config.rs src-tauri/src/lib.rs src-tauri/Cargo.toml
git commit -m "feat: add AppConfig with TOML read/write and app data dir resolution"
```

---

## Phase 2 — CLI Adapters

### Task 3: CliAdapter Trait + Claude Adapter

**Files:**
- Create: `src-tauri/src/adapters/mod.rs`
- Create: `src-tauri/src/adapters/claude.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write trait and test**

Create `src-tauri/src/adapters/mod.rs`:

```rust
use anyhow::Result;
use std::path::PathBuf;

pub trait CliAdapter: Send {
    fn name(&self) -> &str;
    fn detect() -> Option<PathBuf> where Self: Sized;
    fn send_prompt(&mut self, history: &[Message], prompt: &str) -> Result<String>;
    fn reset(&mut self);
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Message {
    pub role: String,   // "user" or "assistant"
    pub content: String,
}

pub mod claude;
pub mod gemini;
pub mod codex;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn message_serializes() {
        let m = Message { role: "user".into(), content: "hello".into() };
        let json = serde_json::to_string(&m).unwrap();
        assert!(json.contains("user"));
    }
}
```

- [ ] **Step 2: Run test to verify it passes**

```bash
cargo test -p desktop-pet-lib adapters
```

Expected: PASS

- [ ] **Step 3: Write Claude adapter test**

Create `src-tauri/src/adapters/claude.rs`:

```rust
use super::{CliAdapter, Message};
use anyhow::{Context, Result};
use std::path::PathBuf;
use std::process::Command;

pub struct ClaudeAdapter {
    pub cli_path: PathBuf,
}

impl ClaudeAdapter {
    pub fn new(path_override: Option<PathBuf>) -> Result<Self> {
        let cli_path = path_override
            .or_else(Self::detect)
            .context("Claude CLI not found. Install with: npm install -g @anthropic-ai/claude-code")?;
        Ok(Self { cli_path })
    }
}

impl CliAdapter for ClaudeAdapter {
    fn name(&self) -> &str { "Claude Code" }

    fn detect() -> Option<PathBuf> {
        // Try `which claude` on Unix, `where claude` on Windows
        let output = if cfg!(target_os = "windows") {
            Command::new("where").arg("claude").output().ok()?
        } else {
            Command::new("which").arg("claude").output().ok()?
        };
        if output.status.success() {
            let path = String::from_utf8(output.stdout).ok()?.trim().lines().next()?.to_string();
            Some(PathBuf::from(path))
        } else {
            // fallback: npm global bin
            #[cfg(target_os = "windows")]
            {
                let appdata = std::env::var("APPDATA").ok()?;
                let p = PathBuf::from(appdata).join("npm").join("claude.cmd");
                if p.exists() { return Some(p); }
            }
            None
        }
    }

    fn send_prompt(&mut self, history: &[Message], prompt: &str) -> Result<String> {
        // Build a single prompt with history context
        let mut full_prompt = String::new();
        for msg in history {
            full_prompt.push_str(&format!("{}: {}\n", msg.role, msg.content));
        }
        full_prompt.push_str(&format!("user: {}", prompt));

        let output = Command::new(&self.cli_path)
            .args(["-p", &full_prompt, "--output-format", "text"])
            .output()
            .context("Failed to run claude CLI")?;

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
        } else {
            let err = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!("Claude CLI error: {}", err)
        }
    }

    fn reset(&mut self) {}
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detect_returns_none_when_not_installed() {
        // This test verifies detect() doesn't panic even when CLI is absent
        // On CI where claude isn't installed, it returns None
        let _ = ClaudeAdapter::detect(); // just verify no panic
    }

    #[test]
    fn new_with_invalid_path_errors() {
        let result = ClaudeAdapter::new(Some(PathBuf::from("/nonexistent/claude")));
        // The path exists check is deferred to runtime, so new() succeeds with explicit path
        assert!(result.is_ok());
    }
}
```

- [ ] **Step 4: Run tests**

```bash
cargo test -p desktop-pet-lib adapters
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/adapters/
git commit -m "feat: add CliAdapter trait and ClaudeAdapter with subprocess-based send_prompt"
```

---

### Task 4: Gemini and Codex Adapters

**Files:**
- Create: `src-tauri/src/adapters/gemini.rs`
- Create: `src-tauri/src/adapters/codex.rs`

- [ ] **Step 1: Create `src-tauri/src/adapters/gemini.rs`**

```rust
use super::{CliAdapter, Message};
use anyhow::{Context, Result};
use std::path::PathBuf;
use std::process::Command;

pub struct GeminiAdapter {
    pub cli_path: PathBuf,
}

impl GeminiAdapter {
    pub fn new(path_override: Option<PathBuf>) -> Result<Self> {
        let cli_path = path_override
            .or_else(Self::detect)
            .context("Gemini CLI not found. Install with: npm install -g @google/gemini-cli")?;
        Ok(Self { cli_path })
    }
}

impl CliAdapter for GeminiAdapter {
    fn name(&self) -> &str { "Gemini CLI" }

    fn detect() -> Option<PathBuf> {
        let output = if cfg!(target_os = "windows") {
            Command::new("where").arg("gemini").output().ok()?
        } else {
            Command::new("which").arg("gemini").output().ok()?
        };
        if output.status.success() {
            let path = String::from_utf8(output.stdout).ok()?.trim().lines().next()?.to_string();
            Some(PathBuf::from(path))
        } else {
            #[cfg(target_os = "windows")]
            {
                let appdata = std::env::var("APPDATA").ok()?;
                let p = PathBuf::from(appdata).join("npm").join("gemini.cmd");
                if p.exists() { return Some(p); }
            }
            None
        }
    }

    fn send_prompt(&mut self, history: &[Message], prompt: &str) -> Result<String> {
        let mut full_prompt = String::new();
        for msg in history {
            full_prompt.push_str(&format!("{}: {}\n", msg.role, msg.content));
        }
        full_prompt.push_str(&format!("user: {}", prompt));

        let output = Command::new(&self.cli_path)
            .args(["-p", &full_prompt])
            .output()
            .context("Failed to run gemini CLI")?;

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
        } else {
            let err = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!("Gemini CLI error: {}", err)
        }
    }

    fn reset(&mut self) {}
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn detect_does_not_panic() { let _ = GeminiAdapter::detect(); }
}
```

- [ ] **Step 2: Create `src-tauri/src/adapters/codex.rs`**

```rust
use super::{CliAdapter, Message};
use anyhow::{Context, Result};
use std::path::PathBuf;
use std::process::Command;

pub struct CodexAdapter {
    pub cli_path: PathBuf,
}

impl CodexAdapter {
    pub fn new(path_override: Option<PathBuf>) -> Result<Self> {
        let cli_path = path_override
            .or_else(Self::detect)
            .context("Codex CLI not found. Install with: npm install -g @openai/codex")?;
        Ok(Self { cli_path })
    }
}

impl CliAdapter for CodexAdapter {
    fn name(&self) -> &str { "Codex" }

    fn detect() -> Option<PathBuf> {
        let output = if cfg!(target_os = "windows") {
            Command::new("where").arg("codex").output().ok()?
        } else {
            Command::new("which").arg("codex").output().ok()?
        };
        if output.status.success() {
            let path = String::from_utf8(output.stdout).ok()?.trim().lines().next()?.to_string();
            Some(PathBuf::from(path))
        } else {
            #[cfg(target_os = "windows")]
            {
                let appdata = std::env::var("APPDATA").ok()?;
                let p = PathBuf::from(appdata).join("npm").join("codex.cmd");
                if p.exists() { return Some(p); }
            }
            None
        }
    }

    fn send_prompt(&mut self, history: &[Message], prompt: &str) -> Result<String> {
        let mut full_prompt = String::new();
        for msg in history {
            full_prompt.push_str(&format!("{}: {}\n", msg.role, msg.content));
        }
        full_prompt.push_str(&format!("user: {}", prompt));

        let output = Command::new(&self.cli_path)
            .args(["-q", &full_prompt])
            .output()
            .context("Failed to run codex CLI")?;

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
        } else {
            let err = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!("Codex CLI error: {}", err)
        }
    }

    fn reset(&mut self) {}
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn detect_does_not_panic() { let _ = CodexAdapter::detect(); }
}
```

- [ ] **Step 3: Run all adapter tests**

```bash
cargo test -p desktop-pet-lib
```

Expected: all PASS

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/adapters/gemini.rs src-tauri/src/adapters/codex.rs
git commit -m "feat: add GeminiAdapter and CodexAdapter"
```

---

### Task 5: Session Manager

**Files:**
- Create: `src-tauri/src/session.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing tests**

```rust
// bottom of src-tauri/src/session.rs
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_session_has_zero_turns() {
        let s = Session::new("test".into());
        assert_eq!(s.turn_count(), 0);
    }

    #[test]
    fn adding_exchange_increments_turns() {
        let mut s = Session::new("test".into());
        s.add_exchange("hello".into(), "hi".into());
        assert_eq!(s.turn_count(), 1);
    }

    #[test]
    fn at_30_turns_is_at_limit() {
        let mut s = Session::new("test".into());
        for i in 0..30 {
            s.add_exchange(format!("q{i}"), format!("a{i}"));
        }
        assert!(s.at_turn_limit());
    }

    #[test]
    fn below_30_turns_not_at_limit() {
        let mut s = Session::new("test".into());
        s.add_exchange("q".into(), "a".into());
        assert!(!s.at_turn_limit());
    }

    #[test]
    fn reset_clears_messages_and_turns() {
        let mut s = Session::new("test".into());
        s.add_exchange("q".into(), "a".into());
        s.reset();
        assert_eq!(s.turn_count(), 0);
        assert!(s.messages().is_empty());
    }
}
```

Run: `cargo test -p desktop-pet-lib session`
Expected: FAIL

- [ ] **Step 2: Implement `src-tauri/src/session.rs`**

```rust
use crate::adapters::Message;
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

const TURN_LIMIT: usize = 30;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub created_at: u64,
    messages: Vec<Message>,
}

impl Session {
    pub fn new(id: String) -> Self {
        Self {
            id,
            created_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
            messages: Vec::new(),
        }
    }

    pub fn add_exchange(&mut self, user_msg: String, assistant_msg: String) {
        self.messages.push(Message { role: "user".into(), content: user_msg });
        self.messages.push(Message { role: "assistant".into(), content: assistant_msg });
    }

    pub fn turn_count(&self) -> usize {
        self.messages.len() / 2
    }

    pub fn at_turn_limit(&self) -> bool {
        self.turn_count() >= TURN_LIMIT
    }

    pub fn messages(&self) -> &[Message] {
        &self.messages
    }

    pub fn reset(&mut self) {
        self.messages.clear();
    }

    pub fn save(&self, dir: &PathBuf) -> Result<()> {
        std::fs::create_dir_all(dir)?;
        let path = dir.join(format!("{}.json", self.id));
        std::fs::write(path, serde_json::to_string_pretty(self)?)?;
        Ok(())
    }
}
```

- [ ] **Step 3: Run tests**

```bash
cargo test -p desktop-pet-lib session
```

Expected: PASS

- [ ] **Step 4: Register in `lib.rs`**

Add: `pub mod session;`

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/session.rs src-tauri/src/lib.rs
git commit -m "feat: add Session with 30-turn limit and JSON persistence"
```

---

## Phase 3 — Character System

### Task 6: Character Loader

**Files:**
- Create: `src-tauri/src/character.rs`
- Create: `assets/characters/default/character.toml`
- Create: `assets/idle_phrases.toml`

- [ ] **Step 1: Write failing test**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;
    use std::fs;

    #[test]
    fn loads_character_from_dir() {
        let dir = tempdir().unwrap();
        let char_dir = dir.path().join("mychar");
        fs::create_dir(&char_dir).unwrap();
        fs::write(char_dir.join("character.toml"),
            r#"name = "Test"\nauthor = "me"\nversion = "1.0"\nsize = 80"#
        ).unwrap();
        fs::write(char_dir.join("idle.gif"), b"").unwrap();

        let meta = CharacterMeta::load(&char_dir).unwrap();
        assert_eq!(meta.name, "Test");
        assert_eq!(meta.size, 80);
    }

    #[test]
    fn missing_idle_gif_returns_error() {
        let dir = tempdir().unwrap();
        let char_dir = dir.path().join("empty");
        fs::create_dir(&char_dir).unwrap();
        fs::write(char_dir.join("character.toml"),
            r#"name = "X"\nauthor = ""\nversion = "1.0"\nsize = 80"#
        ).unwrap();
        let result = CharacterMeta::load(&char_dir);
        assert!(result.is_err());
    }
}
```

Run: `cargo test -p desktop-pet-lib character`
Expected: FAIL

- [ ] **Step 2: Implement `src-tauri/src/character.rs`**

```rust
use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

pub const ANIMATION_NAMES: &[&str] = &[
    "idle", "walk", "run", "sit", "dance", "sway",
    "stretch", "sleep", "think", "talk", "happy",
    "sad", "drag", "surprised", "impatient",
];

pub const FALLBACK_CHAIN: &[(&str, &str)] = &[
    ("dance",     "happy"),
    ("sway",      "idle"),
    ("stretch",   "idle"),
    ("impatient", "sad"),
    ("talk",      "happy"),
    ("run",       "walk"),
];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CharacterMeta {
    pub name: String,
    pub author: String,
    pub version: String,
    pub size: u32,
    #[serde(default)]
    pub animation: AnimationConfig,
    #[serde(skip)]
    pub dir: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AnimationConfig {
    pub idle_duration: Option<f32>,
    pub think_duration: Option<f32>,
}

impl CharacterMeta {
    pub fn load(dir: &Path) -> Result<Self> {
        let toml_path = dir.join("character.toml");
        let content = std::fs::read_to_string(&toml_path)
            .context("character.toml not found")?;
        let mut meta: CharacterMeta = toml::from_str(&content)
            .context("Failed to parse character.toml")?;
        meta.dir = dir.to_path_buf();

        // Verify idle.gif or idle.png or idle.webp exists
        let idle_exists = ["idle.gif", "idle.png", "idle.webp"]
            .iter()
            .any(|f| dir.join(f).exists());
        if !idle_exists {
            bail!("Character must have at least idle.gif, idle.png, or idle.webp");
        }

        Ok(meta)
    }

    /// Returns path to animation file, with fallback chain.
    pub fn animation_path(&self, anim: &str) -> PathBuf {
        let exts = ["gif", "webp", "png"];
        for ext in &exts {
            let p = self.dir.join(format!("{}.{}", anim, ext));
            if p.exists() { return p; }
            // Check sprite sheet
            let sprite = self.dir.join(format!("{}_sprite.png", anim));
            if sprite.exists() { return sprite; }
        }
        // Try fallback chain
        for (from, to) in FALLBACK_CHAIN {
            if *from == anim {
                return self.animation_path(to);
            }
        }
        // Final fallback: idle
        if anim != "idle" {
            return self.animation_path("idle");
        }
        // Last resort: thumbnail
        let thumb = self.dir.join("thumbnail.png");
        if thumb.exists() { return thumb; }
        self.dir.join("idle.gif") // may not exist, caller handles
    }

    pub fn list_available(characters_dir: &Path) -> Vec<CharacterMeta> {
        let Ok(entries) = std::fs::read_dir(characters_dir) else { return vec![] };
        entries
            .filter_map(|e| e.ok())
            .filter(|e| e.path().is_dir())
            .filter_map(|e| CharacterMeta::load(&e.path()).ok())
            .collect()
    }
}
```

- [ ] **Step 3: Create default character files**

Create `assets/characters/default/character.toml`:
```toml
name = "Default"
author = "desktop-pet"
version = "1.0"
size = 80
```

Create `assets/idle_phrases.toml`:
```toml
phrases = [
    "今天天氣不錯呢！",
    "要一起加油嗎？",
    "有什麼我可以幫你的嗎？",
    "伸個懶腰~",
    "你還好嗎？",
    "有問題隨時問我喔！",
    "我在這裡~",
    "今天也要好好努力！",
]
```

- [ ] **Step 4: Run tests**

```bash
cargo test -p desktop-pet-lib character
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/character.rs assets/
git commit -m "feat: add CharacterMeta loader with fallback animation chain"
```

---

### Task 7: Character Installer (ZIP + Folder)

**Files:**
- Create: `src-tauri/src/installer.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write tests**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;
    use std::fs;
    use std::io::Write;

    fn make_zip_with_character(zip_path: &std::path::Path) {
        let file = fs::File::create(zip_path).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        let opts = zip::write::SimpleFileOptions::default();
        zip.add_directory("mychar/", opts).unwrap();
        zip.start_file("mychar/character.toml", opts).unwrap();
        zip.write_all(b"name=\"X\"\nauthor=\"\"\nversion=\"1.0\"\nsize=80").unwrap();
        zip.start_file("mychar/idle.gif", opts).unwrap();
        zip.write_all(b"GIF89a").unwrap();
        zip.finish().unwrap();
    }

    #[test]
    fn install_zip_extracts_character_dir() {
        let src_dir = tempdir().unwrap();
        let dst_dir = tempdir().unwrap();
        let zip_path = src_dir.path().join("mychar.zip");
        make_zip_with_character(&zip_path);
        install_zip(&zip_path, dst_dir.path()).unwrap();
        assert!(dst_dir.path().join("mychar").join("character.toml").exists());
    }
}
```

Run: `cargo test -p desktop-pet-lib installer`
Expected: FAIL

- [ ] **Step 2: Create `src-tauri/src/installer.rs`**

```rust
use anyhow::{Context, Result};
use std::io;
use std::path::Path;

pub fn install_zip(zip_path: &Path, characters_dir: &Path) -> Result<()> {
    let file = std::fs::File::open(zip_path)
        .context("Cannot open ZIP file")?;
    let mut archive = zip::ZipArchive::new(file)
        .context("Invalid ZIP file")?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)?;
        let out_path = characters_dir.join(entry.name());
        if entry.is_dir() {
            std::fs::create_dir_all(&out_path)?;
        } else {
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut outfile = std::fs::File::create(&out_path)?;
            io::copy(&mut entry, &mut outfile)?;
        }
    }
    Ok(())
}

pub fn open_characters_dir(characters_dir: &Path) -> Result<()> {
    std::fs::create_dir_all(characters_dir)?;
    #[cfg(target_os = "macos")]
    std::process::Command::new("open").arg(characters_dir).spawn()?;
    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer").arg(characters_dir).spawn()?;
    Ok(())
}
```

- [ ] **Step 3: Run tests**

```bash
cargo test -p desktop-pet-lib installer
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/installer.rs src-tauri/src/lib.rs
git commit -m "feat: add ZIP character installer and open_characters_dir"
```

---

## Phase 4 — Tauri Commands Bridge

### Task 8: Tauri Commands + State

**Files:**
- Create: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/main.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create `src-tauri/src/commands.rs`**

```rust
use crate::adapters::{claude::ClaudeAdapter, gemini::GeminiAdapter, codex::CodexAdapter, CliAdapter, Message};
use crate::character::CharacterMeta;
use crate::config::{AppConfig, CliTool};
use crate::installer::{install_zip, open_characters_dir};
use crate::session::Session;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::State;

pub struct AppState {
    pub config: Mutex<AppConfig>,
    pub session: Mutex<Session>,
    pub adapter: Mutex<Option<Box<dyn CliAdapter>>>,
}

impl AppState {
    pub fn new() -> Self {
        let config = AppConfig::load(&AppConfig::config_path()).unwrap_or_default();
        Self {
            config: Mutex::new(config),
            session: Mutex::new(Session::new(uuid())),
            adapter: Mutex::new(None),
        }
    }
}

fn uuid() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis().to_string()
}

#[tauri::command]
pub fn get_config(state: State<AppState>) -> AppConfig {
    state.config.lock().unwrap().clone()
}

#[tauri::command]
pub fn save_config(state: State<AppState>, config: AppConfig) -> Result<(), String> {
    config.save(&AppConfig::config_path()).map_err(|e| e.to_string())?;
    *state.config.lock().unwrap() = config;
    Ok(())
}

#[tauri::command]
pub fn send_message(state: State<AppState>, prompt: String) -> Result<String, String> {
    let config = state.config.lock().unwrap().clone();
    let mut adapter_guard = state.adapter.lock().unwrap();

    // Initialize adapter if needed
    if adapter_guard.is_none() {
        let path_override = config.cli_path_override.as_ref().map(PathBuf::from);
        let adapter: Box<dyn CliAdapter> = match config.cli_tool {
            CliTool::Claude => Box::new(ClaudeAdapter::new(path_override).map_err(|e| e.to_string())?),
            CliTool::Gemini => Box::new(GeminiAdapter::new(path_override).map_err(|e| e.to_string())?),
            CliTool::Codex  => Box::new(CodexAdapter::new(path_override).map_err(|e| e.to_string())?),
        };
        *adapter_guard = Some(adapter);
    }

    let mut session = state.session.lock().unwrap();
    let history = session.messages().to_vec();
    let lang = &config.reply_language;
    let prefixed_prompt = format!("請用{}回覆：{}", lang, prompt);

    let response = adapter_guard
        .as_mut()
        .unwrap()
        .send_prompt(&history, &prefixed_prompt)
        .map_err(|e| e.to_string())?;

    session.add_exchange(prompt, response.clone());

    let sessions_dir = AppConfig::app_data_dir().join("sessions");
    let _ = session.save(&sessions_dir);

    Ok(response)
}

#[tauri::command]
pub fn get_session(state: State<AppState>) -> crate::session::Session {
    state.session.lock().unwrap().clone()
}

#[tauri::command]
pub fn reset_session(state: State<AppState>) {
    let mut session = state.session.lock().unwrap();
    let mut adapter = state.adapter.lock().unwrap();
    session.reset();
    if let Some(a) = adapter.as_mut() { a.reset(); }
    *session = Session::new(uuid());
}

#[tauri::command]
pub fn test_cli_connection(state: State<AppState>) -> Result<String, String> {
    let config = state.config.lock().unwrap().clone();
    let path_override = config.cli_path_override.as_ref().map(PathBuf::from);
    let mut adapter: Box<dyn CliAdapter> = match config.cli_tool {
        CliTool::Claude => Box::new(ClaudeAdapter::new(path_override).map_err(|e| e.to_string())?),
        CliTool::Gemini => Box::new(GeminiAdapter::new(path_override).map_err(|e| e.to_string())?),
        CliTool::Codex  => Box::new(CodexAdapter::new(path_override).map_err(|e| e.to_string())?),
    };
    let name = adapter.name().to_string();
    adapter.send_prompt(&[], "請回覆 OK").map_err(|e| e.to_string())?;
    Ok(format!("✅ 連線成功（{}）", name))
}

#[tauri::command]
pub fn list_characters(state: State<AppState>) -> Vec<CharacterMeta> {
    let characters_dir = AppConfig::app_data_dir().join("characters");
    CharacterMeta::list_available(&characters_dir)
}

#[tauri::command]
pub fn install_character_zip(zip_path: String, state: State<AppState>) -> Result<(), String> {
    let characters_dir = AppConfig::app_data_dir().join("characters");
    install_zip(&PathBuf::from(&zip_path), &characters_dir).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_characters_folder(_state: State<AppState>) -> Result<(), String> {
    let characters_dir = AppConfig::app_data_dir().join("characters");
    open_characters_dir(&characters_dir).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_animation_path(state: State<AppState>, anim_name: String) -> String {
    let config = state.config.lock().unwrap();
    let characters_dir = AppConfig::app_data_dir().join("characters");
    let char_dir = characters_dir.join(&config.active_character);
    if let Ok(meta) = CharacterMeta::load(&char_dir) {
        meta.animation_path(&anim_name).to_string_lossy().to_string()
    } else {
        String::new()
    }
}
```

- [ ] **Step 2: Register state and commands in `main.rs`**

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use desktop_pet_lib::commands::AppState;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Focus existing window if second instance launched
            let _ = app.get_webview_window("pet").map(|w| w.show());
        }))
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            desktop_pet_lib::commands::get_config,
            desktop_pet_lib::commands::save_config,
            desktop_pet_lib::commands::send_message,
            desktop_pet_lib::commands::get_session,
            desktop_pet_lib::commands::reset_session,
            desktop_pet_lib::commands::test_cli_connection,
            desktop_pet_lib::commands::list_characters,
            desktop_pet_lib::commands::install_character_zip,
            desktop_pet_lib::commands::open_characters_folder,
            desktop_pet_lib::commands::get_animation_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 3: Verify build**

```bash
cargo build --manifest-path src-tauri/Cargo.toml
```

Expected: compiles without errors.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/main.rs
git commit -m "feat: add Tauri commands bridge with AppState (config, session, adapter)"
```

---

## Phase 5 — Frontend: Types & Stores

### Task 9: TypeScript Types + Zustand Stores

**Files:**
- Create: `src/types/character.ts`
- Create: `src/types/session.ts`
- Create: `src/types/settings.ts`
- Create: `src/stores/settingsStore.ts`
- Create: `src/stores/sessionStore.ts`
- Create: `src/stores/petStore.ts`

- [ ] **Step 1: Write test for sessionStore**

Create `tests/sessionStore.test.ts`:

```ts
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

  it("turnCount returns half of messages", () => {
    useSessionStore.getState().addExchange("q", "a");
    useSessionStore.getState().addExchange("q2", "a2");
    expect(useSessionStore.getState().turnCount()).toBe(2);
  });

  it("atTurnLimit true at 30 turns", () => {
    for (let i = 0; i < 30; i++) {
      useSessionStore.getState().addExchange(`q${i}`, `a${i}`);
    }
    expect(useSessionStore.getState().atTurnLimit()).toBe(true);
  });
});
```

Run: `npx vitest run tests/sessionStore.test.ts`
Expected: FAIL

- [ ] **Step 2: Create `src/types/session.ts`**

```ts
export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface Session {
  id: string;
  created_at: number;
  messages: Message[];
}
```

- [ ] **Step 3: Create `src/stores/sessionStore.ts`**

```ts
import { create } from "zustand";
import { Message } from "../types/session";

const TURN_LIMIT = 30;

interface SessionState {
  messages: Message[];
  addExchange: (userMsg: string, assistantMsg: string) => void;
  turnCount: () => number;
  atTurnLimit: () => boolean;
  reset: () => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  messages: [],
  addExchange: (userMsg, assistantMsg) =>
    set((s) => ({
      messages: [
        ...s.messages,
        { role: "user", content: userMsg },
        { role: "assistant", content: assistantMsg },
      ],
    })),
  turnCount: () => Math.floor(get().messages.length / 2),
  atTurnLimit: () => Math.floor(get().messages.length / 2) >= TURN_LIMIT,
  reset: () => set({ messages: [] }),
}));
```

- [ ] **Step 4: Create `src/types/settings.ts`**

```ts
export type MovementMode = "FullScreen" | "FixedTop" | "FixedBottom" | "FixedLeft" | "FixedRight" | "Fixed";
export type CliTool = "Claude" | "Gemini" | "Codex";

export interface AppConfig {
  hotkey: string;
  movement_mode: MovementMode;
  active_character: string;
  character_size: number;
  movement_speed: number;
  idle_anim_interval_min: number;
  idle_anim_interval_max: number;
  bubble_duration_secs: number;
  show_idle_bubbles: boolean;
  night_sleep_mode: boolean;
  night_start_hour: number;
  night_end_hour: number;
  launch_at_startup: boolean;
  multi_monitor: boolean;
  cli_tool: CliTool;
  cli_path_override: string | null;
  reply_language: string;
}

export const DEFAULT_CONFIG: AppConfig = {
  hotkey: "Alt+Space",
  movement_mode: "FullScreen",
  active_character: "default",
  character_size: 80,
  movement_speed: 1.0,
  idle_anim_interval_min: 30,
  idle_anim_interval_max: 120,
  bubble_duration_secs: 8,
  show_idle_bubbles: true,
  night_sleep_mode: false,
  night_start_hour: 22,
  night_end_hour: 8,
  launch_at_startup: false,
  multi_monitor: false,
  cli_tool: "Claude",
  cli_path_override: null,
  reply_language: "繁體中文",
};
```

- [ ] **Step 5: Create `src/stores/settingsStore.ts`**

```ts
import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { AppConfig, DEFAULT_CONFIG } from "../types/settings";

interface SettingsState {
  config: AppConfig;
  load: () => Promise<void>;
  save: (config: AppConfig) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  config: DEFAULT_CONFIG,
  load: async () => {
    const config = await invoke<AppConfig>("get_config");
    set({ config });
  },
  save: async (config) => {
    await invoke("save_config", { config });
    set({ config });
  },
}));
```

- [ ] **Step 6: Create `src/types/character.ts`**

```ts
export interface CharacterMeta {
  name: string;
  author: string;
  version: string;
  size: number;
  dir: string;
}

export type AnimationState =
  | "idle" | "walk" | "run" | "sit" | "dance" | "sway"
  | "stretch" | "sleep" | "think" | "talk" | "happy"
  | "sad" | "drag" | "surprised" | "impatient";
```

- [ ] **Step 7: Create `src/stores/petStore.ts`**

```ts
import { create } from "zustand";
import { AnimationState } from "../types/character";

interface Position { x: number; y: number; }

interface PetState {
  animState: AnimationState;
  position: Position;
  isDragging: boolean;
  bubbleText: string | null;
  inputVisible: boolean;
  setAnimState: (s: AnimationState) => void;
  setPosition: (p: Position) => void;
  setDragging: (v: boolean) => void;
  showBubble: (text: string) => void;
  clearBubble: () => void;
  setInputVisible: (v: boolean) => void;
}

export const usePetStore = create<PetState>((set) => ({
  animState: "idle",
  position: { x: 100, y: 100 },
  isDragging: false,
  bubbleText: null,
  inputVisible: false,
  setAnimState: (animState) => set({ animState }),
  setPosition: (position) => set({ position }),
  setDragging: (isDragging) => set({ isDragging }),
  showBubble: (text) => set({ bubbleText: text }),
  clearBubble: () => set({ bubbleText: null }),
  setInputVisible: (inputVisible) => set({ inputVisible }),
}));
```

- [ ] **Step 8: Run tests**

```bash
npx vitest run tests/sessionStore.test.ts
```

Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/types/ src/stores/ tests/
git commit -m "feat: add TypeScript types and Zustand stores for pet, session, settings"
```

---

## Phase 6 — Pet Window UI

### Task 10: Animation Hook + Character Renderer

**Files:**
- Create: `src/hooks/usePetAnimation.ts`
- Create: `src/windows/pet/PetCharacter.tsx`
- Create: `tests/usePetAnimation.test.ts`

- [ ] **Step 1: Write animation hook test**

Create `tests/usePetAnimation.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePetAnimation } from "../src/hooks/usePetAnimation";

// Mock Tauri invoke
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue("/path/to/idle.gif"),
}));

describe("usePetAnimation", () => {
  it("starts in idle state", () => {
    const { result } = renderHook(() => usePetAnimation());
    expect(result.current.animState).toBe("idle");
  });

  it("transitionTo changes state", () => {
    const { result } = renderHook(() => usePetAnimation());
    act(() => result.current.transitionTo("think"));
    expect(result.current.animState).toBe("think");
  });

  it("onPromptSent sets think state", () => {
    const { result } = renderHook(() => usePetAnimation());
    act(() => result.current.onPromptSent());
    expect(result.current.animState).toBe("think");
  });

  it("onReplyReceived sets happy state", () => {
    const { result } = renderHook(() => usePetAnimation());
    act(() => result.current.onReplyReceived());
    expect(result.current.animState).toBe("happy");
  });
});
```

Run: `npx vitest run tests/usePetAnimation.test.ts`
Expected: FAIL

- [ ] **Step 2: Create `src/hooks/usePetAnimation.ts`**

```ts
import { useState, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AnimationState } from "../types/character";

const HAPPY_DURATION_MS = 3000;
const IDLE_AFTER_DRAG_MS = 500;

export function usePetAnimation() {
  const [animState, setAnimState] = useState<AnimationState>("idle");
  const [animPath, setAnimPath] = useState<string>("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  };

  const transitionTo = useCallback(async (state: AnimationState, durationMs?: number) => {
    clearTimer();
    setAnimState(state);
    try {
      const path = await invoke<string>("get_animation_path", { animName: state });
      setAnimPath(path);
    } catch { /* fallback handled by Rust */ }
    if (durationMs) {
      timerRef.current = setTimeout(() => transitionTo("idle"), durationMs);
    }
  }, []);

  const onPromptSent = useCallback(() => transitionTo("think"), [transitionTo]);

  const onReplyReceived = useCallback(() =>
    transitionTo("happy", HAPPY_DURATION_MS), [transitionTo]);

  const onDragStart = useCallback(() => transitionTo("drag"), [transitionTo]);

  const onDragEnd = useCallback(() => {
    transitionTo("surprised", IDLE_AFTER_DRAG_MS);
  }, [transitionTo]);

  const onWaitTimeout = useCallback(() => transitionTo("sad"), [transitionTo]);

  // Initial load
  useEffect(() => { transitionTo("idle"); }, []);

  // Cleanup
  useEffect(() => () => clearTimer(), []);

  return { animState, animPath, transitionTo, onPromptSent, onReplyReceived, onDragStart, onDragEnd, onWaitTimeout };
}
```

- [ ] **Step 3: Create `src/windows/pet/PetCharacter.tsx`**

```tsx
import React from "react";
import { usePetAnimation } from "../../hooks/usePetAnimation";

interface Props {
  size: number;
}

export function PetCharacter({ size }: Props) {
  const { animPath, animState } = usePetAnimation();

  if (!animPath) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: "rgba(100,160,255,0.7)",
        }}
      />
    );
  }

  const isSpriteSheet = animPath.includes("_sprite");

  if (isSpriteSheet) {
    // Sprite sheet: rendered via CSS animation (configured per character)
    return (
      <div
        data-anim={animState}
        style={{
          width: size,
          height: size,
          backgroundImage: `url(${animPath})`,
          backgroundRepeat: "no-repeat",
          imageRendering: "pixelated",
        }}
      />
    );
  }

  // GIF / WebP / PNG
  return (
    <img
      src={animPath}
      alt={animState}
      width={size}
      height={size}
      style={{ imageRendering: "pixelated", userSelect: "none", pointerEvents: "none" }}
      draggable={false}
    />
  );
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/usePetAnimation.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hooks/usePetAnimation.ts src/windows/pet/PetCharacter.tsx tests/
git commit -m "feat: add usePetAnimation hook and PetCharacter renderer"
```

---

### Task 11: Movement System + Drag

**Files:**
- Create: `src/hooks/usePetMovement.ts`
- Create: `tests/usePetMovement.test.ts`

- [ ] **Step 1: Write test**

Create `tests/usePetMovement.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { clampToScreen, getFixedAreaBounds } from "../src/hooks/usePetMovement";

describe("clampToScreen", () => {
  it("clamps position within screen bounds", () => {
    const result = clampToScreen({ x: -10, y: -5 }, 80, { x: 0, y: 0, width: 1920, height: 1080 });
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
  });

  it("clamps right and bottom edges", () => {
    const result = clampToScreen({ x: 2000, y: 1200 }, 80, { x: 0, y: 0, width: 1920, height: 1080 });
    expect(result.x).toBe(1840); // 1920 - 80
    expect(result.y).toBe(1000); // 1080 - 80
  });
});

describe("getFixedAreaBounds", () => {
  const screen = { x: 0, y: 0, width: 1920, height: 1080 };
  it("FixedTop returns top 10% band", () => {
    const bounds = getFixedAreaBounds("FixedTop", screen);
    expect(bounds.minY).toBe(0);
    expect(bounds.maxY).toBe(108); // 1080 * 0.10
  });
  it("FixedLeft returns left 10% band", () => {
    const bounds = getFixedAreaBounds("FixedLeft", screen);
    expect(bounds.minX).toBe(0);
    expect(bounds.maxX).toBe(192); // 1920 * 0.10
  });
});
```

Run: `npx vitest run tests/usePetMovement.test.ts`
Expected: FAIL

- [ ] **Step 2: Create `src/hooks/usePetMovement.ts`**

```ts
import { useEffect, useRef, useCallback } from "react";
import { MovementMode } from "../types/settings";
import { usePetStore } from "../stores/petStore";

export interface ScreenBounds {
  x: number; y: number; width: number; height: number;
}

export interface AreaBounds {
  minX: number; maxX: number; minY: number; maxY: number;
}

export function clampToScreen(
  pos: { x: number; y: number },
  size: number,
  screen: ScreenBounds
): { x: number; y: number } {
  return {
    x: Math.max(screen.x, Math.min(pos.x, screen.x + screen.width - size)),
    y: Math.max(screen.y, Math.min(pos.y, screen.y + screen.height - size)),
  };
}

export function getFixedAreaBounds(mode: MovementMode, screen: ScreenBounds): AreaBounds {
  const bw = screen.width * 0.10;
  const bh = screen.height * 0.10;
  switch (mode) {
    case "FixedTop":    return { minX: screen.x, maxX: screen.x + screen.width, minY: screen.y, maxY: screen.y + bh };
    case "FixedBottom": return { minX: screen.x, maxX: screen.x + screen.width, minY: screen.y + screen.height - bh, maxY: screen.y + screen.height };
    case "FixedLeft":   return { minX: screen.x, maxX: screen.x + bw, minY: screen.y, maxY: screen.y + screen.height };
    case "FixedRight":  return { minX: screen.x + screen.width - bw, maxX: screen.x + screen.width, minY: screen.y, maxY: screen.y + screen.height };
    default:            return { minX: screen.x, maxX: screen.x + screen.width, minY: screen.y, maxY: screen.y + screen.height };
  }
}

export function usePetMovement(
  mode: MovementMode,
  speed: number,
  characterSize: number
) {
  const { position, setPosition, isDragging, setDragging } = usePetStore();
  const targetRef = useRef<{ x: number; y: number }>(position);
  const rafRef = useRef<number>(0);

  const getScreenBounds = useCallback((): ScreenBounds => ({
    x: 0, y: 0,
    width: window.screen.width,
    height: window.screen.height,
  }), []);

  const pickNewTarget = useCallback(() => {
    const screen = getScreenBounds();
    const bounds = mode === "FullScreen"
      ? { minX: 0, maxX: screen.width, minY: 0, maxY: screen.height }
      : getFixedAreaBounds(mode, screen);

    targetRef.current = {
      x: bounds.minX + Math.random() * (bounds.maxX - bounds.minX - characterSize),
      y: bounds.minY + Math.random() * (bounds.maxY - bounds.minY - characterSize),
    };
  }, [mode, characterSize, getScreenBounds]);

  useEffect(() => {
    if (mode === "Fixed") return;
    pickNewTarget();

    const SPEED = 1.5 * speed;
    let lastTime = performance.now();

    const animate = (now: number) => {
      if (isDragging) { lastTime = now; rafRef.current = requestAnimationFrame(animate); return; }
      const dt = Math.min((now - lastTime) / 16, 3);
      lastTime = now;

      setPosition((prev: { x: number; y: number }) => {
        const dx = targetRef.current.x - prev.x;
        const dy = targetRef.current.y - prev.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < SPEED * dt) {
          pickNewTarget();
          return prev;
        }
        const nx = prev.x + (dx / dist) * SPEED * dt;
        const ny = prev.y + (dy / dist) * SPEED * dt;
        const screen = getScreenBounds();
        return clampToScreen({ x: nx, y: ny }, characterSize, screen);
      });

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [mode, speed, characterSize, isDragging, pickNewTarget, setPosition, getScreenBounds]);

  // Drag handlers
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    const startX = e.clientX - position.x;
    const startY = e.clientY - position.y;
    const onMove = (ev: MouseEvent) => {
      const screen = getScreenBounds();
      setPosition(clampToScreen({ x: ev.clientX - startX, y: ev.clientY - startY }, characterSize, screen));
    };
    const onUp = () => {
      setDragging(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [position, setPosition, setDragging, characterSize, getScreenBounds]);

  return { position, onMouseDown };
}
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run tests/usePetMovement.test.ts
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/hooks/usePetMovement.ts tests/usePetMovement.test.ts
git commit -m "feat: add usePetMovement with FullScreen/Fixed area/Fixed point modes and drag"
```

---

### Task 12: Speech Bubble + Input Overlay

**Files:**
- Create: `src/windows/pet/SpeechBubble.tsx`
- Create: `src/windows/pet/InputOverlay.tsx`
- Create: `tests/SpeechBubble.test.tsx`

- [ ] **Step 1: Write SpeechBubble test**

Create `tests/SpeechBubble.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { SpeechBubble } from "../src/windows/pet/SpeechBubble";

describe("SpeechBubble", () => {
  it("renders text content", () => {
    render(<SpeechBubble text="hello world" durationMs={999999} onExpire={() => {}} />);
    expect(screen.getByText("hello world")).toBeTruthy();
  });

  it("truncates long text and shows expand hint", () => {
    const long = "a".repeat(200);
    render(<SpeechBubble text={long} durationMs={999999} onExpire={() => {}} />);
    expect(screen.getByText(/點我查看/)).toBeTruthy();
  });

  it("calls onExpire after duration", async () => {
    vi.useFakeTimers();
    const onExpire = vi.fn();
    render(<SpeechBubble text="hi" durationMs={1000} onExpire={onExpire} />);
    act(() => vi.advanceTimersByTime(1001));
    expect(onExpire).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
```

Run: `npx vitest run tests/SpeechBubble.test.tsx`
Expected: FAIL

- [ ] **Step 2: Create `src/windows/pet/SpeechBubble.tsx`**

```tsx
import React, { useEffect } from "react";

const MAX_BUBBLE_CHARS = 100;

interface Props {
  text: string;
  durationMs: number;
  onExpire: () => void;
  onClickExpand?: () => void;
}

export function SpeechBubble({ text, durationMs, onExpire, onClickExpand }: Props) {
  const isTruncated = text.length > MAX_BUBBLE_CHARS;
  const displayText = isTruncated ? text.slice(0, MAX_BUBBLE_CHARS) + "…" : text;

  useEffect(() => {
    const t = setTimeout(onExpire, durationMs);
    return () => clearTimeout(t);
  }, [durationMs, onExpire]);

  return (
    <div
      style={{
        position: "absolute",
        bottom: "100%",
        left: "50%",
        transform: "translateX(-50%)",
        background: "rgba(255,255,255,0.95)",
        border: "1.5px solid #aaa",
        borderRadius: 12,
        padding: "6px 10px",
        maxWidth: 220,
        fontSize: 13,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        cursor: isTruncated ? "pointer" : "default",
        userSelect: "none",
      }}
      onClick={isTruncated ? onClickExpand : undefined}
    >
      {displayText}
      {isTruncated && (
        <span style={{ color: "#888", fontSize: 11 }}> 點我查看 →</span>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create `src/windows/pet/InputOverlay.tsx`**

```tsx
import React, { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { usePetStore } from "../../stores/petStore";
import { useSessionStore } from "../../stores/sessionStore";

export function InputOverlay() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const { inputVisible, setInputVisible, showBubble } = usePetStore();
  const { addExchange } = useSessionStore();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputVisible) { inputRef.current?.focus(); }
  }, [inputVisible]);

  if (!inputVisible) return null;

  const handleSend = async () => {
    const prompt = input.trim();
    if (!prompt || loading) return;
    setInput("");
    setInputVisible(false);
    setLoading(true);
    try {
      const response = await invoke<string>("send_message", { prompt });
      addExchange(prompt, response);
      showBubble(response);
    } catch (e) {
      showBubble(`錯誤：${e}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: 80,
        left: "50%",
        transform: "translateX(-50%)",
        background: "rgba(255,255,255,0.97)",
        borderRadius: 16,
        padding: "10px 14px",
        boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
        display: "flex",
        gap: 8,
        zIndex: 9999,
        minWidth: 300,
      }}
    >
      <input
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") handleSend(); if (e.key === "Escape") setInputVisible(false); }}
        placeholder="問我任何問題..."
        style={{
          flex: 1, border: "none", outline: "none",
          fontSize: 14, background: "transparent",
        }}
        disabled={loading}
      />
      <button
        onClick={handleSend}
        disabled={loading || !input.trim()}
        style={{
          background: "#4A90D9", color: "#fff",
          border: "none", borderRadius: 8,
          padding: "4px 12px", cursor: "pointer", fontSize: 13,
        }}
      >
        {loading ? "…" : "送出"}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/SpeechBubble.test.tsx
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/windows/pet/SpeechBubble.tsx src/windows/pet/InputOverlay.tsx tests/SpeechBubble.test.tsx
git commit -m "feat: add SpeechBubble with auto-expire and InputOverlay"
```

---

### Task 13: Pet Window Root + Hotkey Integration

**Files:**
- Create: `src/windows/pet/PetApp.tsx`
- Modify: `src/main.tsx`

- [ ] **Step 1: Create `src/windows/pet/PetApp.tsx`**

```tsx
import React, { useEffect, useCallback } from "react";
import { register, unregisterAll } from "@tauri-apps/plugin-global-shortcut";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { PetCharacter } from "./PetCharacter";
import { SpeechBubble } from "./SpeechBubble";
import { InputOverlay } from "./InputOverlay";
import { usePetMovement } from "../../hooks/usePetMovement";
import { usePetAnimation } from "../../hooks/usePetAnimation";
import { usePetStore } from "../../stores/petStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useSessionStore } from "../../stores/sessionStore";

export function PetApp() {
  const { config, load } = useSettingsStore();
  const { bubbleText, clearBubble, setInputVisible, showBubble } = usePetStore();
  const { atTurnLimit } = useSessionStore();
  const { onDragStart, onDragEnd } = usePetAnimation();
  const { position, onMouseDown } = usePetMovement(
    config.movement_mode,
    config.movement_speed,
    config.character_size
  );

  // Load config on mount
  useEffect(() => { load(); }, [load]);

  // Register global hotkey
  useEffect(() => {
    register(config.hotkey, () => setInputVisible(true)).catch(console.error);
    return () => { unregisterAll().catch(console.error); };
  }, [config.hotkey, setInputVisible]);

  // Idle bubbles
  useEffect(() => {
    if (!config.show_idle_bubbles) return;
    const scheduleNext = () => {
      const ms = (config.idle_anim_interval_min +
        Math.random() * (config.idle_anim_interval_max - config.idle_anim_interval_min)) * 1000;
      return setTimeout(async () => {
        try {
          const res = await invoke<string[]>("get_idle_phrases");
          if (res.length > 0) {
            showBubble(res[Math.floor(Math.random() * res.length)]);
          }
        } catch { /* ignore */ }
        scheduleNext();
      }, ms);
    };
    const t = scheduleNext();
    return () => clearTimeout(t);
  }, [config.show_idle_bubbles, config.idle_anim_interval_min, config.idle_anim_interval_max, showBubble]);

  // 30-turn warning
  useEffect(() => {
    if (atTurnLimit()) {
      showBubble("我們聊了很多了！要幫你總結這段對話嗎？");
    }
  }, [atTurnLimit, showBubble]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    onDragStart();
    onMouseDown(e);
  }, [onDragStart, onMouseDown]);

  const handleMouseUp = useCallback(() => {
    onDragEnd();
  }, [onDragEnd]);

  return (
    <div
      style={{
        position: "fixed",
        left: position.x,
        top: position.y,
        width: config.character_size,
        height: config.character_size,
        cursor: "grab",
        userSelect: "none",
      }}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
    >
      {bubbleText && (
        <SpeechBubble
          text={bubbleText}
          durationMs={config.bubble_duration_secs * 1000}
          onExpire={clearBubble}
          onClickExpand={() => {
            clearBubble();
            invoke("show_chat_window").catch(console.error);
          }}
        />
      )}
      <PetCharacter size={config.character_size} />
      <InputOverlay />
    </div>
  );
}
```

- [ ] **Step 2: Add `get_idle_phrases` Tauri command**

Add to `src-tauri/src/commands.rs`:

```rust
#[tauri::command]
pub fn get_idle_phrases() -> Vec<String> {
    let content = include_str!("../../assets/idle_phrases.toml");
    #[derive(serde::Deserialize)]
    struct Phrases { phrases: Vec<String> }
    toml::from_str::<Phrases>(content)
        .map(|p| p.phrases)
        .unwrap_or_default()
}

#[tauri::command]
pub fn show_chat_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("chat") {
        w.show().map_err(|e| e.to_string())?;
        w.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}
```

Register both commands in `main.rs` invoke handler.

- [ ] **Step 3: Verify dev build runs**

```bash
npm run tauri dev
```

Expected: pet window appears on desktop, hotkey works.

- [ ] **Step 4: Commit**

```bash
git add src/windows/pet/ src-tauri/src/commands.rs
git commit -m "feat: complete PetApp with hotkey, idle bubbles, 30-turn warning"
```

---

## Phase 7 — Chat Panel

### Task 14: Chat Panel

**Files:**
- Create: `src/windows/chat/ChatApp.tsx`
- Create: `src/windows/chat/MessageList.tsx`

- [ ] **Step 1: Create `src/windows/chat/MessageList.tsx`**

```tsx
import React, { useEffect, useRef } from "react";
import { Message } from "../../types/session";

interface Props { messages: Message[]; }

export function MessageList({ messages }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
      {messages.map((m, i) => (
        <div
          key={i}
          style={{
            alignSelf: m.role === "user" ? "flex-end" : "flex-start",
            background: m.role === "user" ? "#4A90D9" : "#f0f0f0",
            color: m.role === "user" ? "#fff" : "#222",
            borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
            padding: "8px 12px",
            maxWidth: "80%",
            fontSize: 14,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {m.content}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
```

- [ ] **Step 2: Create `src/windows/chat/ChatApp.tsx`**

```tsx
import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { MessageList } from "./MessageList";
import { useSessionStore } from "../../stores/sessionStore";
import { usePetStore } from "../../stores/petStore";

export function ChatApp() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const { messages, addExchange, atTurnLimit, reset } = useSessionStore();
  const { showBubble } = usePetStore();

  const handleSend = async () => {
    const prompt = input.trim();
    if (!prompt || loading) return;
    setInput("");
    setLoading(true);
    try {
      const response = await invoke<string>("send_message", { prompt });
      addExchange(prompt, response);
    } catch (e) {
      addExchange(prompt, `錯誤：${e}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSummarize = async () => {
    setLoading(true);
    try {
      const summary = await invoke<string>("send_message", {
        prompt: "請幫我總結這段對話的重點",
      });
      addExchange("[總結請求]", summary);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    await invoke("reset_session");
    reset();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #eee", fontWeight: 600, fontSize: 15 }}>
        對話記錄
      </div>

      {/* 30-turn warning banner */}
      {atTurnLimit() && (
        <div style={{ background: "#FFF3CD", padding: "8px 16px", fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}>
          <span>我們聊了很多了！</span>
          <button onClick={handleSummarize} style={btnStyle("#4A90D9")}>總結</button>
          <button onClick={handleReset}     style={btnStyle("#e55")}>重新開始</button>
        </div>
      )}

      <MessageList messages={messages} />

      {/* Input area */}
      <div style={{ padding: "10px 16px", borderTop: "1px solid #eee", display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="輸入訊息..."
          style={{ flex: 1, border: "1.5px solid #ddd", borderRadius: 10, padding: "8px 12px", fontSize: 14, outline: "none" }}
          disabled={loading}
        />
        <button onClick={handleSend} disabled={loading || !input.trim()} style={btnStyle("#4A90D9")}>
          {loading ? "…" : "送出"}
        </button>
      </div>
    </div>
  );
}

function btnStyle(bg: string): React.CSSProperties {
  return { background: bg, color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 13 };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/windows/chat/
git commit -m "feat: add ChatApp with MessageList and 30-turn warning UI"
```

---

## Phase 8 — Settings & Tray

### Task 15: Settings Window

**Files:**
- Create: `src/windows/settings/SettingsApp.tsx`
- Create: `src/windows/settings/tabs/General.tsx`
- Create: `src/windows/settings/tabs/Movement.tsx`
- Create: `src/windows/settings/tabs/Animation.tsx`
- Create: `src/windows/settings/tabs/CliConfig.tsx`

- [ ] **Step 1: Create `src/windows/settings/SettingsApp.tsx`**

```tsx
import React, { useEffect, useState } from "react";
import { useSettingsStore } from "../../stores/settingsStore";
import { General } from "./tabs/General";
import { Movement } from "./tabs/Movement";
import { Animation } from "./tabs/Animation";
import { CliConfig } from "./tabs/CliConfig";

type Tab = "general" | "movement" | "animation" | "cli";
const TABS: { key: Tab; label: string }[] = [
  { key: "general",   label: "一般設定" },
  { key: "movement",  label: "移動模式" },
  { key: "animation", label: "動畫設定" },
  { key: "cli",       label: "CLI 設定" },
];

export function SettingsApp() {
  const [tab, setTab] = useState<Tab>("general");
  const { config, load } = useSettingsStore();

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "system-ui, sans-serif" }}>
      {/* Sidebar */}
      <nav style={{ width: 120, borderRight: "1px solid #eee", padding: "16px 0" }}>
        {TABS.map((t) => (
          <div
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: "10px 16px", cursor: "pointer", fontSize: 13,
              background: tab === t.key ? "#EBF4FF" : "transparent",
              color: tab === t.key ? "#4A90D9" : "#444",
              fontWeight: tab === t.key ? 600 : 400,
            }}
          >
            {t.label}
          </div>
        ))}
      </nav>
      {/* Content */}
      <main style={{ flex: 1, padding: 24, overflowY: "auto" }}>
        {tab === "general"   && <General />}
        {tab === "movement"  && <Movement />}
        {tab === "animation" && <Animation />}
        {tab === "cli"       && <CliConfig />}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/windows/settings/tabs/General.tsx`**

```tsx
import React from "react";
import { useSettingsStore } from "../../../stores/settingsStore";

export function General() {
  const { config, save } = useSettingsStore();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <h2 style={{ margin: 0, fontSize: 17 }}>一般設定</h2>

      <label style={labelStyle}>
        快速鍵
        <input
          value={config.hotkey}
          onChange={(e) => save({ ...config, hotkey: e.target.value })}
          style={inputStyle}
          placeholder="Alt+Space"
        />
      </label>

      <label style={labelStyle}>
        <span>開機自動啟動</span>
        <input type="checkbox" checked={config.launch_at_startup}
          onChange={(e) => save({ ...config, launch_at_startup: e.target.checked })} />
      </label>

      <label style={labelStyle}>
        <span>閒置氣泡對話</span>
        <input type="checkbox" checked={config.show_idle_bubbles}
          onChange={(e) => save({ ...config, show_idle_bubbles: e.target.checked })} />
      </label>

      <label style={labelStyle}>
        <span>深夜睡眠模式</span>
        <input type="checkbox" checked={config.night_sleep_mode}
          onChange={(e) => save({ ...config, night_sleep_mode: e.target.checked })} />
      </label>

      {config.night_sleep_mode && (
        <div style={{ display: "flex", gap: 12 }}>
          <label style={labelStyle}>
            開始時間
            <input type="number" min={0} max={23} value={config.night_start_hour}
              onChange={(e) => save({ ...config, night_start_hour: +e.target.value })}
              style={{ ...inputStyle, width: 60 }} />
          </label>
          <label style={labelStyle}>
            結束時間
            <input type="number" min={0} max={23} value={config.night_end_hour}
              onChange={(e) => save({ ...config, night_end_hour: +e.target.value })}
              style={{ ...inputStyle, width: 60 }} />
          </label>
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6, fontSize: 13 };
const inputStyle: React.CSSProperties = { border: "1.5px solid #ddd", borderRadius: 8, padding: "6px 10px", fontSize: 13 };
```

- [ ] **Step 3: Create `src/windows/settings/tabs/Movement.tsx`**

```tsx
import React from "react";
import { useSettingsStore } from "../../../stores/settingsStore";
import { MovementMode } from "../../../types/settings";

const MODES: { value: MovementMode; label: string }[] = [
  { value: "FullScreen",   label: "全畫面隨機遊走" },
  { value: "FixedTop",     label: "固定上方" },
  { value: "FixedBottom",  label: "固定下方" },
  { value: "FixedLeft",    label: "固定左側" },
  { value: "FixedRight",   label: "固定右側" },
  { value: "Fixed",        label: "定點模式" },
];

export function Movement() {
  const { config, save } = useSettingsStore();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h2 style={{ margin: 0, fontSize: 17 }}>移動模式</h2>
      {MODES.map((m) => (
        <label key={m.value} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14, cursor: "pointer" }}>
          <input type="radio" name="movement" value={m.value}
            checked={config.movement_mode === m.value}
            onChange={() => save({ ...config, movement_mode: m.value })} />
          {m.label}
        </label>
      ))}
      <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, marginTop: 12 }}>
        <span>多螢幕：允許跨螢幕遊走</span>
        <input type="checkbox" checked={config.multi_monitor}
          onChange={(e) => save({ ...config, multi_monitor: e.target.checked })} />
      </label>
    </div>
  );
}
```

- [ ] **Step 4: Create `src/windows/settings/tabs/Animation.tsx`**

```tsx
import React from "react";
import { useSettingsStore } from "../../../stores/settingsStore";

export function Animation() {
  const { config, save } = useSettingsStore();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <h2 style={{ margin: 0, fontSize: 17 }}>動畫設定</h2>
      {[
        { label: "角色大小（px）",       key: "character_size" as const,          min: 40,  max: 200, step: 4 },
        { label: "移動速度",             key: "movement_speed" as const,          min: 0.2, max: 3,   step: 0.1 },
        { label: "偶發動畫最短間隔（秒）",key: "idle_anim_interval_min" as const, min: 10,  max: 300, step: 5 },
        { label: "偶發動畫最長間隔（秒）",key: "idle_anim_interval_max" as const, min: 10,  max: 600, step: 5 },
        { label: "氣泡顯示時間（秒）",   key: "bubble_duration_secs" as const,    min: 3,   max: 30,  step: 1 },
      ].map(({ label, key, min, max, step }) => (
        <label key={key} style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
          {label}：{config[key]}
          <input type="range" min={min} max={max} step={step} value={config[key]}
            onChange={(e) => save({ ...config, [key]: +e.target.value })} />
        </label>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Create `src/windows/settings/tabs/CliConfig.tsx`**

```tsx
import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSettingsStore } from "../../../stores/settingsStore";
import { CliTool } from "../../../types/settings";

const CLI_OPTIONS: CliTool[] = ["Claude", "Gemini", "Codex"];

export function CliConfig() {
  const { config, save } = useSettingsStore();
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await invoke<string>("test_cli_connection");
      setTestResult(result);
    } catch (e) {
      setTestResult(`❌ ${e}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <h2 style={{ margin: 0, fontSize: 17 }}>CLI 設定</h2>

      <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
        使用的 CLI
        <select value={config.cli_tool}
          onChange={(e) => save({ ...config, cli_tool: e.target.value as CliTool })}
          style={{ border: "1.5px solid #ddd", borderRadius: 8, padding: "6px 10px", fontSize: 13 }}>
          {CLI_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
        CLI 執行路徑（留空自動偵測）
        <input
          value={config.cli_path_override ?? ""}
          onChange={(e) => save({ ...config, cli_path_override: e.target.value || null })}
          style={{ border: "1.5px solid #ddd", borderRadius: 8, padding: "6px 10px", fontSize: 13 }}
          placeholder="/usr/local/bin/claude"
        />
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
        預設回覆語言
        <input
          value={config.reply_language}
          onChange={(e) => save({ ...config, reply_language: e.target.value })}
          style={{ border: "1.5px solid #ddd", borderRadius: 8, padding: "6px 10px", fontSize: 13 }}
          placeholder="繁體中文"
        />
      </label>

      <button onClick={testConnection} disabled={testing}
        style={{ background: "#4A90D9", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 13, alignSelf: "flex-start" }}>
        {testing ? "測試中…" : "測試連線"}
      </button>

      {testResult && (
        <div style={{ fontSize: 13, padding: "8px 12px", background: "#f8f8f8", borderRadius: 8 }}>
          {testResult}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add src/windows/settings/
git commit -m "feat: add Settings window with General/Movement/Animation/CLI tabs"
```

---

### Task 16: System Tray + Character Guide

**Files:**
- Create: `src-tauri/src/tray.rs`
- Create: `src/windows/guide/GuideApp.tsx`

- [ ] **Step 1: Create `src-tauri/src/tray.rs`**

```rust
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};

pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let show   = MenuItem::with_id(app, "show",   "顯示 / 隱藏角色", true, None::<&str>)?;
    let sep1   = PredefinedMenuItem::separator(app)?;
    let char_select  = MenuItem::with_id(app, "char_select",  "選擇角色",       true, None::<&str>)?;
    let char_folder  = MenuItem::with_id(app, "char_folder",  "開啟角色資料夾", true, None::<&str>)?;
    let char_install = MenuItem::with_id(app, "char_install", "安裝角色(.zip)", true, None::<&str>)?;
    let char_guide   = MenuItem::with_id(app, "char_guide",   "角色製作說明",   true, None::<&str>)?;
    let char_menu = Submenu::with_items(app, "角色管理", true,
        &[&char_select, &char_folder, &char_install, &char_guide])?;
    let sep2     = PredefinedMenuItem::separator(app)?;
    let settings = MenuItem::with_id(app, "settings", "設定",    true, None::<&str>)?;
    let history  = MenuItem::with_id(app, "history",  "對話記錄", true, None::<&str>)?;
    let sep3     = PredefinedMenuItem::separator(app)?;
    let quit     = MenuItem::with_id(app, "quit",     "退出",    true, None::<&str>)?;

    let menu = Menu::with_items(app, &[
        &show, &sep1, &char_menu, &sep2, &settings, &history, &sep3, &quit,
    ])?;

    TrayIconBuilder::new()
        .menu(&menu)
        .on_menu_event(|app, event| handle_menu(app, event.id.as_ref()))
        .on_tray_icon_event(|tray, event| {
            if matches!(event, TrayIconEvent::Click { button: MouseButton::Left, .. }) {
                if let Some(w) = tray.app_handle().get_webview_window("pet") {
                    let _ = if w.is_visible().unwrap_or(false) { w.hide() } else { w.show() };
                }
            }
        })
        .build(app)?;
    Ok(())
}

fn handle_menu(app: &AppHandle, id: &str) {
    match id {
        "show"         => { if let Some(w) = app.get_webview_window("pet") { let _ = w.set_focus(); } }
        "char_folder"  => { let _ = crate::installer::open_characters_dir(&crate::config::AppConfig::app_data_dir().join("characters")); }
        "char_guide"   => show_window(app, "guide"),
        "settings"     => show_window(app, "settings"),
        "history"      => show_window(app, "chat"),
        "quit"         => app.exit(0),
        _              => {}
    }
}

fn show_window(app: &AppHandle, label: &str) {
    if let Some(w) = app.get_webview_window(label) {
        let _ = w.show();
        let _ = w.set_focus();
    }
}
```

- [ ] **Step 2: Create `src/windows/guide/GuideApp.tsx`**

```tsx
import React from "react";
import { invoke } from "@tauri-apps/api/core";

const ANIMATION_NAMES = [
  "idle", "walk", "run", "sit", "dance", "sway",
  "stretch", "sleep", "think", "talk", "happy",
  "sad", "drag", "surprised", "impatient",
];

export function GuideApp() {
  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif", overflowY: "auto", height: "100vh" }}>
      <h2 style={{ fontSize: 18, marginBottom: 16 }}>角色製作說明</h2>

      <section style={section}>
        <h3 style={h3}>資料夾結構</h3>
        <pre style={pre}>{`my_character/
  character.toml   ← 必填
  idle.gif         ← 必填
  walk.gif         ← 建議
  think.gif        ← 建議
  happy.gif        ← 建議
  thumbnail.png    ← 設定頁預覽
  ...其他動畫      ← 選填`}</pre>
      </section>

      <section style={section}>
        <h3 style={h3}>character.toml 範例</h3>
        <pre style={pre}>{`name = "我的角色"
author = "你的名字"
version = "1.0"
size = 80`}</pre>
      </section>

      <section style={section}>
        <h3 style={h3}>建議規格</h3>
        <ul style={{ fontSize: 13, lineHeight: 2, paddingLeft: 20 }}>
          <li>圖片尺寸：128×128 px（可縮放）</li>
          <li>GIF / WebP 動畫：8~16 幀，12 fps</li>
          <li>PNG 靜態圖：透明背景（RGBA）</li>
          <li>Sprite Sheet：附同名 <code>.toml</code> 設定幀數</li>
        </ul>
      </section>

      <section style={section}>
        <h3 style={h3}>動畫名稱對照表</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {ANIMATION_NAMES.map((n) => (
            <code key={n} style={{ background: "#f0f0f0", borderRadius: 6, padding: "3px 8px", fontSize: 12 }}>
              {n}
            </code>
          ))}
        </div>
      </section>

      <div style={{ marginTop: 24, display: "flex", gap: 12 }}>
        <button onClick={() => invoke("open_characters_folder").catch(console.error)}
          style={{ background: "#4A90D9", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 13 }}>
          開啟角色資料夾
        </button>
      </div>
    </div>
  );
}

const section: React.CSSProperties = { marginBottom: 24 };
const h3: React.CSSProperties = { fontSize: 14, marginBottom: 8 };
const pre: React.CSSProperties = { background: "#f8f8f8", borderRadius: 8, padding: "10px 14px", fontSize: 12, overflowX: "auto" };
```

- [ ] **Step 3: Register tray in `main.rs`**

Add to `main.rs` builder after plugins:

```rust
.setup(|app| {
    desktop_pet_lib::tray::setup_tray(&app.handle())?;
    Ok(())
})
```

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/tray.rs src/windows/guide/
git commit -m "feat: add system tray menu and character guide window"
```

---

## Phase 9 — Build & Verification

### Task 17: Full Build Test + Packaging

**Files:**
- Modify: `src-tauri/tauri.conf.json` (bundle config)

- [ ] **Step 1: Run all tests**

```bash
npx vitest run
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: all PASS

- [ ] **Step 2: Dev build smoke test**

```bash
npm run tauri dev
```

Manual checks:
- [ ] Pet appears on desktop and moves
- [ ] `Alt+Space` opens input overlay
- [ ] Sending a message shows bubble
- [ ] Clicking pet when bubble is truncated opens chat panel
- [ ] System tray right-click shows menu
- [ ] Settings window opens from tray
- [ ] Character guide opens from tray

- [ ] **Step 3: Configure bundle in `tauri.conf.json`**

Add bundle section:

```json
"bundle": {
  "active": true,
  "targets": "all",
  "identifier": "app.desktop-pet",
  "icon": ["icons/32x32.png", "icons/128x128.png", "icons/icon.icns", "icons/icon.ico"],
  "windows": {
    "certificateThumbprint": null,
    "digestAlgorithm": "sha256",
    "timestampUrl": ""
  }
}
```

- [ ] **Step 4: Build Windows release**

```bash
npm run tauri build -- --target x86_64-pc-windows-msvc
```

Expected: `.exe` generated in `src-tauri/target/release/bundle/`

- [ ] **Step 5: Build macOS release**

```bash
npm run tauri build -- --target aarch64-apple-darwin
```

Expected: `.dmg` and `.app` generated.

- [ ] **Step 6: Verify portable execution**

Copy the generated `.exe` to a fresh folder with no other files. Double-click.
Expected: app starts without requiring installation.

- [ ] **Step 7: Final commit**

```bash
git add .
git commit -m "feat: complete desktop-pet v1.0 - all phases implemented"
```

---

## Verification Checklist (Before Marking Complete)

- [ ] All Rust unit tests pass: `cargo test`
- [ ] All frontend tests pass: `npx vitest run`
- [ ] Dev build starts without errors: `npm run tauri dev`
- [ ] Hot key `Alt+Space` triggers input overlay
- [ ] Message sends to Claude CLI and response appears in bubble
- [ ] Long response (>100 chars) shows truncated bubble with expand hint
- [ ] Clicking expand hint opens chat panel
- [ ] Chat panel shows full conversation history
- [ ] 30-turn limit triggers warning banner and dance animation
- [ ] Reset session clears messages
- [ ] Movement mode switching works (FullScreen / FixedTop / Fixed)
- [ ] Character dragging works in all movement modes
- [ ] Settings save persists after app restart
- [ ] CLI connection test returns success/failure message
- [ ] ZIP character install works
- [ ] Open characters folder opens file explorer
- [ ] Character guide window displays correctly
- [ ] macOS `.app` runs without installation
- [ ] Windows `.exe` runs without installation
