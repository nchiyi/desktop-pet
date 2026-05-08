use crate::adapters::{
    claude::ClaudeAdapter, gemini::GeminiAdapter, codex::CodexAdapter,
    CliAdapter, Message,
};
use crate::character::CharacterMeta;
use crate::config::{AppConfig, CliTool};
use crate::installer::{install_zip, open_characters_dir};
use crate::session::Session;
use std::path::PathBuf;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicI32, AtomicU64, Ordering};
use tauri::{Emitter, Manager, State};

pub struct AppState {
    pub config: Mutex<AppConfig>,
    pub session: Mutex<Session>,
    pub adapter: Mutex<Option<Box<dyn CliAdapter>>>,
    /// Bumped whenever the cached adapter must be considered invalid
    /// (cli_tool / cli_path_override changed, or session reset).
    /// `send_message` snapshots this before the blocking CLI call and discards
    /// the in-flight adapter on completion if the value moved — preventing the
    /// "stale adapter survives a config change" race.
    pub adapter_gen: AtomicU64,
    /// Serializes overlapping `send_message` calls so we never produce two
    /// independent adapters that would split the conversational session.
    pub send_lock: tokio::sync::Mutex<()>,
    /// True while a CLI invocation is in flight. The cursor tracker checks
    /// this and backs off its 50 ms AppKit dispatch loop to 500 ms so the
    /// main thread is not flooded with `set_ignore_cursor_events` calls
    /// while the user is also opening / closing other windows.
    pub cli_busy: AtomicBool,
    // Character position for cursor-event click-through tracking
    pub char_x: AtomicI32,
    pub char_y: AtomicI32,
    pub char_size: AtomicI32,
    pub input_visible: AtomicBool,
    // Primary monitor work-area in logical CSS pixels (excludes Dock / Menu Bar)
    // Stored after setup so JS can fetch accurate movement bounds.
    pub work_x: AtomicI32,
    pub work_y: AtomicI32,
    pub work_w: AtomicI32,
    pub work_h: AtomicI32,
}

impl AppState {
    pub fn new() -> Self {
        let config = AppConfig::load_or_default(&AppConfig::config_path());
        Self {
            config: Mutex::new(config),
            session: Mutex::new(Session::new(timestamp_id())),
            adapter: Mutex::new(None),
            adapter_gen: AtomicU64::new(0),
            send_lock: tokio::sync::Mutex::new(()),
            cli_busy: AtomicBool::new(false),
            char_x: AtomicI32::new(100),
            char_y: AtomicI32::new(100),
            char_size: AtomicI32::new(80),
            input_visible: AtomicBool::new(false),
            // Sensible fallback; overwritten in setup once the real monitor is known
            work_x: AtomicI32::new(0),
            work_y: AtomicI32::new(0),
            work_w: AtomicI32::new(1440),
            work_h: AtomicI32::new(900),
        }
    }
}

/// RAII guard that flips `AppState.cli_busy` true on construction and false
/// on drop. Used by `send_message` so the cursor tracker can detect an
/// in-flight CLI call and back off its AppKit-dispatch cadence — preventing
/// main-thread starvation that would otherwise stall window-close clicks
/// in other open windows during the 5–30 s CLI run.
struct CliBusyGuard<'a>(&'a AtomicBool);

impl<'a> CliBusyGuard<'a> {
    fn new(flag: &'a AtomicBool) -> Self {
        flag.store(true, Ordering::Release);
        Self(flag)
    }
}

impl<'a> Drop for CliBusyGuard<'a> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

fn timestamp_id() -> String {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .to_string()
}

#[tauri::command]
pub fn get_config(state: State<AppState>) -> AppConfig {
    state.config.lock().unwrap().clone()
}

