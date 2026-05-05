use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

pub const ANIMATION_NAMES: &[&str] = &[
    "idle", "walk", "run", "sit", "dance", "sway",
    "stretch", "sleep", "think", "talk", "happy",
    "sad", "drag", "surprised", "impatient",
];

pub const FALLBACK_CHAIN: &[(&str, &str)] = &[
    ("dance",     "happy"),
    ("sway",      "idle"),
    ("stretch",   "idle"),
    ("impatient", "sad"),
    ("talk",      "happy"),
    ("run",       "walk"),
];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CharacterMeta {
    pub name: String,
    pub author: String,
    pub version: String,
    pub size: u32,
    #[serde(default)]
    pub animation: AnimationConfig,
    #[serde(skip)]
    pub dir: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AnimationConfig {
    pub idle_duration: Option<f32>,
    pub think_duration: Option<f32>,
}

impl CharacterMeta {
    pub fn load(dir: &Path) -> Result<Self> {
        let toml_path = dir.join("character.toml");
        let content = std::fs::read_to_string(&toml_path)
            .context("character.toml not found")?;
        let mut meta: CharacterMeta = toml::from_str(&content)
            .context("Failed to parse character.toml")?;
        meta.dir = dir.to_path_buf();

        // Verify idle.gif or idle.png or idle.webp exists
        let idle_exists = ["idle.gif", "idle.png", "idle.webp"]
            .iter()
            .any(|f| dir.join(f).exists());
        if !idle_exists {
            bail!("Character must have at least idle.gif, idle.png, or idle.webp");
        }

        Ok(meta)
    }

    /// Returns path to animation file, with fallback chain.
    pub fn animation_path(&self, anim: &str) -> PathBuf {
        let exts = ["gif", "webp", "png"];
        for ext in &exts {
            let p = self.dir.join(format!("{}.{}", anim, ext));
            if p.exists() { return p; }
            let sprite = self.dir.join(format!("{}_sprite.png", anim));
            if sprite.exists() { return sprite; }
        }
        // Try fallback chain
        for (from, to) in FALLBACK_CHAIN {
            if *from == anim {
                return self.animation_path(to);
            }
        }
        // Final fallback: idle
        if anim != "idle" {
            return self.animation_path("idle");
        }
        // Last resort: thumbnail
        let thumb = self.dir.join("thumbnail.png");
        if thumb.exists() { return thumb; }
        self.dir.join("idle.gif")
    }

    pub fn list_available(characters_dir: &Path) -> Vec<CharacterMeta> {
        let Ok(entries) = std::fs::read_dir(characters_dir) else { return vec![] };
        entries
            .filter_map(|e| e.ok())
            .filter(|e| e.path().is_dir())
            .filter_map(|e| CharacterMeta::load(&e.path()).ok())
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn loads_character_from_dir() {
        let dir = tempdir().unwrap();
        let char_dir = dir.path().join("mychar");
        fs::create_dir(&char_dir).unwrap();
        fs::write(
            char_dir.join("character.toml"),
            "name = \"Test\"\nauthor = \"me\"\nversion = \"1.0\"\nsize = 80",
        ).unwrap();
        fs::write(char_dir.join("idle.gif"), b"GIF89a").unwrap();

        let meta = CharacterMeta::load(&char_dir).unwrap();
        assert_eq!(meta.name, "Test");
        assert_eq!(meta.size, 80);
    }

    #[test]
    fn missing_idle_returns_error() {
        let dir = tempdir().unwrap();
        let char_dir = dir.path().join("empty");
        fs::create_dir(&char_dir).unwrap();
        fs::write(
            char_dir.join("character.toml"),
            "name = \"X\"\nauthor = \"\"\nversion = \"1.0\"\nsize = 80",
        ).unwrap();
        let result = CharacterMeta::load(&char_dir);
        assert!(result.is_err());
    }

    #[test]
    fn animation_path_falls_back_to_idle() {
        let dir = tempdir().unwrap();
        let char_dir = dir.path().join("char");
        fs::create_dir(&char_dir).unwrap();
        fs::write(
            char_dir.join("character.toml"),
            "name = \"X\"\nauthor = \"\"\nversion = \"1.0\"\nsize = 80",
        ).unwrap();
        fs::write(char_dir.join("idle.gif"), b"GIF89a").unwrap();

        let meta = CharacterMeta::load(&char_dir).unwrap();
        // "dance" falls back to "happy", which falls back to "idle"
        let path = meta.animation_path("dance");
        assert_eq!(path, char_dir.join("idle.gif"));
    }

    #[test]
    fn list_available_returns_valid_characters() {
        let dir = tempdir().unwrap();
        // Create one valid character
        let char_dir = dir.path().join("cat");
        fs::create_dir(&char_dir).unwrap();
        fs::write(
            char_dir.join("character.toml"),
            "name = \"Cat\"\nauthor = \"me\"\nversion = \"1.0\"\nsize = 80",
        ).unwrap();
        fs::write(char_dir.join("idle.gif"), b"GIF89a").unwrap();
        // Create one invalid (no idle)
        let bad_dir = dir.path().join("bad");
        fs::create_dir(&bad_dir).unwrap();
        fs::write(
            bad_dir.join("character.toml"),
            "name = \"Bad\"\nauthor = \"\"\nversion = \"1.0\"\nsize = 80",
        ).unwrap();

        let list = CharacterMeta::list_available(dir.path());
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "Cat");
    }
}
