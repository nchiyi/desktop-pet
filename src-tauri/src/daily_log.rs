use anyhow::Result;
use chrono::{DateTime, Local, NaiveDate};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;

/// Append a single chat exchange to today's log file under `<dir>/YYYY-MM-DD.txt`.
/// Format is human-readable plain text. Failures are returned to the caller, who
/// must decide whether to surface them — the chat send path uses `let _ = ...`.
pub fn append_entry(dir: &Path, user_msg: &str, assistant_msg: &str) -> Result<()> {
    append_entry_at(dir, user_msg, assistant_msg, Local::now())
}

fn append_entry_at(
    dir: &Path,
    user_msg: &str,
    assistant_msg: &str,
    now: DateTime<Local>,
) -> Result<()> {
    fs::create_dir_all(dir)?;
    let date = now.format("%Y-%m-%d").to_string();
    let timestamp = now.format("%Y-%m-%d %H:%M:%S").to_string();
    let path = dir.join(format!("{date}.txt"));
    let entry = format!(
        "[{timestamp}]\n👤 你：{user_msg}\n🤖 寵物：{assistant_msg}\n\n"
    );
    let mut file = OpenOptions::new().create(true).append(true).open(path)?;
    file.write_all(entry.as_bytes())?;
    Ok(())
}

/// Read the log file for the given local date. Returns "" if the file doesn't
/// exist (treated as "no records on that day"). Other I/O errors propagate.
pub fn read_for_day(dir: &Path, day_offset: i32) -> Result<String> {
    let date = date_for_offset_at(Local::now().date_naive(), day_offset);
    read_for_day_at(dir, date)
}

fn read_for_day_at(dir: &Path, date: NaiveDate) -> Result<String> {
    let path = dir.join(format!("{}.txt", date.format("%Y-%m-%d")));
    match fs::read_to_string(&path) {
        Ok(s) => Ok(s),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(e.into()),
    }
}

fn date_for_offset_at(today: NaiveDate, offset: i32) -> NaiveDate {
    if offset == 0 {
        today
    } else if offset > 0 {
        today + chrono::Duration::days(offset as i64)
    } else {
        today - chrono::Duration::days((-offset) as i64)
    }
}

/// Delete log files older than `keep_days` (counting today). `keep_days = 3`
/// preserves today + yesterday + day-before-yesterday. `keep_days = 0` is a
/// no-op (returns Ok without touching anything) — refuse to interpret zero as
/// "delete everything" defensively.
pub fn cleanup_old_logs(dir: &Path, keep_days: u32) -> Result<()> {
    cleanup_old_logs_at(dir, Local::now().date_naive(), keep_days)
}

