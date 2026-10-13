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
    let temporary = parent.join(format!(".{name}.flownote-tmp"));
    fs::write(&temporary, content.as_bytes()).map_err(|e| e.to_string())?;
    fs::rename(&temporary, &file).map_err(|e| {
        let _ = fs::remove_file(&temporary);
        e.to_string()
    })
}

fn collect_files(dir: &Path, prefix: &str, out: &mut Vec<String>) {
    let Ok(read) = fs::read_dir(dir) else { return };
    for entry in read.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if is_hidden(&name) {
            continue;
        }
        let path = if prefix.is_empty() { name } else { format!("{prefix}/{name}") };
        match entry.file_type() {
            Ok(t) if t.is_dir() => collect_files(&entry.path(), &path, out),
            Ok(t) if t.is_file() => out.push(path),
            _ => {}
        }
    }
}

/// Every non-hidden file of the vault (notes and attachments), for link resolution.
#[tauri::command]
pub fn vault_files(root: String) -> Vec<String> {
    let mut files = Vec::new();
    collect_files(Path::new(&root), "", &mut files);
    files.sort();
    files
}

#[derive(Serialize)]
pub struct SearchFile {
    path: String,
    /// Matching lines: (0-based line number, line text).
    lines: Vec<(usize, String)>,
}

/// Lines of every note containing `query` (case-insensitive unless asked),
/// at most `limit` lines in total. Positions within lines are computed by the frontend.
#[tauri::command]
pub fn vault_search(root: String, query: String, case_sensitive: bool, limit: usize) -> Vec<SearchFile> {
    let mut files = Vec::new();
    collect_files(Path::new(&root), "", &mut files);
    files.sort();
    let needle = if case_sensitive { query.clone() } else { query.to_lowercase() };
    let mut results = Vec::new();
    let mut total = 0;
    if needle.is_empty() {
        return results;
    }
    for path in files.into_iter().filter(|p| p.ends_with(".md")) {
        let Ok(text) = fs::read_to_string(Path::new(&root).join(&path)) else { continue };
        let lines: Vec<(usize, String)> = text
            .lines()
            .enumerate()
            .filter(|(_, line)| if case_sensitive { line.contains(&needle) } else { line.to_lowercase().contains(&needle) })
            .take(limit.saturating_sub(total))
            .map(|(n, line)| (n, line.to_string()))
            .collect();
        total += lines.len();
        if !lines.is_empty() {
            results.push(SearchFile { path, lines });
        }
        if total >= limit {
            break;
        }
    }
    results
}

/// Raw bytes of a file (images and other attachments), sent without JSON encoding.
#[tauri::command]
pub fn vault_read_binary(root: String, path: String) -> Result<tauri::ipc::Response, String> {
    let file = resolve(&root, &path)?;
    fs::read(&file).map(tauri::ipc::Response::new).map_err(|e| format!("{path}: {e}"))
}

/// Creates a new file; never overwrites an existing one.
#[tauri::command]
pub fn vault_create(root: String, path: String, content: Vec<u8>) -> Result<(), String> {
    use std::io::Write;
    let file = resolve(&root, &path)?;
    if let Some(parent) = file.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut handle = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&file)
        .map_err(|e| format!("{path}: {e}"))?;
    handle.write_all(&content).map_err(|e| e.to_string())
}

/// Obsidian settings (`.obsidian/app.json`), read only; "{}" when absent.
#[tauri::command]
pub fn vault_config(root: String) -> String {
    fs::read_to_string(Path::new(&root).join(".obsidian").join("app.json")).unwrap_or_else(|_| "{}".into())
}

/// Renames a note or a folder; never overwrites an existing path.
#[tauri::command]
pub fn vault_rename(root: String, from: String, to: String) -> Result<(), String> {
    let source = resolve(&root, &from)?;
    let target = resolve(&root, &to)?;
    if !source.exists() {
        return Err(format!("{from} n'existe pas."));
    }
    // Case-only renames are allowed on case-insensitive file systems.
    if target.exists() && from.to_lowercase() != to.to_lowercase() {
        return Err(format!("{to} existe déjà."));
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::rename(&source, &target).map_err(|e| e.to_string())
}

/// Moves a note or folder to the system trash (recoverable).
#[tauri::command]
pub fn vault_trash(root: String, path: String) -> Result<(), String> {
    let target = resolve(&root, &path)?;
    if !target.exists() {
        return Err(format!("{path} n'existe pas."));
    }
    trash::delete(&target).map_err(|e| e.to_string())
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
        let dir = std::env::temp_dir().join(format!("flownote-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let root = dir.to_string_lossy().into_owned();
        fs::write(dir.join("n.md"), "disque").unwrap();
        let err = vault_write(root.clone(), "n.md".into(), "nouveau".into(), Some("ancien".into())).unwrap_err();
        assert!(err.starts_with("CONFLICT:"));
        vault_write(root.clone(), "n.md".into(), "nouveau".into(), Some("disque".into())).unwrap();
        assert_eq!(fs::read_to_string(dir.join("n.md")).unwrap(), "nouveau");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn rename_refuses_to_overwrite() {
        let dir = std::env::temp_dir().join(format!("flownote-rename-{}", std::process::id()));
        fs::create_dir_all(dir.join("A")).unwrap();
        fs::write(dir.join("A.md"), "a").unwrap();
        fs::write(dir.join("A/sous.md"), "s").unwrap();
        fs::write(dir.join("B.md"), "b").unwrap();
        let root = dir.to_string_lossy().into_owned();
        assert!(vault_rename(root.clone(), "A.md".into(), "B.md".into()).is_err());
        vault_rename(root.clone(), "A.md".into(), "C.md".into()).unwrap();
        vault_rename(root.clone(), "A".into(), "C".into()).unwrap();
        assert_eq!(fs::read_to_string(dir.join("C/sous.md")).unwrap(), "s");
        assert!(vault_rename(root.clone(), "C.md".into(), ".obsidian/x.md".into()).is_err());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn create_never_overwrites_and_files_skip_hidden() {
        let dir = std::env::temp_dir().join(format!("flownote-create-{}", std::process::id()));
        fs::create_dir_all(dir.join(".obsidian")).unwrap();
        fs::write(dir.join(".obsidian/app.json"), "{}").unwrap();
        let root = dir.to_string_lossy().into_owned();
        vault_create(root.clone(), "a/b.png".into(), vec![1, 2, 3]).unwrap();
        assert!(vault_create(root.clone(), "a/b.png".into(), vec![9]).is_err());
        assert_eq!(fs::read(dir.join("a/b.png")).unwrap(), vec![1, 2, 3]);
        assert_eq!(vault_files(root.clone()), vec!["a/b.png".to_string()]);
        assert_eq!(vault_config(root), "{}");
        fs::remove_dir_all(&dir).unwrap();
    }
}
