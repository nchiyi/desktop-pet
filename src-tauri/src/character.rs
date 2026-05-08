use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

const OVERRIDES_FILENAME: &str = "animations.toml";
const IMAGE_EXTS: &[&str] = &["gif", "webp", "png", "jpg", "jpeg"];

/// Per-character animation file overrides. Sits in `<char_dir>/animations.toml`.
/// Filenames are relative to the character dir. Missing keys fall back to the
/// auto-scan rules in [`CharacterMeta::animation_path`].
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AnimationOverrides {
    #[serde(default)]
    pub overrides: HashMap<String, String>,
}

impl AnimationOverrides {
    pub fn load(dir: &Path) -> Self {
        let path = dir.join(OVERRIDES_FILENAME);
        match std::fs::read_to_string(&path) {
            Ok(s) => toml::from_str(&s).unwrap_or_default(),
            Err(_) => Self::default(),
        }
    }

    pub fn save(&self, dir: &Path) -> Result<()> {
        let path = dir.join(OVERRIDES_FILENAME);
        let s = toml::to_string_pretty(self)?;
        std::fs::write(path, s)?;
        Ok(())
    }
}

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
    /// Priority: user override (animations.toml) → exact match → fallback chain → idle.
    pub fn animation_path(&self, anim: &str) -> PathBuf {
        let overrides = AnimationOverrides::load(&self.dir);
        self.animation_path_with_overrides(anim, &overrides)
    }

    /// Resolve `<anim>_<direction>` first (e.g. `walk_left.gif`); if no such
    /// file exists, fall back to the standard `<anim>` resolution. The `_static`
    /// switching is the frontend's job (it asks for `_static` on a separate
    /// timer), so this method is purely for direction variants.
    pub fn animation_path_directional(&self, anim: &str, direction: Option<&str>) -> PathBuf {
        if let Some(d) = direction {
            if !d.is_empty() {
                let with_dir = format!("{}_{}", anim, d);
                let overrides = AnimationOverrides::load(&self.dir);
                if let Some(rel) = overrides.overrides.get(&with_dir) {
                    let p = self.dir.join(rel);
                    if p.exists() { return p; }
                }
                for ext in IMAGE_EXTS {
                    let p = self.dir.join(format!("{}.{}", with_dir, ext));
                    if p.exists() { return p; }
                }
            }
        }
        self.animation_path(anim)
    }

    fn animation_path_with_overrides(
        &self,
        anim: &str,
        overrides: &AnimationOverrides,
    ) -> PathBuf {
        // 1. Honor user override (relative path resolved against char dir)
        if let Some(rel) = overrides.overrides.get(anim) {
            let p = self.dir.join(rel);
            if p.exists() { return p; }
        }
        // 2. Auto-scan exact match: <anim>.gif/webp/png
        for ext in IMAGE_EXTS {
            let p = self.dir.join(format!("{}.{}", anim, ext));
            if p.exists() { return p; }
            let sprite = self.dir.join(format!("{}_sprite.png", anim));
            if sprite.exists() { return sprite; }
        }
        // 3. Try fallback chain
        for (from, to) in FALLBACK_CHAIN {
            if *from == anim {
                return self.animation_path_with_overrides(to, overrides);
            }
        }
        // 4. Final fallback: idle
        if anim != "idle" {
            return self.animation_path_with_overrides("idle", overrides);
        }
        // 5. Last resort: thumbnail
        let thumb = self.dir.join("thumbnail.png");
        if thumb.exists() { return thumb; }
        self.dir.join("idle.gif")
    }

    /// Look for a `<anim>_static.<ext>` file in the character dir.
    /// Used by the frontend to swap a sit/sleep GIF to a still frame after the
    /// transition has finished, so the character looks "held" instead of
    /// looping the sit-down motion forever.
    pub fn animation_static_path(&self, anim: &str) -> Option<PathBuf> {
        for ext in IMAGE_EXTS {
            let p = self.dir.join(format!("{}_static.{}", anim, ext));
            if p.exists() { return Some(p); }
        }
        None
    }

    /// List image files in the character dir for the picker UI.
    /// Returns just filenames (relative), filtered by recognized extensions.
    pub fn list_image_files(&self) -> Vec<String> {
        let mut out = Vec::new();
        let Ok(entries) = std::fs::read_dir(&self.dir) else { return out };
        for entry in entries.flatten() {
            if !entry.file_type().map(|t| t.is_file()).unwrap_or(false) { continue; }
            let path = entry.path();
            let ext_ok = path
                .extension()
                .and_then(|s| s.to_str())
                .map(|e| IMAGE_EXTS.contains(&e.to_lowercase().as_str()))
                .unwrap_or(false);
            if !ext_ok { continue; }
            if let Some(name) = path.file_name().and_then(|s| s.to_str()) {
                out.push(name.to_string());
            }
        }
        out.sort();
        out
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
