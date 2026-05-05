#[derive(Debug, Clone, PartialEq)]
pub enum Lang { ZhTW, En }

pub struct Strings {
    pub show_hide: &'static str,
    pub char_mgmt: &'static str,
    pub char_select: &'static str,
    pub char_folder: &'static str,
    pub char_install: &'static str,
    pub char_guide: &'static str,
    pub settings: &'static str,
    pub history: &'static str,
    pub quit: &'static str,
    // macOS app menu
    pub about: &'static str,
    pub hide: &'static str,
    pub hide_others: &'static str,
    pub show_all: &'static str,
    pub edit: &'static str,
    pub undo: &'static str,
    pub redo: &'static str,
    pub cut: &'static str,
    pub copy: &'static str,
    pub paste: &'static str,
    pub select_all: &'static str,
    pub window: &'static str,
    pub minimize: &'static str,
    pub zoom: &'static str,
}

pub fn strings(lang: &Lang) -> Strings {
    match lang {
        Lang::ZhTW => Strings {
            show_hide:    "顯示 / 隱藏角色",
            char_mgmt:    "角色管理",
            char_select:  "選擇角色",
            char_folder:  "開啟角色資料夾",
            char_install: "安裝角色 (.zip)",
            char_guide:   "角色製作說明",
            settings:     "設定",
            history:      "對話記錄",
            quit:         "退出",
            about:        "關於 Desktop Pet",
            hide:         "隱藏 Desktop Pet",
            hide_others:  "隱藏其他",
            show_all:     "全部顯示",
            edit:         "編輯",
            undo:         "復原",
            redo:         "重做",
            cut:          "剪下",
            copy:         "複製",
            paste:        "貼上",
            select_all:   "全選",
            window:       "視窗",
            minimize:     "最小化",
            zoom:         "縮放",
        },
        Lang::En => Strings {
            show_hide:    "Show / Hide Pet",
            char_mgmt:    "Character",
            char_select:  "Select Character",
            char_folder:  "Open Character Folder",
            char_install: "Install Character (.zip)",
            char_guide:   "Character Guide",
            settings:     "Settings",
            history:      "Chat History",
            quit:         "Quit",
            about:        "About Desktop Pet",
            hide:         "Hide Desktop Pet",
            hide_others:  "Hide Others",
            show_all:     "Show All",
            edit:         "Edit",
            undo:         "Undo",
            redo:         "Redo",
            cut:          "Cut",
            copy:         "Copy",
            paste:        "Paste",
            select_all:   "Select All",
            window:       "Window",
            minimize:     "Minimize",
            zoom:         "Zoom",
        },
    }
}

/// 偵測系統語言，回傳 Lang
pub fn detect_system_lang() -> Lang {
    let lang_str = std::env::var("LANG")
        .or_else(|_| std::env::var("LC_ALL"))
        .unwrap_or_default()
        .to_lowercase();
    if lang_str.starts_with("zh") {
        Lang::ZhTW
    } else {
        Lang::En
    }
}

/// 從 config 語言字串轉換（"system" | "zh-TW" | "en"）
pub fn lang_from_str(s: &str, system_lang: &Lang) -> Lang {
    match s {
        "zh-TW" => Lang::ZhTW,
        "en"    => Lang::En,
        _       => system_lang.clone(), // "system" 或其他
    }
}
