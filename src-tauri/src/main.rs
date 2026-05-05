#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;
use tauri_app_lib::commands::AppState;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("pet") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .manage(AppState::new())
        .setup(|app| {
            tauri_app_lib::tray::setup_tray(&app.handle())?;
            tauri_app_lib::setup::init_app_data(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            tauri_app_lib::commands::get_config,
            tauri_app_lib::commands::save_config,
            tauri_app_lib::commands::send_message,
            tauri_app_lib::commands::get_session,
            tauri_app_lib::commands::reset_session,
            tauri_app_lib::commands::test_cli_connection,
            tauri_app_lib::commands::list_characters,
            tauri_app_lib::commands::install_character_zip,
            tauri_app_lib::commands::open_characters_folder,
            tauri_app_lib::commands::get_animation_path,
            tauri_app_lib::commands::get_idle_phrases,
            tauri_app_lib::commands::show_chat_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
