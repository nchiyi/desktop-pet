#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;
use tauri_app_lib::commands::AppState;

fn main() {
    // Augment PATH before any subprocess (CLI detection) — Finder-launched apps
    // on macOS inherit a minimal PATH that excludes Homebrew/nvm/npm-global.
    // Synchronous part is fast (candidates + cached snapshot); the slow
    // interactive-shell probe runs in the background and refreshes the cache.
    tauri_app_lib::setup::bootstrap_path();
    tauri_app_lib::setup::bootstrap_path_async();

    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
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
            tauri_app_lib::setup::init_app_data(app)?;
            let cfg = tauri_app_lib::config::AppConfig::load_or_default(
                &tauri_app_lib::config::AppConfig::config_path()
            );
            let sys_lang = tauri_app_lib::i18n::detect_system_lang();
            let lang = tauri_app_lib::i18n::lang_from_str(&cfg.language, &sys_lang);
            tauri_app_lib::tray::setup_tray(&app.handle(), &cfg.hotkey)?;
            tauri_app_lib::app_menu::setup_app_menu(&app.handle(), &lang)?;
            if let Some(pet) = app.get_webview_window("pet") {
                // Resize window to span the union of all connected monitors so
                // the character can be dragged to any display. CSS coordinates
                // and cursor tracking become window-relative.
                tauri_app_lib::setup::resize_pet_to_all_monitors(
                    &pet,
                    &app.state::<AppState>(),
                );
                let _ = pet.set_always_on_top(cfg.always_on_top);
                let _ = pet.set_ignore_cursor_events(true);
            }
            // Hide-on-close so tray menu can reopen them later
            for label in ["chat", "settings", "guide"] {
                tauri_app_lib::setup::install_close_to_hide(&app.handle(), label);
            }
            tauri_app_lib::setup::start_cursor_tracker(app.handle().clone());
            // Detect monitor add/remove (e.g., user undocked external display
            // after locking the screen) and resize the pet window accordingly.
            tauri_app_lib::setup::start_display_watcher(app.handle().clone());
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
            tauri_app_lib::commands::toggle_pet_visibility,
            tauri_app_lib::commands::set_language,
            tauri_app_lib::commands::update_char_pos,
            tauri_app_lib::commands::set_input_visible,
            tauri_app_lib::commands::set_pet_dragging,
            tauri_app_lib::commands::get_animation_static_path,
            tauri_app_lib::commands::list_character_files,
            tauri_app_lib::commands::get_animation_overrides,
            tauri_app_lib::commands::set_animation_override,
            tauri_app_lib::commands::get_screen_info,
            tauri_app_lib::commands::read_daily_log,
            tauri_app_lib::commands::export_session,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
