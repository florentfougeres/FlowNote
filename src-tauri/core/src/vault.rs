//! Vault file access. Paths received from the frontend are relative to the vault
//! root; hidden entries (`.obsidian`, `.git`, `.trash`, ...) are never listed,
//! read or written.

use serde::Serialize;
use std::fs;
use std::collections::HashSet;
use std::path::{Component, Path, PathBuf};
use std::sync::{Mutex, OnceLock};

#[derive(Serialize)]
pub struct VaultEntry {
    path: String,
    name: String,
    kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    children: Option<Vec<VaultEntry>>,
    /// The note is a ticket (front matter with `type: ticket`).
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    ticket: bool,
    /// The note is a presentation (front matter with `marp: true`).
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    presentation: bool,
    /// Emoji of the `icon` front matter property, shown like a Notion page icon.
    #[serde(skip_serializing_if = "Option::is_none")]
    icon: Option<String>,
    /// The page's own title: a note's first `# heading`, the `title` property otherwise.
    #[serde(skip_serializing_if = "Option::is_none")]
    title: Option<String>,
}

/// The beginning of a file, enough for its front matter and first line.
fn head(path: &Path) -> Option<String> {
    use std::io::Read;
    let mut head = vec![0u8; 4096];
    let mut file = fs::File::open(path).ok()?;
    let read = file.read(&mut head).ok()?;
    Some(String::from_utf8_lossy(&head[..read]).trim_start_matches('\u{feff}').to_string())
}

/// Front matter and body of a file's beginning.
fn split_front_matter(text: &str) -> (Option<&str>, &str) {
    let Some(rest) = text.strip_prefix("---") else { return (None, text) };
    let Some(end) = rest.find("\n---") else { return (None, text) };
    let body = rest[end + 4..].split_once('\n').map_or("", |(_, b)| b);
    (Some(&rest[..end]), body)
}

/// Front matter of a note, read from the beginning of the file only.
#[cfg(test)]
fn front_matter(path: &Path) -> Option<String> {
    head(path).and_then(|text| split_front_matter(&text).0.map(str::to_string))
}

/// A page's title (see `pageTitle` in icon.ts): a plain note's first line when it is
/// a `# heading`, the `title` property for the other kinds.
fn title_of(yaml: Option<&str>, body: &str, plain_note: bool) -> Option<String> {
    if !plain_note {
        return yaml.and_then(|y| property(y, "title")).filter(|v| !v.is_empty()).map(str::to_string);
    }
    let first = body.lines().find(|l| !l.trim().is_empty())?;
    let text = first.trim_start_matches(' ').strip_prefix("# ")?.trim().trim_end_matches('#').trim();
    let mut plain = String::new();
    let mut rest = text;
    // [[target|label]] shows its label, [[target]] its target; emphasis marks go.
    while let Some(start) = rest.find("[[") {
        plain.push_str(&rest[..start]);
        let Some(end) = rest[start..].find("]]") else { break };
        let link = &rest[start + 2..start + end];
        plain.push_str(link.split_once('|').map_or(link, |(_, label)| label));
        rest = &rest[start + end + 2..];
    }
    plain.push_str(rest);
    let plain: String = plain.chars().filter(|c| !matches!(c, '*' | '_' | '`' | '~' | '=')).collect();
    let plain = plain.trim();
    (!plain.is_empty()).then(|| plain.to_string())
}

/// Value of a top-level `key: value` line of the front matter, unquoted.
fn property<'a>(yaml: &'a str, key: &str) -> Option<&'a str> {
    yaml.lines().find_map(|line| {
        let value = line.trim_end_matches('\r').strip_prefix(key)?.trim_start().strip_prefix(':')?;
        Some(value.trim().trim_matches(|c| c == '"' || c == '\''))
    })
}

fn is_ticket(yaml: &str) -> bool {
    property(yaml, "type") == Some("ticket")
}

