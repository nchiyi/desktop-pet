use super::{CliAdapter, Message};
use anyhow::Result;
use std::path::PathBuf;

pub struct CodexAdapter {
    pub cli_path: PathBuf,
}

impl CodexAdapter {
    pub fn new(_path_override: Option<PathBuf>) -> Result<Self> {
        anyhow::bail!("CodexAdapter not yet implemented")
    }
}

impl CliAdapter for CodexAdapter {
    fn name(&self) -> &str { "Codex" }
    fn detect() -> Option<PathBuf> { None }
    fn send_prompt(&mut self, _history: &[Message], _prompt: &str) -> Result<String> {
        anyhow::bail!("not implemented")
    }
    fn reset(&mut self) {}
}
