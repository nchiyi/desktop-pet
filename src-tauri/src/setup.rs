use std::path::PathBuf;
use tauri::{App, Manager};

use crate::config::AppConfig;

/// Copy bundled default character to app data dir on first launch.
pub fn init_app_data(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let data_dir = AppConfig::app_data_dir();
    let characters_dir = data_dir.join("characters");
    let default_dir = characters_dir.join("default");

    if !default_dir.exists() {
        std::fs::create_dir_all(&default_dir)?;
        copy_bundled_default(app, &default_dir)?;
    }

    Ok(())
}

fn copy_bundled_default(app: &mut App, dest: &PathBuf) -> Result<(), Box<dyn std::error::Error>> {
    let resource_path = app.path().resource_dir()?;
    let bundled_default = resource_path.join("assets").join("characters").join("default");

    if !bundled_default.exists() {
        return Ok(());
    }

    for entry in std::fs::read_dir(&bundled_default)? {
        let entry = entry?;
        let file_name = entry.file_name();
        std::fs::copy(entry.path(), dest.join(&file_name))?;
    }

    Ok(())
}
