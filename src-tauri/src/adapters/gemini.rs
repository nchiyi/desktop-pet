use super::{CliAdapter, Message};
use anyhow::{Context, Result};
use std::path::PathBuf;
use std::process::Command;

pub struct GeminiAdapter {
    pub cli_path: PathBuf,
}

impl GeminiAdapter {
    pub fn new(path_override: Option<PathBuf>) -> Result<Self> {
        let cli_path = path_override
            .or_else(Self::detect)
            .context("Gemini CLI not found. Install with: npm install -g @google/gemini-cli")?;
        Ok(Self { cli_path })
    }
}

impl CliAdapter for GeminiAdapter {
    fn name(&self) -> &str { "Gemini CLI" }

    fn detect() -> Option<PathBuf> {
        let output = if cfg!(target_os = "windows") {
            Command::new("where").arg("gemini").output().ok()?
        } else {
            Command::new("which").arg("gemini").output().ok()?
        };
        if output.status.success() {
            let path = String::from_utf8(output.stdout).ok()?.trim().lines().next()?.to_string();
            Some(PathBuf::from(path))
        } else {
            #[cfg(target_os = "windows")]
            {
                let appdata = std::env::var("APPDATA").ok()?;
                let p = PathBuf::from(appdata).join("npm").join("gemini.cmd");
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
            .args(["-p", &full_prompt])
            .output()
            .context("Failed to run gemini CLI")?;

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
        } else {
            let err = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!("Gemini CLI error: {}", err)
        }
    }

    fn reset(&mut self) {}
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn detect_does_not_panic() { let _ = GeminiAdapter::detect(); }

    #[test]
    fn new_with_explicit_path_succeeds() {
        let result = GeminiAdapter::new(Some(PathBuf::from("/nonexistent/gemini")));
        assert!(result.is_ok());
    }
}
