use tauri::{menu::*, AppHandle};

pub fn setup_app_menu(app: &AppHandle, lang: &crate::i18n::Lang) -> tauri::Result<()> {
    let s = crate::i18n::strings(lang);

    // App menu (第一個 submenu = app 名稱)
    let about    = MenuItem::with_id(app, "about",       s.about,      true, None::<&str>)?;
    let hide     = PredefinedMenuItem::hide(app, Some(s.hide))?;
    let hide_oth = PredefinedMenuItem::hide_others(app, Some(s.hide_others))?;
    let show_all = PredefinedMenuItem::show_all(app, Some(s.show_all))?;
    let sep      = PredefinedMenuItem::separator(app)?;
    let quit     = PredefinedMenuItem::quit(app, Some(s.quit))?;
    let app_submenu = Submenu::with_items(app, "Desktop Pet", true,
        &[&about, &sep, &hide, &hide_oth, &show_all, &PredefinedMenuItem::separator(app)?, &quit])?;

    // Edit menu
    let undo       = PredefinedMenuItem::undo(app, Some(s.undo))?;
    let redo       = PredefinedMenuItem::redo(app, Some(s.redo))?;
    let sep2       = PredefinedMenuItem::separator(app)?;
    let cut        = PredefinedMenuItem::cut(app, Some(s.cut))?;
    let copy       = PredefinedMenuItem::copy(app, Some(s.copy))?;
    let paste      = PredefinedMenuItem::paste(app, Some(s.paste))?;
    let select_all = PredefinedMenuItem::select_all(app, Some(s.select_all))?;
    let edit_submenu = Submenu::with_items(app, s.edit, true,
        &[&undo, &redo, &sep2, &cut, &copy, &paste, &select_all])?;

    // Window menu
    let minimize = PredefinedMenuItem::minimize(app, Some(s.minimize))?;
    let maximize = PredefinedMenuItem::maximize(app, Some(s.zoom))?;
    let win_submenu = Submenu::with_items(app, s.window, true,
        &[&minimize, &maximize])?;

    let menu = Menu::with_items(app, &[&app_submenu, &edit_submenu, &win_submenu])?;
    app.set_menu(menu)?;
    Ok(())
}
