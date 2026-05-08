use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{App, AppHandle, Emitter, Manager, WebviewWindow, WindowEvent};
use crate::commands::AppState;
use crate::config::AppConfig;

/// Tauri's default behavior is to DESTROY a window when the user clicks the
/// macOS red close button — after which `get_webview_window(label)` returns
/// None and the tray menu can no longer reopen it. We intercept CloseRequested
/// for secondary windows and hide them instead.
pub fn install_close_to_hide(app: &AppHandle, label: &str) {
    let Some(window) = app.get_webview_window(label) else { return };
    let win_clone = window.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = win_clone.hide();
        }
    });
}

/// macOS GUI apps launched from Finder/DMG inherit a minimal PATH
/// (/usr/bin:/bin:/usr/sbin:/sbin) — Homebrew, nvm, npm globals etc. are missing,
/// so `which claude/codex/gemini` always fails. We solve this in two stages:
///
/// 1. **`bootstrap_path` (synchronous, fast)** — adds common install roots
///    (Homebrew, npm-global, cargo, bun, nvm latest) and a cached snapshot of
///    the user's shell PATH from a previous run. Runs in milliseconds.
/// 2. **`bootstrap_path_async` (background thread)** — spawns the user's
///    interactive shell (`$SHELL -ilc 'echo $PATH'`) which can take 200–800 ms
///    because it runs `.zshrc` (nvm shims, plugins, etc.). The result is
///    merged into the running process PATH and cached to disk for next launch.
fn merge_paths(into: &mut Vec<String>, from: &str) {
    for entry in from.split(':') {
        if !entry.is_empty() && !into.iter().any(|e| e == entry) {
            into.push(entry.to_string());
        }
    }
}

fn shell_path_cache_file() -> std::path::PathBuf {
    AppConfig::app_data_dir().join("shell_path.cache")
}

pub fn bootstrap_path() {
    let mut entries: Vec<String> = Vec::new();
    if let Ok(existing) = std::env::var("PATH") {
        merge_paths(&mut entries, &existing);
    }

    // Common install roots
    let mut candidates: Vec<String> = vec![
        "/opt/homebrew/bin".into(),
        "/opt/homebrew/sbin".into(),
        "/usr/local/bin".into(),
        "/usr/local/sbin".into(),
    ];
    if let Some(home) = std::env::var_os("HOME") {
        let home = std::path::PathBuf::from(home);
        for sub in [
            ".npm-global/bin",
            ".bun/bin",
            ".cargo/bin",
            ".deno/bin",
            ".volta/bin",
            ".local/bin",
            ".yarn/bin",
        ] {
            candidates.push(home.join(sub).to_string_lossy().into_owned());
        }
        // nvm: pick the most recent installed Node version
        let nvm_versions = home.join(".nvm/versions/node");
        if let Ok(rd) = std::fs::read_dir(&nvm_versions) {
            let mut versions: Vec<_> = rd.filter_map(|e| e.ok()).map(|e| e.path()).collect();
            versions.sort();
            if let Some(latest) = versions.last() {
                candidates.push(latest.join("bin").to_string_lossy().into_owned());
            }
        }
    }
    for c in candidates {
        if !c.is_empty() && !entries.iter().any(|e| e == &c) {
            entries.push(c);
        }
    }

    // Cached shell PATH from last successful background probe.
    if let Ok(cached) = std::fs::read_to_string(shell_path_cache_file()) {
        merge_paths(&mut entries, cached.trim());
    }

    std::env::set_var("PATH", entries.join(":"));
}

/// Run the (slow) interactive-shell PATH probe off the launch path.
/// Result is merged into the running process PATH and cached for next launch
/// so the synchronous bootstrap can pick it up immediately.
pub fn bootstrap_path_async() {
    std::thread::spawn(|| {
        let Some(shell_path) = std::env::var_os("SHELL") else { return };
        let shell = shell_path.to_string_lossy().into_owned();
        // Try interactive login first (covers .zshrc / .bash_profile customisation),
        // fall back to non-interactive for shells that reject -ilc.
        let probe = std::process::Command::new(&shell)
            .args(["-ilc", "echo -n $PATH"])
            .output()
            .or_else(|_| {
                std::process::Command::new(&shell)
                    .args(["-c", "echo -n $PATH"])
                    .output()
            });
        let Ok(out) = probe else { return };
        if !out.status.success() { return }
        let p = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if p.is_empty() { return }

        // Merge into process-wide PATH.
        let mut entries: Vec<String> = Vec::new();
        if let Ok(existing) = std::env::var("PATH") {
            merge_paths(&mut entries, &existing);
        }
        merge_paths(&mut entries, &p);
        std::env::set_var("PATH", entries.join(":"));

        // Persist for next launch (skip cache failure silently).
        let cache = shell_path_cache_file();
        if let Some(parent) = cache.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::write(cache, p);
    });
}

