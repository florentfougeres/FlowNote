//! Vault file access. Paths received from the frontend are relative to the vault
//! root; hidden entries (`.obsidian`, `.git`, `.trash`, ...) are never listed,
//! read or written.

use serde::Serialize;
use std::fs;
use std::path::{Component, Path, PathBuf};

#[derive(Serialize)]
pub struct VaultEntry {
    path: String,
    name: String,
    kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    children: Option<Vec<VaultEntry>>,
}

fn is_hidden(name: &str) -> bool {
    name.starts_with('.') || name == "node_modules"
}

/// Resolves a vault-relative path, refusing anything that escapes the root or
/// goes through a hidden folder.
fn resolve(root: &str, relative: &str) -> Result<PathBuf, String> {
    let rel = Path::new(relative);
    for component in rel.components() {
        match component {
            Component::Normal(part) if !is_hidden(&part.to_string_lossy()) => {}
            _ => return Err(format!("Chemin refusé : {relative}")),
        }
    }
    Ok(Path::new(root).join(rel))
}

fn list(dir: &Path, prefix: &str) -> Result<Vec<VaultEntry>, String> {
    let mut entries = Vec::new();
    let read = fs::read_dir(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    for entry in read.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if is_hidden(&name) {
            continue;
        }
        let path = if prefix.is_empty() { name.clone() } else { format!("{prefix}/{name}") };
        let Ok(file_type) = entry.file_type() else { continue };
        if file_type.is_dir() {
            let children = list(&entry.path(), &path)?;
            if !children.is_empty() {
                entries.push(VaultEntry { path, name, kind: "dir", children: Some(children) });
            }
        } else if let Some(stem) = name.strip_suffix(".md") {
            entries.push(VaultEntry { name: stem.to_string(), path, kind: "file", children: None });
        }
    }
    entries.sort_by(|a, b| {
        (a.kind != "dir")
            .cmp(&(b.kind != "dir"))
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}

#[tauri::command]
pub fn vault_tree(root: String) -> Result<Vec<VaultEntry>, String> {
    list(Path::new(&root), "")
}

#[tauri::command]
pub fn vault_read(root: String, path: String) -> Result<String, String> {
    let file = resolve(&root, &path)?;
    fs::read_to_string(&file).map_err(|e| format!("{path}: {e}"))
}

/// Writes `content` only if the file still holds `expected`; the error message
/// starts with `CONFLICT:` otherwise. The write goes through a temporary file
/// and a rename so that Obsidian or a sync client never sees a partial file.
#[tauri::command]
pub fn vault_write(root: String, path: String, content: String, expected: Option<String>) -> Result<(), String> {
    let file = resolve(&root, &path)?;
    if let Some(expected) = expected {
        let current = fs::read_to_string(&file).unwrap_or_default();
        if current != expected {
            return Err(format!("CONFLICT:{path} a été modifié en dehors de l'application."));
        }
    }
    let parent = file.parent().ok_or_else(|| format!("Chemin invalide : {path}"))?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let name = file.file_name().unwrap_or_default().to_string_lossy();
    let temporary = parent.join(format!(".{name}.mon-notion-tmp"));
    fs::write(&temporary, content.as_bytes()).map_err(|e| e.to_string())?;
    fs::rename(&temporary, &file).map_err(|e| {
        let _ = fs::remove_file(&temporary);
        e.to_string()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hidden_and_escaping_paths_are_refused() {
        assert!(resolve("/vault", "note.md").is_ok());
        assert!(resolve("/vault", "dossier/note.md").is_ok());
        assert!(resolve("/vault", ".obsidian/app.json").is_err());
        assert!(resolve("/vault", "a/.git/config").is_err());
        assert!(resolve("/vault", "../hors.md").is_err());
        assert!(resolve("/vault", "/etc/passwd").is_err());
    }

    #[test]
    fn write_refuses_when_file_changed() {
        let dir = std::env::temp_dir().join(format!("mon-notion-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let root = dir.to_string_lossy().into_owned();
        fs::write(dir.join("n.md"), "disque").unwrap();
        let err = vault_write(root.clone(), "n.md".into(), "nouveau".into(), Some("ancien".into())).unwrap_err();
        assert!(err.starts_with("CONFLICT:"));
        vault_write(root.clone(), "n.md".into(), "nouveau".into(), Some("disque".into())).unwrap();
        assert_eq!(fs::read_to_string(dir.join("n.md")).unwrap(), "nouveau");
        fs::remove_dir_all(&dir).unwrap();
    }
}
