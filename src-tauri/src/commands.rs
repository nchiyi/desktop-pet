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
use tauri::{Manager, State};

pub struct AppState {
    pub config: Mutex<AppConfig>,
    pub session: Mutex<Session>,
    pub adapter: Mutex<Option<Box<dyn CliAdapter>>>,
}

impl AppState {
    pub fn new() -> Self {
        let config = AppConfig::load_or_default(&AppConfig::config_path());
        Self {
            config: Mutex::new(config),
            session: Mutex::new(Session::new(timestamp_id())),
            adapter: Mutex::new(None),
        }
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
pub fn save_config(state: State<AppState>, config: AppConfig) -> Result<(), String> {
    config.save(&AppConfig::config_path()).map_err(|e| e.to_string())?;
    *state.config.lock().unwrap() = config;
    Ok(())
}

#[tauri::command]
pub fn send_message(state: State<AppState>, prompt: String) -> Result<String, String> {
    let config = state.config.lock().unwrap().clone();
    let mut adapter_guard = state.adapter.lock().unwrap();

    // Lazy-init adapter
    if adapter_guard.is_none() {
        let path_override = config.cli_path_override.as_ref().map(PathBuf::from);
        let adapter: Box<dyn CliAdapter> = match config.cli_tool {
            CliTool::Claude => Box::new(
                ClaudeAdapter::new(path_override).map_err(|e| e.to_string())?
            ),
            CliTool::Gemini => Box::new(
                GeminiAdapter::new(path_override).map_err(|e| e.to_string())?
            ),
            CliTool::Codex => Box::new(
                CodexAdapter::new(path_override).map_err(|e| e.to_string())?
            ),
        };
        *adapter_guard = Some(adapter);
    }

    let mut session = state.session.lock().unwrap();
    let history: Vec<Message> = session.messages().to_vec();
    let prefixed_prompt = format!("請用{}回覆：{}", config.reply_language, prompt);

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
pub fn get_session(state: State<AppState>) -> Session {
    state.session.lock().unwrap().clone()
}

#[tauri::command]
pub fn reset_session(state: State<AppState>) {
    let mut session = state.session.lock().unwrap();
    let mut adapter = state.adapter.lock().unwrap();
    if let Some(a) = adapter.as_mut() {
        a.reset();
    }
    *session = Session::new(timestamp_id());
}

#[tauri::command]
pub fn test_cli_connection(state: State<AppState>) -> Result<String, String> {
    let config = state.config.lock().unwrap().clone();
    let path_override = config.cli_path_override.as_ref().map(PathBuf::from);
    let mut adapter: Box<dyn CliAdapter> = match config.cli_tool {
        CliTool::Claude => Box::new(
            ClaudeAdapter::new(path_override).map_err(|e| e.to_string())?
        ),
        CliTool::Gemini => Box::new(
            GeminiAdapter::new(path_override).map_err(|e| e.to_string())?
        ),
        CliTool::Codex => Box::new(
            CodexAdapter::new(path_override).map_err(|e| e.to_string())?
        ),
    };
    let name = adapter.name().to_string();
    adapter.send_prompt(&[], "請回覆 OK").map_err(|e| e.to_string())?;
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

#[tauri::command]
pub fn show_chat_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("chat") {
        w.show().map_err(|e| e.to_string())?;
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
    crate::tray::rebuild_tray(&app, &lang).map_err(|e| e.to_string())?;
    crate::app_menu::setup_app_menu(&app, &lang).map_err(|e| e.to_string())?;

    // 回傳實際套用的語言碼
    let code = match lang {
        crate::i18n::Lang::ZhTW => "zh-TW",
        crate::i18n::Lang::En => "en",
    };
    Ok(code.to_string())
}
