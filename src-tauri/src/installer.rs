use anyhow::{Context, Result};
use std::io;
use std::path::Path;

pub fn install_zip(zip_path: &Path, characters_dir: &Path) -> Result<()> {
    let file = std::fs::File::open(zip_path)
        .context("Cannot open ZIP file")?;
    let mut archive = zip::ZipArchive::new(file)
        .context("Invalid ZIP file")?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)?;
        let out_path = characters_dir.join(entry.name());
        if entry.is_dir() {
            std::fs::create_dir_all(&out_path)?;
        } else {
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut outfile = std::fs::File::create(&out_path)?;
            io::copy(&mut entry, &mut outfile)?;
        }
    }
    Ok(())
}

pub fn open_characters_dir(characters_dir: &Path) -> Result<()> {
    std::fs::create_dir_all(characters_dir)?;
    #[cfg(target_os = "macos")]
    std::process::Command::new("open").arg(characters_dir).spawn()?;
    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer").arg(characters_dir).spawn()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;
    use tempfile::tempdir;

    fn make_zip_with_character(zip_path: &std::path::Path) {
        let file = fs::File::create(zip_path).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        let opts = zip::write::SimpleFileOptions::default();
        zip.add_directory("mychar/", opts).unwrap();
        zip.start_file("mychar/character.toml", opts).unwrap();
        zip.write_all(b"name=\"X\"\nauthor=\"\"\nversion=\"1.0\"\nsize=80").unwrap();
        zip.start_file("mychar/idle.gif", opts).unwrap();
        zip.write_all(b"GIF89a").unwrap();
        zip.finish().unwrap();
    }

    #[test]
    fn install_zip_extracts_character_dir() {
        let src_dir = tempdir().unwrap();
        let dst_dir = tempdir().unwrap();
        let zip_path = src_dir.path().join("mychar.zip");
        make_zip_with_character(&zip_path);
        install_zip(&zip_path, dst_dir.path()).unwrap();
        assert!(dst_dir.path().join("mychar").join("character.toml").exists());
        assert!(dst_dir.path().join("mychar").join("idle.gif").exists());
    }
}
