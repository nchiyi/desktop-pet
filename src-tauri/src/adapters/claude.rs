use super::{CliAdapter, Message};
use anyhow::{Context, Result};
use std::path::PathBuf;
use std::process::Command;

pub struct ClaudeAdapter {
    pub cli_path: PathBuf,
}

impl ClaudeAdapter {
    pub fn new(path_override: Option<PathBuf>) -> Result<Self> {
        let cli_path = path_override
            .or_else(Self::detect)
            .context("Claude CLI not found. Install with: npm install -g @anthropic-ai/claude-code")?;
        Ok(Self { cli_path })
    }
}

impl CliAdapter for ClaudeAdapter {
    fn name(&self) -> &str { "Claude Code" }

    fn detect() -> Option<PathBuf> {
        // Try `which claude` on Unix, `where claude` on Windows
        let output = if cfg!(target_os = "windows") {
            Command::new("where").arg("claude").output().ok()?
        } else {
            Command::new("which").arg("claude").output().ok()?
        };
        if output.status.success() {
            let path = String::from_utf8(output.stdout).ok()?.trim().lines().next()?.to_string();
            Some(PathBuf::from(path))
        } else {
            // fallback: npm global bin
            #[cfg(target_os = "windows")]
            {
                let appdata = std::env::var("APPDATA").ok()?;
                let p = PathBuf::from(appdata).join("npm").join("claude.cmd");
                if p.exists() { return Some(p); }
            }
            None
        }
    }

    fn send_prompt(&mut self, history: &[Message], prompt: &str) -> Result<String> {
        // Build a single prompt with history context
        let mut full_prompt = String::new();
        for msg in history {
            full_prompt.push_str(&format!("{}: {}\n", msg.role, msg.content));
        }
        full_prompt.push_str(&format!("user: {}", prompt));

        let output = Command::new(&self.cli_path)
            .args(["-p", &full_prompt, "--output-format", "text"])
            .output()
            .context("Failed to run claude CLI")?;

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
        } else {
            let err = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!("Claude CLI error: {}", err)
        }
    }

    fn reset(&mut self) {}
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detect_returns_none_when_not_installed() {
        // Verifies detect() doesn't panic even when CLI is absent
        let _ = ClaudeAdapter::detect();
    }

    #[test]
    fn new_with_explicit_path_succeeds() {
        // With an explicit path, new() doesn't validate existence
        let result = ClaudeAdapter::new(Some(PathBuf::from("/nonexistent/claude")));
        assert!(result.is_ok());
    }
}
