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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
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
    pub language: String,  // "system" | "zh-TW" | "en"
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            hotkey: "Alt+Space".into(),
            movement_mode: MovementMode::FullScreen,
            active_character: "donghae".into(),
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
            language: "system".to_string(),
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
            let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
            PathBuf::from(home).join(".config/DesktopPet")
        }
    }

    pub fn config_path() -> PathBuf {
        Self::app_data_dir().join("config.toml")
    }

    pub fn load_or_default(path: &Path) -> Self {
        Self::load(path).unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn default_config_serializes_and_deserializes() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("config.toml");
        let cfg = AppConfig::default();
        cfg.save(&path).unwrap();
        let loaded = AppConfig::load(&path).unwrap();
        assert_eq!(loaded, cfg);
    }
}
