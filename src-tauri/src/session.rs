use crate::adapters::Message;
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

const TURN_LIMIT: usize = 30;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub created_at: u64,
    messages: Vec<Message>,
}

impl Session {
    pub fn new(id: String) -> Self {
        Self {
            id,
            created_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
            messages: Vec::new(),
        }
    }

    pub fn add_exchange(&mut self, user_msg: String, assistant_msg: String) {
        self.messages.push(Message { role: "user".into(), content: user_msg });
        self.messages.push(Message { role: "assistant".into(), content: assistant_msg });
    }

    pub fn turn_count(&self) -> usize {
        self.messages.len() / 2
    }

    pub fn at_turn_limit(&self) -> bool {
        self.turn_count() >= TURN_LIMIT
    }

    pub fn messages(&self) -> &[Message] {
        &self.messages
    }

    pub fn reset(&mut self) {
        self.messages.clear();
    }

    pub fn save(&self, dir: &PathBuf) -> Result<()> {
        std::fs::create_dir_all(dir)?;
        let path = dir.join(format!("{}.json", self.id));
        std::fs::write(path, serde_json::to_string_pretty(self)?)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_session_has_zero_turns() {
        let s = Session::new("test".into());
        assert_eq!(s.turn_count(), 0);
    }

    #[test]
    fn adding_exchange_increments_turns() {
        let mut s = Session::new("test".into());
        s.add_exchange("hello".into(), "hi".into());
        assert_eq!(s.turn_count(), 1);
    }

    #[test]
    fn at_30_turns_is_at_limit() {
        let mut s = Session::new("test".into());
        for i in 0..30 {
            s.add_exchange(format!("q{i}"), format!("a{i}"));
        }
        assert!(s.at_turn_limit());
    }

    #[test]
    fn below_30_turns_not_at_limit() {
        let mut s = Session::new("test".into());
        s.add_exchange("q".into(), "a".into());
        assert!(!s.at_turn_limit());
    }

    #[test]
    fn reset_clears_messages_and_turns() {
        let mut s = Session::new("test".into());
        s.add_exchange("q".into(), "a".into());
        s.reset();
        assert_eq!(s.turn_count(), 0);
        assert!(s.messages().is_empty());
    }

    #[test]
    fn save_creates_json_file() {
        use tempfile::tempdir;
        let dir = tempdir().unwrap();
        let mut s = Session::new("abc123".into());
        s.add_exchange("hello".into(), "world".into());
        s.save(&dir.path().to_path_buf()).unwrap();
        assert!(dir.path().join("abc123.json").exists());
    }
}