fn is_presentation(yaml: &str) -> bool {
    property(yaml, "marp") == Some("true")
}

/// The `icon` property when it is an emoji (not a plugin icon name like "LiHome").
fn icon_of(yaml: &str) -> Option<String> {
    property(yaml, "icon").filter(|v| !v.is_empty() && v.chars().count() <= 16 && !v.is_ascii()).map(str::to_string)
}

#[cfg(test)]
fn is_ticket_file(path: &Path) -> bool {
    front_matter(path).is_some_and(|yaml| is_ticket(&yaml))
}

fn is_hidden(name: &str) -> bool {
    name.starts_with('.') || name == "node_modules"
}

/// Folders chosen by the user in the folder picker (`vault_pick`), kept in the
/// app's data folder: a new vault (no `.obsidian` yet) opens again later.
struct Trusted {
    file: Option<PathBuf>,
    roots: HashSet<String>,
}

fn trusted() -> &'static Mutex<Trusted> {
    static TRUSTED: OnceLock<Mutex<Trusted>> = OnceLock::new();
    TRUSTED.get_or_init(|| Mutex::new(Trusted { file: None, roots: HashSet::new() }))
}

/// Reads the folders trusted in an earlier session (called at startup).
pub fn load_trusted(file: PathBuf) {
    let roots: Vec<String> = fs::read_to_string(&file).ok().and_then(|text| serde_json::from_str(&text).ok()).unwrap_or_default();
    let mut state = trusted().lock().unwrap_or_else(|e| e.into_inner());
    state.roots.extend(roots);
    state.file = Some(file);
}

/// Trusts a folder chosen in the app's folder picker: it opens even when it is
/// not an Obsidian vault yet (no `.obsidian`).
pub fn trust(root: &str) {
    let mut state = trusted().lock().unwrap_or_else(|e| e.into_inner());
    if !state.roots.insert(root.to_string()) {
        return;
    }
    if let Some(file) = &state.file {
        let mut roots: Vec<&String> = state.roots.iter().collect();
        roots.sort();
        if let Some(parent) = file.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let _ = fs::write(file, serde_json::to_string_pretty(&roots).unwrap_or_default());
    }
}

/// The root of a vault the app works in: an absolute folder that is an
/// Obsidian vault (it holds `.obsidian`) or that the user chose in the folder
/// picker. Every command checks it, so that the commands only reach inside a
/// vault (never the home folder), whatever the page asks for.
pub fn check_root(root: &str) -> Result<&Path, String> {
    let path = Path::new(root);
    let known = path.join(".obsidian").is_dir() || trusted().lock().map(|t| t.roots.contains(root)).unwrap_or(false);
    if path.is_absolute() && path.is_dir() && known {
        Ok(path)
    } else {
        Err(format!("Dossier non autorisé : {root}. Choisissez-le avec « Ouvrir un vault »."))
    }
}

/// Resolves a vault-relative path, refusing anything that escapes the root or
/// goes through a hidden folder.
fn resolve(root: &str, relative: &str) -> Result<PathBuf, String> {
    let base = check_root(root)?;
    let rel = Path::new(relative);
    for component in rel.components() {
        match component {
            Component::Normal(part) if !is_hidden(&part.to_string_lossy()) => {}
            _ => return Err(format!("Chemin refusé : {relative}")),
        }
    }
    Ok(base.join(rel))
}

