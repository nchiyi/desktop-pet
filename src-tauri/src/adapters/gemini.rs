use super::{CliAdapter, Message};
use anyhow::Result;
use std::path::PathBuf;

pub struct GeminiAdapter {
    pub cli_path: PathBuf,
}

impl GeminiAdapter {
    pub fn new(_path_override: Option<PathBuf>) -> Result<Self> {
        anyhow::bail!("GeminiAdapter not yet implemented")
    }
}

impl CliAdapter for GeminiAdapter {
    fn name(&self) -> &str { "Gemini CLI" }
    fn detect() -> Option<PathBuf> { None }
    fn send_prompt(&mut self, _history: &[Message], _prompt: &str) -> Result<String> {
        anyhow::bail!("not implemented")
    }
    fn reset(&mut self) {}
}
