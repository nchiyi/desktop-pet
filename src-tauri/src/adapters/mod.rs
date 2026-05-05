use anyhow::Result;
use std::path::PathBuf;

pub trait CliAdapter: Send {
    fn name(&self) -> &str;
    fn detect() -> Option<PathBuf> where Self: Sized;
    fn send_prompt(&mut self, history: &[Message], prompt: &str) -> Result<String>;
    fn reset(&mut self);
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Message {
    pub role: String,   // "user" or "assistant"
    pub content: String,
}

pub mod claude;
pub mod gemini;
pub mod codex;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn message_serializes() {
        let m = Message { role: "user".into(), content: "hello".into() };
        let json = serde_json::to_string(&m).unwrap();
        assert!(json.contains("user"));
    }
}