/// A folder with nothing visible in it (hidden files such as `.DS_Store` aside).
fn is_empty_dir(dir: &Path) -> bool {
    fs::read_dir(dir).is_ok_and(|read| read.flatten().all(|e| is_hidden(&e.file_name().to_string_lossy())))
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
            // An empty folder is shown (just created); one holding only attachments is not.
            if !children.is_empty() || is_empty_dir(&entry.path()) {
                entries.push(VaultEntry { path, name, kind: "dir", children: Some(children), ticket: false, presentation: false, icon: None, title: None });
            }
        } else if let Some(stem) = name.strip_suffix(".md") {
            let text = head(&entry.path()).unwrap_or_default();
            let (yaml, body) = split_front_matter(&text);
            let ticket = yaml.is_some_and(is_ticket);
            let presentation = yaml.is_some_and(is_presentation);
            let icon = yaml.and_then(icon_of);
            let lower = name.to_lowercase();
            let plain_note = !ticket && !presentation && !lower.ends_with(".excalidraw.md") && !lower.ends_with(".mindmap.md");
            let title = title_of(yaml, body, plain_note);
            entries.push(VaultEntry { name: stem.to_string(), path, kind: "file", children: None, ticket, presentation, icon, title });
        } else if let Some(stem) = name.strip_suffix(".base") {
            // A base (Obsidian's format): shown as a page whose rows are its folder's notes.
            entries.push(VaultEntry { name: stem.to_string(), path, kind: "file", children: None, ticket: false, presentation: false, icon: None, title: None });
        } else if let Some(stem) = name.strip_suffix(".canvas") {
            // A canvas (Obsidian's JSON Canvas): cards and arrows on a board.
            entries.push(VaultEntry { name: stem.to_string(), path, kind: "file", children: None, ticket: false, presentation: false, icon: None, title: None });
        }
    }
    entries.sort_by(|a, b| {
        (a.kind != "dir")
            .cmp(&(b.kind != "dir"))
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}

pub fn vault_tree(root: String) -> Result<Vec<VaultEntry>, String> {
    list(check_root(&root)?, "")
}

pub fn vault_read(root: String, path: String) -> Result<String, String> {
    let file = resolve(&root, &path)?;
    fs::read_to_string(&file).map_err(|e| format!("{path}: {e}"))
}

/// Writes `content` only if the file still holds `expected`; the error message
/// starts with `CONFLICT:` otherwise. The write goes through a temporary file
/// and a rename so that Obsidian or a sync client never sees a partial file.
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
pub fn vault_files(root: String) -> Vec<String> {
    let Ok(base) = check_root(&root) else { return Vec::new() };
    let mut files = Vec::new();
    collect_files(base, "", &mut files);
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
pub fn vault_search(root: String, query: String, case_sensitive: bool, limit: usize) -> Vec<SearchFile> {
    let Ok(base) = check_root(&root) else { return Vec::new() };
    let mut files = Vec::new();
    collect_files(base, "", &mut files);
    files.sort();
    let needle = if case_sensitive { query.clone() } else { query.to_lowercase() };
    let mut results = Vec::new();
    let mut total = 0;
    if needle.is_empty() {
        return results;
    }
    for path in files.into_iter().filter(|p| p.ends_with(".md")) {
        let Ok(text) = fs::read_to_string(base.join(&path)) else { continue };
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

/// Raw bytes of a file (images and other attachments).
pub fn vault_read_binary(root: String, path: String) -> Result<Vec<u8>, String> {
    let file = resolve(&root, &path)?;
    fs::read(&file).map_err(|e| format!("{path}: {e}"))
}

/// Creates a new file; never overwrites an existing one.
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

/// Creates an empty folder; never takes the place of an existing file or folder.
pub fn vault_create_dir(root: String, path: String) -> Result<(), String> {
    let dir = resolve(&root, &path)?;
    if dir.exists() {
        return Err(format!("{path} existe déjà."));
    }
    fs::create_dir_all(&dir).map_err(|e| format!("{path}: {e}"))
}

/// Shows a note or folder of the vault in the Finder, selected.
pub fn vault_reveal(root: String, path: String) -> Result<(), String> {
    let target = resolve(&root, &path)?;
    if !target.exists() {
        return Err(format!("{path} n'existe pas."));
    }
    std::process::Command::new("open").arg("-R").arg(&target).spawn().map(|_| ()).map_err(|e| e.to_string())
}

/// Obsidian settings (`.obsidian/app.json`), read only; "{}" when absent.
pub fn vault_config(root: String) -> String {
    let Ok(base) = check_root(&root) else { return "{}".into() };
    fs::read_to_string(base.join(".obsidian").join("app.json")).unwrap_or_else(|_| "{}".into())
}

/// Every note of the vault with its content, in one call (dashboard statistics).
/// Notes over 1 MB are skipped.
pub fn vault_read_notes(root: String) -> Vec<(String, String)> {
    let Ok(base) = check_root(&root) else { return Vec::new() };
    let mut files = Vec::new();
    collect_files(base, "", &mut files);
    files
        .into_iter()
        .filter(|p| p.ends_with(".md"))
        .filter_map(|p| {
            let full = base.join(&p);
            let size = fs::metadata(&full).map(|m| m.len()).unwrap_or(u64::MAX);
            if size > 1_000_000 {
                return None;
            }
            fs::read_to_string(full).ok().map(|text| (p, text))
        })
        .collect()
}

/// Creation and modification times of the notes (ms since 1970), for the
/// file properties of bases (file.ctime, file.mtime).
#[derive(Serialize)]
pub struct FileStat {
    path: String,
    ctime: f64,
    mtime: f64,
}

fn millis(time: std::io::Result<std::time::SystemTime>) -> f64 {
    time.ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map_or(0.0, |d| d.as_millis() as f64)
}

pub fn vault_stats(root: String) -> Vec<FileStat> {
    let Ok(base) = check_root(&root) else { return Vec::new() };
    let mut files = Vec::new();
    collect_files(base, "", &mut files);
    files
        .into_iter()
        .filter(|p| p.ends_with(".md"))
        .filter_map(|path| {
            let meta = fs::metadata(base.join(&path)).ok()?;
            let mtime = millis(meta.modified());
            let ctime = millis(meta.created()).max(0.0);
            Some(FileStat { path, ctime: if ctime > 0.0 { ctime } else { mtime }, mtime })
        })
        .collect()
}

/// Obsidian's bookmarks (.obsidian/bookmarks.json), read only; "{}" when absent.
pub fn vault_bookmarks(root: String) -> String {
    let Ok(base) = check_root(&root) else { return "{}".into() };
    fs::read_to_string(base.join(".obsidian").join("bookmarks.json")).unwrap_or_else(|_| "{}".into())
}

/// Renames a note or a folder; never overwrites an existing path.
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
pub fn vault_trash(root: String, path: String) -> Result<(), String> {
    let target = resolve(&root, &path)?;
    // Already gone (deleted elsewhere, or a deletion done halfway): nothing to do.
    if !target.exists() {
        return Ok(());
    }
    trash::delete(&target).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn presentations_have_marp_true() {
        assert!(is_presentation("marp: true\ntheme: gaia"));
        assert!(is_presentation("marp: \"true\"\r"));
        assert!(!is_presentation("marp: false"));
        assert!(!is_presentation("type: ticket"));
    }

    #[test]
    fn page_titles_come_from_the_first_heading_or_the_title_property() {
        let (yaml, body) = split_front_matter("---\ntitle: Diapos\n---\n\n# Mon **titre** [[Cible|lien]]\nTexte");
        assert_eq!(title_of(yaml, body, true), Some("Mon titre lien".into()));
        assert_eq!(title_of(yaml, body, false), Some("Diapos".into()));
        assert_eq!(title_of(None, "Texte\n# Plus loin", true), None);
        assert_eq!(title_of(None, "## Sous-titre", true), None);
    }

    #[test]
    fn page_icons_come_from_the_icon_property() {
        assert_eq!(icon_of("title: x\nicon: 🚀"), Some("🚀".into()));
        assert_eq!(icon_of("icon: \"📚\"\r"), Some("📚".into()));
        assert_eq!(icon_of("icon: LiHome"), None);
        assert_eq!(icon_of("icon:"), None);
        assert_eq!(icon_of("type: ticket"), None);
    }

    #[test]
    fn tickets_are_recognised_by_their_front_matter() {
        let dir = std::env::temp_dir().join(format!("flownote-tk-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let write = |name: &str, text: &str| {
            fs::write(dir.join(name), text).unwrap();
            is_ticket_file(&dir.join(name))
        };
        assert!(write("a.md", "---\ntype: ticket\nstatus: open\n---\nTexte\n"));
        assert!(write("b.md", "---\r\ntype: \"ticket\"\r\n---\r\n"));
        assert!(!write("c.md", "---\ntype: note\n---\n"));
        assert!(!write("d.md", "type: ticket\n"));
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn hidden_and_escaping_paths_are_refused() {
        let dir = std::env::temp_dir().join(format!("flownote-paths-{}", std::process::id()));
        fs::create_dir_all(dir.join(".obsidian")).unwrap();
        let vault = dir.to_string_lossy().into_owned();
        assert!(resolve(&vault, "note.md").is_ok());
        assert!(resolve(&vault, "dossier/note.md").is_ok());
        assert!(resolve(&vault, ".obsidian/app.json").is_err());
        assert!(resolve(&vault, "a/.git/config").is_err());
        assert!(resolve(&vault, "../hors.md").is_err());
        assert!(resolve(&vault, "/etc/passwd").is_err());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn only_obsidian_vaults_are_reachable() {
        let dir = std::env::temp_dir().join(format!("flownote-notvault-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let root = dir.to_string_lossy().into_owned();
        // A folder without .obsidian (the home folder…) is refused, and so is a relative root.
        // (A folder chosen in the picker is trusted: see `trust`.)
        assert!(resolve(&root, "note.md").is_err());
        assert!(vault_write(root.clone(), "x.md".into(), "x".into(), None).is_err());
        assert!(!dir.join("x.md").exists());
        assert!(vault_files(root.clone()).is_empty());
        assert!(check_root("relatif").is_err());
        // Once chosen in the picker, the same folder opens.
        trust(&root);
        assert!(vault_write(root.clone(), "x.md".into(), "x".into(), None).is_ok());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn write_refuses_when_file_changed() {
        let dir = std::env::temp_dir().join(format!("flownote-test-{}", std::process::id()));
        fs::create_dir_all(dir.join(".obsidian")).unwrap();
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
        fs::create_dir_all(dir.join(".obsidian")).unwrap();
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

    #[test]
    fn empty_folders_are_created_and_shown() {
        let dir = std::env::temp_dir().join(format!("flownote-dir-{}", std::process::id()));
        fs::create_dir_all(dir.join("images")).unwrap();
        fs::create_dir_all(dir.join(".obsidian")).unwrap();
        fs::write(dir.join("images/a.png"), [0]).unwrap();
        let root = dir.to_string_lossy().into_owned();
        vault_create_dir(root.clone(), "Projets/2026".into()).unwrap();
        assert!(vault_create_dir(root.clone(), "Projets".into()).is_err());
        assert!(vault_create_dir(root.clone(), ".cache".into()).is_err());
        fs::write(dir.join("Projets/2026/.DS_Store"), [0]).unwrap();
        fs::write(dir.join("Plan.canvas"), "{}").unwrap();
        let tree = vault_tree(root).unwrap();
        // The attachments folder stays hidden; the new folders and the canvas are shown.
        assert_eq!(tree.iter().map(|e| e.path.as_str()).collect::<Vec<_>>(), vec!["Projets", "Plan.canvas"]);
        assert_eq!(tree[1].name, "Plan");
        assert_eq!(tree[0].children.as_ref().unwrap()[0].path, "Projets/2026");
        fs::remove_dir_all(&dir).unwrap();
    }
}