/// Copy all bundled characters to app data dir on first launch.
pub fn init_app_data(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    // Prune old daily chat logs on startup. Keep last 3 days only.
    // Failures are non-fatal: a permission issue or partial cleanup must not
    // prevent the app from starting.
    let logs_dir = AppConfig::app_data_dir().join("logs");
    if let Err(e) = crate::daily_log::cleanup_old_logs(&logs_dir, 3) {
        eprintln!("daily_log cleanup failed: {e}");
    }

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

/// Compute the union bounding box of all connected monitors and resize/reposition
/// the pet window to cover it, so the character can be dragged across every screen.
///
/// Also stores the union work-area (logical CSS pixels, relative to the pet
/// window's top-left) into AppState for the JS movement system. With multiple
/// monitors we cannot honor each monitor's individual Dock/Menu Bar work-area,
/// so we fall back to the union physical bounds — the character may briefly
/// overlap a Dock on a non-primary screen, but dragging across screens works.
pub fn resize_pet_to_all_monitors(window: &WebviewWindow, state: &tauri::State<'_, AppState>) {
    let monitors = match window.available_monitors() {
        Ok(m) if !m.is_empty() => m,
        _ => {
            // Fallback: primary monitor only
            if let Ok(Some(m)) = window.primary_monitor() {
                let sz = m.size();
                let pos = m.position();
                let scale = m.scale_factor();
                let _ = window.set_size(tauri::Size::Physical(
                    tauri::PhysicalSize::new(sz.width, sz.height),
                ));
                let _ = window.set_position(tauri::Position::Physical(
                    tauri::PhysicalPosition::new(pos.x, pos.y),
                ));
                let wa = m.work_area();
                store_work_area(
                    state,
                    wa.position.x - pos.x,
                    wa.position.y - pos.y,
                    wa.size.width,
                    wa.size.height,
                    scale,
                );
            }
            return;
        }
    };

    // Compute union bounding box in physical pixels
    let mut min_x = i32::MAX;
    let mut min_y = i32::MAX;
    let mut max_x = i32::MIN;
    let mut max_y = i32::MIN;
    for m in &monitors {
        let p = m.position();
        let s = m.size();
        if p.x < min_x { min_x = p.x; }
        if p.y < min_y { min_y = p.y; }
        let right = p.x + s.width as i32;
        let bottom = p.y + s.height as i32;
        if right > max_x { max_x = right; }
        if bottom > max_y { max_y = bottom; }
    }
    let width = (max_x - min_x).max(1) as u32;
    let height = (max_y - min_y).max(1) as u32;

    let _ = window.set_size(tauri::Size::Physical(
        tauri::PhysicalSize::new(width, height),
    ));
    let _ = window.set_position(tauri::Position::Physical(
        tauri::PhysicalPosition::new(min_x, min_y),
    ));

    // Use primary monitor's scale factor for CSS conversion. Mixed-DPI setups
    // are an edge case; CSS pixels for the pet window use its own scale.
    let scale = window.scale_factor().unwrap_or(1.0);

    // Movement bounds = full union so the character can move across every screen.
    // We accept a slight overlap with Docks on non-primary monitors as a tradeoff
    // for unrestricted multi-monitor dragging.
    store_work_area(state, 0, 0, width, height, scale);
}

/// Build a stable string fingerprint of the current monitor topology so the
/// watcher can detect when displays are added / removed / repositioned.
fn monitor_signature(window: &WebviewWindow) -> String {
    let Ok(monitors) = window.available_monitors() else {
        return String::new();
    };
    let mut entries: Vec<String> = monitors
        .iter()
        .map(|m| {
            let p = m.position();
            let s = m.size();
            format!("{},{},{}x{}", p.x, p.y, s.width, s.height)
        })
        .collect();
    entries.sort(); // order-independent
    entries.join("|")
}

/// Background thread: every 1 s, check whether the display topology changed
/// (e.g., user undocked an external monitor or unlocked the screen with a
/// different resolution). If so, resize the pet window to the new union and
/// emit `screen-info-updated` so the JS movement system can re-clamp.
///
/// macOS NSScreen / NSWindow APIs (which `available_monitors`, `set_size`,
/// `set_position` ultimately call) require the main (AppKit) thread. Calling
/// them from this background thread can produce undefined behavior or crashes
/// (`NSInternalInconsistencyException`), especially after lock-screen +
/// monitor topology change. We therefore do *all* window/monitor inspection
/// inside `run_on_main_thread`.
pub fn start_display_watcher(app_handle: AppHandle) {
    std::thread::spawn(move || {
        let mut last_sig: Option<String> = None;
        loop {
            std::thread::sleep(std::time::Duration::from_secs(1));

            // Snapshot signature on the main thread.
            let (tx, rx) = std::sync::mpsc::channel::<Option<String>>();
            let app_clone = app_handle.clone();
            let _ = app_handle.run_on_main_thread(move || {
                let sig = app_clone
                    .get_webview_window("pet")
                    .map(|w| monitor_signature(&w))
                    .filter(|s| !s.is_empty());
                let _ = tx.send(sig);
            });
            let new_sig = match rx.recv_timeout(std::time::Duration::from_secs(2)) {
                Ok(Some(s)) => s,
                _ => continue,
            };

            if last_sig.as_ref() == Some(&new_sig) { continue }
            last_sig = Some(new_sig);

            // Apply resize + emit on the main thread too.
            let app_clone2 = app_handle.clone();
            let _ = app_handle.run_on_main_thread(move || {
                let Some(window) = app_clone2.get_webview_window("pet") else { return };
                let state = app_clone2.state::<AppState>();
                resize_pet_to_all_monitors(&window, &state);
                let _ = window.emit("screen-info-updated", ());
            });
        }
    });
}

/// Stores work-area in AppState as logical CSS pixels (window-relative).
/// `phys_x/y` are physical-pixel offsets relative to the pet window's top-left.
pub fn store_work_area(
    state: &tauri::State<'_, AppState>,
    phys_x: i32,
    phys_y: i32,
    phys_w: u32,
    phys_h: u32,
    scale: f64,
) {
    let s = if scale > 0.0 { scale } else { 1.0 };
    state.work_x.store((phys_x as f64 / s) as i32, Ordering::Relaxed);
    state.work_y.store((phys_y as f64 / s) as i32, Ordering::Relaxed);
    state.work_w.store((phys_w as f64 / s) as i32, Ordering::Relaxed);
    state.work_h.store((phys_h as f64 / s) as i32, Ordering::Relaxed);
}

/// Background thread: polls cursor position every 50ms and toggles OS-level
/// click-through on the pet window based on whether the cursor is over the
/// character (or speech bubble area above it).
///
/// Coordinates: cursor_position() returns physical px relative to window top-left;
/// char_x/char_y are CSS logical px (also window-relative since window is at 0,0).
pub fn start_cursor_tracker(app_handle: AppHandle) {
    std::thread::spawn(move || {
        // Track last-applied state to avoid redundant IPC calls every tick.
        let last_passthrough = AtomicBool::new(true); // matches the initial setup state

        loop {
            std::thread::sleep(std::time::Duration::from_millis(50));
            let Some(window) = app_handle.get_webview_window("pet") else { continue };
            // When the pet is hidden (tray toggle), back off to 500 ms to save
            // CPU/battery — nothing meaningful changes while invisible.
            if !window.is_visible().unwrap_or(true) {
                std::thread::sleep(std::time::Duration::from_millis(450));
                continue;
            }
            let state = app_handle.state::<crate::commands::AppState>();
            // While a CLI request is in flight (5–30 s), pause the high-frequency
            // AppKit dispatches. The cursor tracker's `cursor_position`,
            // `scale_factor`, and `set_ignore_cursor_events` calls round-trip to
            // the main thread; competing with them is what made the user's other
            // open windows feel pending until the CLI finished.
            if state.cli_busy.load(Ordering::Acquire) {
                std::thread::sleep(std::time::Duration::from_millis(450));
                continue;
            }

            // When input overlay is visible, keep click-through off.
            // Use Acquire so we see the store from set_input_visible (Release).
            if state.input_visible.load(Ordering::Acquire) {
                if last_passthrough.load(Ordering::Relaxed) {
                    let _ = window.set_ignore_cursor_events(false);
                    last_passthrough.store(false, Ordering::Relaxed);
                }
                continue;
            }

            let cx = state.char_x.load(Ordering::Relaxed);
            let cy = state.char_y.load(Ordering::Relaxed);
            let cs = state.char_size.load(Ordering::Relaxed);

            // Fail-safe: if cursor position unavailable, ensure click-through is ON
            let cursor = match window.cursor_position() {
                Ok(c) => c,
                Err(_) => {
                    if !last_passthrough.load(Ordering::Relaxed) {
                        let _ = window.set_ignore_cursor_events(true);
                        last_passthrough.store(true, Ordering::Relaxed);
                    }
                    continue;
                }
            };
            let scale = window.scale_factor().unwrap_or(1.0);
            // cursor_position() returns physical pixels relative to window; convert to logical
            let clx = (cursor.x / scale) as i32;
            let cly = (cursor.y / scale) as i32;

            // Include 220px above character for the speech bubble
            let bubble_h: i32 = 220;
            let over_char = clx >= cx
                && clx <= cx + cs
                && cly >= cy.saturating_sub(bubble_h)
                && cly <= cy + cs;

            let want_passthrough = !over_char;
            if last_passthrough.load(Ordering::Relaxed) != want_passthrough {
                last_passthrough.store(want_passthrough, Ordering::Relaxed);
                let _ = window.set_ignore_cursor_events(want_passthrough);
            }
        }
    });
}