fn cleanup_old_logs_at(dir: &Path, today: NaiveDate, keep_days: u32) -> Result<()> {
    if keep_days == 0 {
        return Ok(());
    }
    let cutoff = today - chrono::Duration::days(i64::from(keep_days - 1));
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(e.into()),
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("txt") {
            continue;
        }
        let stem = match path.file_stem().and_then(|s| s.to_str()) {
            Some(s) => s,
            None => continue,
        };
        let date = match NaiveDate::parse_from_str(stem, "%Y-%m-%d") {
            Ok(d) => d,
            Err(_) => continue,
        };
        if date < cutoff {
            let _ = fs::remove_file(&path);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;
    use tempfile::TempDir;

    #[test]
    fn append_entry_creates_file_with_expected_content() {
        let tmp = TempDir::new().unwrap();
        let when = Local.with_ymd_and_hms(2026, 5, 8, 14, 32, 10).unwrap();
        append_entry_at(tmp.path(), "今天天氣怎樣？", "天氣很好喔！", when).unwrap();
        let content = fs::read_to_string(tmp.path().join("2026-05-08.txt")).unwrap();
        assert!(content.contains("[2026-05-08 14:32:10]"));
        assert!(content.contains("👤 你：今天天氣怎樣？"));
        assert!(content.contains("🤖 寵物：天氣很好喔！"));
    }

    #[test]
    fn append_entry_appends_when_called_twice_same_day() {
        let tmp = TempDir::new().unwrap();
        let when = Local.with_ymd_and_hms(2026, 5, 8, 14, 32, 10).unwrap();
        append_entry_at(tmp.path(), "first q", "first a", when).unwrap();
        append_entry_at(tmp.path(), "second q", "second a", when).unwrap();
        let content = fs::read_to_string(tmp.path().join("2026-05-08.txt")).unwrap();
        assert!(content.contains("first q") && content.contains("second q"));
        assert!(content.matches("[2026-05-08 14:32:10]").count() == 2);
    }

    #[test]
    fn append_entry_creates_directory_if_missing() {
        let tmp = TempDir::new().unwrap();
        let nested = tmp.path().join("does/not/exist/yet");
        let when = Local.with_ymd_and_hms(2026, 5, 8, 0, 0, 0).unwrap();
        append_entry_at(&nested, "q", "a", when).unwrap();
        assert!(nested.join("2026-05-08.txt").exists());
    }

    #[test]
    fn read_for_day_returns_file_contents() {
        let tmp = TempDir::new().unwrap();
        let when = Local.with_ymd_and_hms(2026, 5, 8, 12, 0, 0).unwrap();
        append_entry_at(tmp.path(), "q", "a", when).unwrap();
        let target = NaiveDate::from_ymd_opt(2026, 5, 8).unwrap();
        let got = read_for_day_at(tmp.path(), target).unwrap();
        assert!(got.contains("q") && got.contains("a"));
    }

    #[test]
    fn read_for_day_returns_empty_when_missing() {
        let tmp = TempDir::new().unwrap();
        let target = NaiveDate::from_ymd_opt(2026, 5, 1).unwrap();
        let got = read_for_day_at(tmp.path(), target).unwrap();
        assert_eq!(got, "");
    }

    #[test]
    fn day_offset_resolves_relative_to_today() {
        let today = Local::now().date_naive();
        assert_eq!(date_for_offset_at(today, 0), today);
        assert_eq!(
            date_for_offset_at(today, -1),
            today.pred_opt().unwrap()
        );
    }

    #[test]
    fn cleanup_keeps_last_three_days() {
        let tmp = TempDir::new().unwrap();
        let today = NaiveDate::from_ymd_opt(2026, 5, 8).unwrap();

        // Create files for D-0, D-1, D-2, D-3, D-4, D-10
        for offset in [0, -1, -2, -3, -4, -10] {
            let d = if offset == 0 {
                today
            } else {
                today - chrono::Duration::days((-offset) as i64)
            };
            let path = tmp.path().join(format!("{}.txt", d.format("%Y-%m-%d")));
            std::fs::write(&path, "noise").unwrap();
        }

        cleanup_old_logs_at(tmp.path(), today, 3).unwrap();

        // Survivors: today, today-1, today-2
        for offset in [0, -1, -2] {
            let d = if offset == 0 {
                today
            } else {
                today - chrono::Duration::days((-offset) as i64)
            };
            assert!(
                tmp.path().join(format!("{}.txt", d.format("%Y-%m-%d"))).exists(),
                "expected D{} to survive",
                offset
            );
        }
        // Casualties: D-3, D-4, D-10
        for offset in [-3, -4, -10] {
            let d = today - chrono::Duration::days((-offset) as i64);
            assert!(
                !tmp.path().join(format!("{}.txt", d.format("%Y-%m-%d"))).exists(),
                "expected D{} to be deleted",
                offset
            );
        }
    }

    #[test]
    fn cleanup_ignores_non_log_files_and_bad_names() {
        let tmp = TempDir::new().unwrap();
        let today = NaiveDate::from_ymd_opt(2026, 5, 8).unwrap();
        std::fs::write(tmp.path().join("not-a-log.txt"), "x").unwrap();
        std::fs::write(tmp.path().join("README.md"), "x").unwrap();
        std::fs::write(tmp.path().join("garbage-2026-XX-YY.txt"), "x").unwrap();
        cleanup_old_logs_at(tmp.path(), today, 3).unwrap();
        assert!(tmp.path().join("not-a-log.txt").exists());
        assert!(tmp.path().join("README.md").exists());
        assert!(tmp.path().join("garbage-2026-XX-YY.txt").exists());
    }

    #[test]
    fn cleanup_handles_missing_dir_silently() {
        let tmp = TempDir::new().unwrap();
        let missing = tmp.path().join("nope");
        let today = NaiveDate::from_ymd_opt(2026, 5, 8).unwrap();
        cleanup_old_logs_at(&missing, today, 3).unwrap();
    }

    #[test]
    fn cleanup_with_keep_days_one_keeps_only_today() {
        let tmp = TempDir::new().unwrap();
        let today = NaiveDate::from_ymd_opt(2026, 5, 8).unwrap();
        for offset in [0_i64, -1, -2] {
            let d = today - chrono::Duration::days(-offset);
            let path = tmp.path().join(format!("{}.txt", d.format("%Y-%m-%d")));
            std::fs::write(&path, "x").unwrap();
        }
        cleanup_old_logs_at(tmp.path(), today, 1).unwrap();
        // Only today survives
        assert!(tmp.path().join(format!("{}.txt", today.format("%Y-%m-%d"))).exists());
        for offset in [-1_i64, -2] {
            let d = today - chrono::Duration::days(-offset);
            assert!(
                !tmp.path().join(format!("{}.txt", d.format("%Y-%m-%d"))).exists(),
                "expected D{} to be deleted with keep_days=1",
                offset
            );
        }
    }

    #[test]
    fn cleanup_with_keep_days_zero_is_noop() {
        let tmp = TempDir::new().unwrap();
        let today = NaiveDate::from_ymd_opt(2026, 5, 8).unwrap();
        for offset in [0_i64, -1, -10] {
            let d = today - chrono::Duration::days(-offset);
            let path = tmp.path().join(format!("{}.txt", d.format("%Y-%m-%d")));
            std::fs::write(&path, "x").unwrap();
        }
        cleanup_old_logs_at(tmp.path(), today, 0).unwrap();
        // Nothing deleted
        for offset in [0_i64, -1, -10] {
            let d = today - chrono::Duration::days(-offset);
            assert!(tmp.path().join(format!("{}.txt", d.format("%Y-%m-%d"))).exists());
        }
    }
}
