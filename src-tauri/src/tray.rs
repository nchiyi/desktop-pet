use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};
use crate::commands::AppState;
use crate::i18n::{strings, Lang};

pub fn setup_tray(app: &AppHandle, hotkey: &str) -> tauri::Result<()> {
    let sys_lang = crate::i18n::detect_system_lang();
    setup_tray_with_lang(app, &sys_lang, hotkey)
}

fn build_tray_menu(app: &AppHandle, lang: &Lang, hotkey: &str) -> tauri::Result<Menu<tauri::Wry>> {
    let s = strings(lang);
    // Show hotkey next to the "Open Chat" item so users always know the shortcut
    let talk_label = format!("{} ({})", s.talk, hotkey);
    let talk        = MenuItem::with_id(app, "talk",        talk_label,     true, None::<&str>)?;
    let show         = MenuItem::with_id(app, "show",         s.show_hide,    true, None::<&str>)?;
    let sep1         = PredefinedMenuItem::separator(app)?;
    let char_select  = MenuItem::with_id(app, "char_select",  s.char_select,  true, None::<&str>)?;
    let char_folder  = MenuItem::with_id(app, "char_folder",  s.char_folder,  true, None::<&str>)?;
    let char_install = MenuItem::with_id(app, "char_install", s.char_install, true, None::<&str>)?;
    let char_guide   = MenuItem::with_id(app, "char_guide",   s.char_guide,   true, None::<&str>)?;
    let char_menu    = Submenu::with_items(app, s.char_mgmt, true,
        &[&char_select, &char_folder, &char_install, &char_guide])?;
    let sep2     = PredefinedMenuItem::separator(app)?;
    let settings = MenuItem::with_id(app, "settings", s.settings, true, None::<&str>)?;
    let history  = MenuItem::with_id(app, "history",  s.history,  true, None::<&str>)?;
    let sep3     = PredefinedMenuItem::separator(app)?;
    let quit     = MenuItem::with_id(app, "quit",     s.quit,     true, None::<&str>)?;
    Menu::with_items(app, &[&talk, &show, &sep1, &char_menu, &sep2, &settings, &history, &sep3, &quit])
}

fn setup_tray_with_lang(app: &AppHandle, lang: &Lang, hotkey: &str) -> tauri::Result<()> {
    let menu = build_tray_menu(app, lang, hotkey)?;
    let mut builder = TrayIconBuilder::with_id("main")
        .menu(&menu)
        .on_menu_event(|app, event| handle_menu(app, event.id.as_ref()));
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder
        .on_tray_icon_event(|tray, event| {
            if matches!(event, TrayIconEvent::Click { button: MouseButton::Left, .. }) {
                if let Some(w) = tray.app_handle().get_webview_window("pet") {
                    let visible = w.is_visible().unwrap_or(false);
                    let _ = if visible { w.hide() } else { w.show() };
                }
            }
        })
        .build(app)?;
    Ok(())
}

pub fn rebuild_tray(app: &AppHandle, lang: &Lang, hotkey: &str) -> tauri::Result<()> {
    let new_menu = build_tray_menu(app, lang, hotkey)?;
    if let Some(tray) = app.tray_by_id("main") {
        tray.set_menu(Some(new_menu))?;
        Ok(())
    } else {
        Err(tauri::Error::AssetNotFound("main tray not found".into()))
    }
}

fn handle_menu(app: &AppHandle, id: &str) {
    // Any user-initiated menu action implies "I want the pet system active".
    // The user explicitly hides the pet via the tray icon left-click toggle —
    // not by opening settings / chat history. So bring pet back here unless
    // we're quitting outright.
    if id != "quit" {
        if let Some(pet) = app.get_webview_window("pet") {
            if !pet.is_visible().unwrap_or(true) {
                let _ = pet.show();
            }
        }
    }

    match id {
        "talk" => {
            if let Some(w) = app.get_webview_window("pet") {
                let _ = w.show();
                let _ = w.emit("open-input", ());
            }
        }
        "show"         => show_window(app, "pet"),
        "char_folder"  => {
            let dir = crate::config::AppConfig::app_data_dir().join("characters");
            let _ = crate::installer::open_characters_dir(&dir);
        }
        "char_guide"   => show_window(app, "guide"),
        "settings"     => show_window(app, "settings"),
        "history"      => show_window(app, "chat"),
        "quit"         => app.exit(0),
        _              => {}
    }
}

fn show_window(app: &AppHandle, label: &str) {
    // Mirror pet's current always-on-top setting. When pet is floating, these
    // windows must also float so they aren't hidden under the transparent pet
    // layer. When pet is normal level, secondary windows must NOT permanently
    // float above every other app — that was a UX regression of the prior fix.
    let aot = app.state::<AppState>().config.lock().unwrap().always_on_top;
    if let Some(w) = app.get_webview_window(label) {
        let _ = w.set_always_on_top(aot);
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}
