use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};

pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let show         = MenuItem::with_id(app, "show",         "顯示 / 隱藏角色", true, None::<&str>)?;
    let sep1         = PredefinedMenuItem::separator(app)?;
    let char_select  = MenuItem::with_id(app, "char_select",  "選擇角色",        true, None::<&str>)?;
    let char_folder  = MenuItem::with_id(app, "char_folder",  "開啟角色資料夾",  true, None::<&str>)?;
    let char_install = MenuItem::with_id(app, "char_install", "安裝角色(.zip)",  true, None::<&str>)?;
    let char_guide   = MenuItem::with_id(app, "char_guide",   "角色製作說明",    true, None::<&str>)?;
    let char_menu    = Submenu::with_items(app, "角色管理", true,
        &[&char_select, &char_folder, &char_install, &char_guide])?;
    let sep2     = PredefinedMenuItem::separator(app)?;
    let settings = MenuItem::with_id(app, "settings", "設定",     true, None::<&str>)?;
    let history  = MenuItem::with_id(app, "history",  "對話記錄",  true, None::<&str>)?;
    let sep3     = PredefinedMenuItem::separator(app)?;
    let quit     = MenuItem::with_id(app, "quit",     "退出",     true, None::<&str>)?;

    let menu = Menu::with_items(app, &[
        &show, &sep1, &char_menu, &sep2, &settings, &history, &sep3, &quit,
    ])?;

    TrayIconBuilder::new()
        .menu(&menu)
        .on_menu_event(|app, event| handle_menu(app, event.id.as_ref()))
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

fn handle_menu(app: &AppHandle, id: &str) {
    match id {
        "show"         => { if let Some(w) = app.get_webview_window("pet") { let _ = w.set_focus(); } }
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
    if let Some(w) = app.get_webview_window(label) {
        let _ = w.show();
        let _ = w.set_focus();
    }
}
