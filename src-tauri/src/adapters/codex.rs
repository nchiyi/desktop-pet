use super::{CliAdapter, Message};
use anyhow::{Context, Result};
use std::path::PathBuf;
use std::process::Command;

pub struct CodexAdapter {
    pub cli_path: PathBuf,
}

impl CodexAdapter {
    pub fn new(path_override: Option<PathBuf>) -> Result<Self> {
        let cli_path = path_override
            .or_else(Self::detect)
            .context("Codex CLI not found. Install with: npm install -g @openai/codex")?;
        Ok(Self { cli_path })
    }
}

impl CliAdapter for CodexAdapter {
    fn name(&self) -> &str { "Codex" }

    fn detect() -> Option<PathBuf> {
        let output = if cfg!(target_os = "windows") {
            Command::new("where").arg("codex").output().ok()?
        } else {
            Command::new("which").arg("codex").output().ok()?
        };
        if output.status.success() {
            let path = String::from_utf8(output.stdout).ok()?.trim().lines().next()?.to_string();
            Some(PathBuf::from(path))
        } else {
            #[cfg(target_os = "windows")]
            {
                let appdata = std::env::var("APPDATA").ok()?;
                let p = PathBuf::from(appdata).join("npm").join("codex.cmd");
                if p.exists() { return Some(p); }
            }
            None
        }
    }

    fn send_prompt(&mut self, history: &[Message], prompt: &str) -> Result<String> {
        let mut full_prompt = String::new();
        for msg in history {
            full_prompt.push_str(&format!("{}: {}\n", msg.role, msg.content));
        }
        full_prompt.push_str(&format!("user: {}", prompt));

        let output = Command::new(&self.cli_path)
            .args(["-q", &full_prompt])
            .output()
            .context("Failed to run codex CLI")?;

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
        } else {
            let err = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!("Codex CLI error: {}", err)
        }
    }

    fn reset(&mut self) {}
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn detect_does_not_panic() { let _ = CodexAdapter::detect(); }

    #[test]
    fn new_with_explicit_path_succeeds() {
        let result = CodexAdapter::new(Some(PathBuf::from("/nonexistent/codex")));
        assert!(result.is_ok());
    }
}
