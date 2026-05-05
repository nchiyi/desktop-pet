use tauri::{App, Manager};
use crate::config::AppConfig;

/// Copy all bundled characters to app data dir on first launch.
pub fn init_app_data(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let resource_path = app.path().resource_dir()?;
    let bundled_chars = resource_path.join("assets").join("characters");
    let dest_chars = AppConfig::app_data_dir().join("characters");

    if !bundled_chars.exists() {
        return Ok(());
    }

    for entry in std::fs::read_dir(&bundled_chars)? {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }
        let char_name = entry.file_name();
        let dest_dir = dest_chars.join(&char_name);
        if dest_dir.exists() {
            continue; // 已存在，不覆蓋（保留使用者修改）
        }
        std::fs::create_dir_all(&dest_dir)?;
        for file in std::fs::read_dir(entry.path())? {
            let file = file?;
            std::fs::copy(file.path(), dest_dir.join(file.file_name()))?;
        }
    }

    Ok(())
}