#[tauri::command]
pub fn save_config(
    app: tauri::AppHandle,
    state: State<AppState>,
    config: AppConfig,
) -> Result<(), String> {
    config.save(&AppConfig::config_path()).map_err(|e| e.to_string())?;

    // Detect which fields actually changed so we only invalidate the adapter
    // (expensive — Codex ACP runner re-handshake) when CLI selection moved.
    let cli_changed;
    let aot_changed;
    {
        let mut cur = state.config.lock().unwrap();
        cli_changed = cur.cli_tool != config.cli_tool
            || cur.cli_path_override != config.cli_path_override;
        aot_changed = cur.always_on_top != config.always_on_top;
        *cur = config.clone();
    }
    if cli_changed {
        *state.adapter.lock().unwrap() = None;
        // Bump generation so any in-flight send_message discards its adapter
        // when it returns rather than writing a stale one back into the slot.
        state.adapter_gen.fetch_add(1, Ordering::Release);
    }
    // Rebuild tray so hotkey hint stays current
    let sys_lang = crate::i18n::detect_system_lang();
    let lang = crate::i18n::lang_from_str(&config.language, &sys_lang);
    let _ = crate::tray::rebuild_tray(&app, &lang, &config.hotkey);
    // Apply always-on-top preference and notify pet window
    if let Some(pet) = app.get_webview_window("pet") {
        let _ = pet.set_always_on_top(config.always_on_top);
        let _ = pet.emit("config-updated", ());
    }
    // Mirror always-on-top onto any visible secondary window so they don't
    // fall behind the floating pet layer (or stay floating when pet doesn't).
    if aot_changed {
        for label in ["chat", "settings", "guide"] {
            if let Some(w) = app.get_webview_window(label) {
                if w.is_visible().unwrap_or(false) {
                    let _ = w.set_always_on_top(config.always_on_top);
                }
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn send_message(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    prompt: String,
) -> Result<String, String> {
    // Serialize overlapping send_message calls — without this, two simultaneous
    // sends would each take the adapter from the slot, build a *second* one,
    // and the later writer wins, silently discarding one adapter's session.
    let _send_guard = state.send_lock.lock().await;

    // Mark the app as CLI-busy so the cursor tracker backs off its 50 ms
    // AppKit dispatch loop. Without this, the cursor tracker keeps issuing
    // sync dispatches to the main thread, which compete with window-close
    // events from other open windows and make them feel unresponsive.
    let _cli_busy = CliBusyGuard::new(&state.cli_busy);

    // Snapshot generation so we can detect if config / session was reset while
    // the CLI was running and abandon the in-flight adapter rather than write
    // it back into the slot stale.
    let gen_snapshot = state.adapter_gen.load(Ordering::Acquire);

    let config = state.config.lock().unwrap().clone();
    let history: Vec<Message> = state.session.lock().unwrap().messages().to_vec();
    let prefixed_prompt = format!("請用{}回覆：{}", config.reply_language, prompt);

    // Take ownership of the cached adapter (or lazy-init a new one) so we can
    // move it into the blocking task.
    let adapter_box: Box<dyn CliAdapter> = {
        let mut guard = state.adapter.lock().unwrap();
        if let Some(a) = guard.take() {
            a
        } else {
            let path_override = config.cli_path_override.as_ref().map(PathBuf::from);
            match config.cli_tool {
                CliTool::Claude => Box::new(
                    ClaudeAdapter::new(path_override).map_err(|e| e.to_string())?,
                ),
                CliTool::Gemini => Box::new(
                    GeminiAdapter::new(path_override).map_err(|e| e.to_string())?,
                ),
                CliTool::Codex => Box::new(
                    CodexAdapter::new(path_override).map_err(|e| e.to_string())?,
                ),
            }
        }
    };

    // Run the blocking Command::output() call on the dedicated blocking pool
    // — never on the async executor or the macOS main thread. Without this the
    // WebView's main thread can stall during long CLI runs and macOS shows the
    // spinning beach ball cursor.
    let join = tauri::async_runtime::spawn_blocking(move || {
        let mut adapter = adapter_box;
        let res = adapter.send_prompt(&history, &prefixed_prompt);
        (adapter, res)
    });
    let (returned_adapter, send_result) = join.await.map_err(|e| e.to_string())?;

    // Only return the adapter to the cache if config/session is unchanged.
    // Otherwise the adapter carries stale tool / session linkage and would
    // silently override the user's reset/switch.
    if state.adapter_gen.load(Ordering::Acquire) == gen_snapshot {
        *state.adapter.lock().unwrap() = Some(returned_adapter);
    }
    // else: drop the adapter; next call lazy-rebuilds.

    let response = send_result.map_err(|e| e.to_string())?;

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

    // Notify every window so each has the chance to re-fetch the canonical
    // session from Rust. Without this, pet/chat windows hold divergent histories
    // because each window has its own JS context and store.
    let _ = app.emit("session-updated", ());

    Ok(response)
}

#[tauri::command]
pub fn get_session(state: State<AppState>) -> Session {
    state.session.lock().unwrap().clone()
}

#[tauri::command]
pub fn reset_session(app: tauri::AppHandle, state: State<AppState>) {
    {
        let mut session = state.session.lock().unwrap();
        let mut adapter = state.adapter.lock().unwrap();
        if let Some(a) = adapter.as_mut() {
            a.reset();
        }
        *session = Session::new(timestamp_id());
    }
    // Bump generation so any send_message currently holding an adapter via
    // take() will discard it on completion rather than restore the now-stale
    // session-bound adapter into the slot.
    state.adapter_gen.fetch_add(1, Ordering::Release);
    let _ = app.emit("session-updated", ());
}

#[tauri::command]
pub async fn test_cli_connection(state: State<'_, AppState>) -> Result<String, String> {
    let config = state.config.lock().unwrap().clone();
    let path_override = config.cli_path_override.as_ref().map(PathBuf::from);
    let mut adapter: Box<dyn CliAdapter> = match config.cli_tool {
        CliTool::Claude => Box::new(
            ClaudeAdapter::new(path_override).map_err(|e| e.to_string())?,
        ),
        CliTool::Gemini => Box::new(
            GeminiAdapter::new(path_override).map_err(|e| e.to_string())?,
        ),
        CliTool::Codex => Box::new(
            CodexAdapter::new(path_override).map_err(|e| e.to_string())?,
        ),
    };
    let name = adapter.name().to_string();

    // Same reasoning as send_message: run CLI on the blocking pool, never on
    // the async executor / main thread.
    let join = tauri::async_runtime::spawn_blocking(move || {
        adapter.send_prompt(&[], "請回覆 OK")
    });
    join.await.map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
    Ok(format!("✅ 連線成功（{}）", name))
}

#[tauri::command]
pub fn list_characters(_state: State<AppState>) -> Vec<CharacterMeta> {
    let characters_dir = AppConfig::app_data_dir().join("characters");
    CharacterMeta::list_available(&characters_dir)
}

#[tauri::command]
pub fn install_character_zip(zip_path: String, _state: State<AppState>) -> Result<(), String> {
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
    use base64::{Engine as _, engine::general_purpose::STANDARD};

    let config = state.config.lock().unwrap();
    let characters_dir = AppConfig::app_data_dir().join("characters");
    let char_dir = characters_dir.join(&config.active_character);
    drop(config);

    let path = if let Ok(meta) = CharacterMeta::load(&char_dir) {
        meta.animation_path(&anim_name)
    } else {
        return String::new();
    };

    let ext = path.extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_lowercase();
    let mime = match ext.as_str() {
        "gif"  => "image/gif",
        "webp" => "image/webp",
        _      => "image/png",
    };

    match std::fs::read(&path) {
        Ok(bytes) => format!("data:{};base64,{}", mime, STANDARD.encode(&bytes)),
        Err(_)    => String::new(),
    }
}

#[tauri::command]
pub fn get_idle_phrases() -> Vec<String> {
    let content = include_str!("../../assets/idle_phrases.toml");
    #[derive(serde::Deserialize)]
    struct Phrases { phrases: Vec<String> }
    toml::from_str::<Phrases>(content)
        .map(|p| p.phrases)
        .unwrap_or_default()
}

/// Toggle the pet window visibility — bound to `config.toggle_hotkey` so the
/// user can quickly hide / restore the character with a global shortcut.
/// Mirror of the tray-icon left-click behavior.
#[tauri::command]
pub fn toggle_pet_visibility(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("pet") {
        let visible = w.is_visible().unwrap_or(false);
        let _ = if visible { w.hide() } else { w.show() };
    }
}

#[tauri::command]
pub fn show_chat_window(app: tauri::AppHandle, state: State<AppState>) -> Result<(), String> {
    // Same reasoning as tray::show_window: mirror the user's always_on_top
    // setting so the chat window only floats when the pet is also floating.
    let aot = state.config.lock().unwrap().always_on_top;
    if let Some(w) = app.get_webview_window("chat") {
        let _ = w.set_always_on_top(aot);
        w.show().map_err(|e| e.to_string())?;
        let _ = w.unminimize();
        w.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn set_language(
    app: tauri::AppHandle,
    state: State<AppState>,
    language: String,
) -> Result<String, String> {
    let mut cfg = state.config.lock().unwrap();
    cfg.language = language.clone();
    cfg.save(&AppConfig::config_path()).map_err(|e| e.to_string())?;
    drop(cfg);

    let system_lang = crate::i18n::detect_system_lang();
    let lang = crate::i18n::lang_from_str(&language, &system_lang);
    let hotkey = state.config.lock().unwrap().hotkey.clone();
    crate::tray::rebuild_tray(&app, &lang, &hotkey).map_err(|e| e.to_string())?;
    crate::app_menu::setup_app_menu(&app, &lang).map_err(|e| e.to_string())?;

    // 回傳實際套用的語言碼
    let code = match lang {
        crate::i18n::Lang::ZhTW => "zh-TW",
        crate::i18n::Lang::En => "en",
    };
    Ok(code.to_string())
}

/// Called by frontend whenever character position changes.
/// Rust cursor-tracker thread uses this to decide click-through state.
#[tauri::command]
pub fn update_char_pos(state: State<'_, AppState>, x: i32, y: i32, size: i32) {
    state.char_x.store(x, Ordering::Relaxed);
    state.char_y.store(y, Ordering::Relaxed);
    state.char_size.store(size, Ordering::Relaxed);
}

/// Called by frontend when input overlay opens/closes.
/// When visible, click-through is always disabled so user can type.
#[tauri::command]
pub fn set_input_visible(
    state: State<'_, AppState>,
    window: tauri::WebviewWindow,
    visible: bool,
) {
    // Release ordering so the cursor-tracker thread (Acquire load) sees this before
    // it can re-enable click-through between store and set_focus.
    state.input_visible.store(visible, Ordering::Release);
    let _ = window.set_ignore_cursor_events(!visible);
    if visible {
        // Hotkey path: pet may have been hidden via the tray-icon toggle.
        // Force it visible so the overlay actually appears for the user.
        if !window.is_visible().unwrap_or(true) {
            let _ = window.show();
        }
        // Bring window to front and grab keyboard focus for the input overlay
        let _ = window.set_focus();
    }
}

/// Returns the primary monitor's work-area in logical CSS pixels so the
/// JS movement system can keep the character inside the usable screen area
/// (excluding the Dock and Menu Bar).
#[derive(serde::Serialize)]
pub struct ScreenInfo {
    pub work_x: i32,
    pub work_y: i32,
    pub work_w: i32,
    pub work_h: i32,
}

#[tauri::command]
pub fn get_screen_info(state: State<'_, AppState>) -> ScreenInfo {
    ScreenInfo {
        work_x: state.work_x.load(Ordering::Relaxed),
        work_y: state.work_y.load(Ordering::Relaxed),
        work_w: state.work_w.load(Ordering::Relaxed),
        work_h: state.work_h.load(Ordering::Relaxed),
    }
}

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
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_file_name(&default_name)
        .add_filter("Text", &["txt"])
        .save_file(move |path| { let _ = tx.send(path); });
    let path = rx.await.map_err(|e| e.to_string())?;
    let Some(path) = path else { return Ok(()); };
    let path = path.into_path().map_err(|e| e.to_string())?;
    std::fs::write(path, content).map_err(|e| e.to_string())
}
