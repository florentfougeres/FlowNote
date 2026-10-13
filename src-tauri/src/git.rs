//! Git manager. Runs the system `git` (the user's configuration, credentials and
//! hooks apply) with `-C <vault>`. Paths exchanged with the frontend are relative
//! to the vault, which may be a sub-folder of the repository.

use serde::Serialize;
use std::io::Write;
use std::path::{Component, Path};
use std::process::{Command, Output, Stdio};

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GitFile {
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub orig_path: Option<String>,
    /// Porcelain status letters (`M`, `A`, `D`, `R`, `C`, `U`, `?`), or a space.
    pub index: String,
    pub worktree: String,
}

#[derive(Serialize, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub is_repo: bool,
    pub branch: Option<String>,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub files: Vec<GitFile>,
}

/// GUI apps on macOS get a minimal PATH: prefer the usual install locations.
fn git_binary() -> &'static str {
    ["/opt/homebrew/bin/git", "/usr/local/bin/git", "/usr/bin/git"]
        .into_iter()
        .find(|p| Path::new(p).exists())
        .unwrap_or("git")
}

fn git(root: &str) -> Command {
    let mut cmd = Command::new(git_binary());
    cmd.arg("-C")
        .arg(root)
        // Never wait for a credential prompt nobody can see.
        .env("GIT_TERMINAL_PROMPT", "0")
        // Read-only commands must not take the index lock (Obsidian Git may be running).
        .env("GIT_OPTIONAL_LOCKS", "0")
        .stdin(Stdio::null());
    cmd
}

fn run(mut cmd: Command, input: Option<&[u8]>, accepted_codes: &[i32]) -> Result<Output, String> {
    if input.is_some() {
        cmd.stdin(Stdio::piped());
    }
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = cmd.spawn().map_err(|e| format!("git introuvable : {e}"))?;
    if let (Some(data), Some(mut stdin)) = (input, child.stdin.take()) {
        stdin.write_all(data).map_err(|e| e.to_string())?;
    }
    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    let code = output.status.code().unwrap_or(-1);
    if output.status.success() || accepted_codes.contains(&code) {
        Ok(output)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Err(if stderr.is_empty() { stdout } else { stderr })
    }
}

fn check_path(path: &str) -> Result<(), String> {
    if Path::new(path).components().all(|c| matches!(c, Component::Normal(_))) && !path.is_empty() {
        Ok(())
    } else {
        Err(format!("Chemin refusé : {path}"))
    }
}

fn letter(c: char) -> String {
    if c == '.' { " ".into() } else { c.to_string() }
}

/// Parses `git status --porcelain=v2 --branch -z`. `prefix` is the vault's
/// path inside the repository: files outside the vault are dropped.
pub fn parse_status(raw: &str, prefix: &str) -> GitStatus {
    let mut status = GitStatus { is_repo: true, ..Default::default() };
    let strip = |p: &str| p.strip_prefix(prefix).map(str::to_string);
    let mut entries = raw.split('\0').filter(|e| !e.is_empty());
    while let Some(entry) = entries.next() {
        if let Some(head) = entry.strip_prefix("# branch.head ") {
            status.branch = (head != "(detached)").then(|| head.to_string());
        } else if let Some(upstream) = entry.strip_prefix("# branch.upstream ") {
            status.upstream = Some(upstream.to_string());
        } else if let Some(ab) = entry.strip_prefix("# branch.ab ") {
            for part in ab.split(' ') {
                if let Some(n) = part.strip_prefix('+') {
                    status.ahead = n.parse().unwrap_or(0);
                } else if let Some(n) = part.strip_prefix('-') {
                    status.behind = n.parse().unwrap_or(0);
                }
            }
        } else if entry.starts_with("1 ") || entry.starts_with("2 ") || entry.starts_with("u ") {
            let fields = match &entry[..1] {
                "1" => 9,
                "2" => 10,
                _ => 11,
            };
            let parts: Vec<&str> = entry.splitn(fields, ' ').collect();
            let xy: Vec<char> = parts[1].chars().collect();
            let orig = if entry.starts_with("2 ") { entries.next().and_then(strip) } else { None };
            if let Some(path) = parts.last().and_then(|p| strip(p)) {
                status.files.push(GitFile { path, orig_path: orig, index: letter(xy[0]), worktree: letter(xy[1]) });
            }
        } else if let Some(path) = entry.strip_prefix("? ") {
            if let Some(path) = strip(path) {
                status.files.push(GitFile { path, orig_path: None, index: "?".into(), worktree: "?".into() });
            }
        }
    }
    status
}

fn prefix(root: &str) -> Result<String, String> {
    let mut cmd = git(root);
    cmd.args(["rev-parse", "--show-prefix"]);
    Ok(String::from_utf8_lossy(&run(cmd, None, &[])?.stdout).trim().to_string())
}

fn has_head(root: &str) -> bool {
    let mut cmd = git(root);
    cmd.args(["rev-parse", "--verify", "-q", "HEAD"]);
    run(cmd, None, &[]).is_ok()
}

#[tauri::command]
pub fn git_status(root: String) -> Result<GitStatus, String> {
    let Ok(prefix) = prefix(&root) else { return Ok(GitStatus::default()) };
    let mut cmd = git(&root);
    cmd.args(["status", "--porcelain=v2", "--branch", "-z", "--untracked-files=all"]);
    let output = run(cmd, None, &[])?;
    Ok(parse_status(&String::from_utf8_lossy(&output.stdout), &prefix))
}

/// Unified diff of one file: staged changes, working tree changes, or the whole
/// content of an untracked file.
#[tauri::command]
pub fn git_diff(root: String, path: String, staged: bool, untracked: bool) -> Result<String, String> {
    check_path(&path)?;
    let mut cmd = git(&root);
    if untracked {
        // Exit code 1 only means "files differ".
        cmd.args(["diff", "--no-color", "--no-ext-diff", "--no-index", "--", "/dev/null", &path]);
        return Ok(String::from_utf8_lossy(&run(cmd, None, &[1])?.stdout).into_owned());
    }
    cmd.args(["diff", "--no-color", "--no-ext-diff", "-M"]);
    if staged {
        cmd.arg("--cached");
    }
    cmd.args(["--", &path]);
    Ok(String::from_utf8_lossy(&run(cmd, None, &[])?.stdout).into_owned())
}

#[tauri::command]
pub fn git_stage(root: String, paths: Vec<String>) -> Result<(), String> {
    paths.iter().try_for_each(|p| check_path(p))?;
    let mut cmd = git(&root);
    cmd.args(["add", "-A", "--"]).args(&paths);
    run(cmd, None, &[]).map(|_| ())
}

#[tauri::command]
pub fn git_unstage(root: String, paths: Vec<String>) -> Result<(), String> {
    paths.iter().try_for_each(|p| check_path(p))?;
    let mut cmd = git(&root);
    if has_head(&root) {
        cmd.args(["restore", "--staged", "--"]).args(&paths);
    } else {
        // No commit yet: nothing to restore from.
        cmd.args(["rm", "--cached", "-r", "-q", "--"]).args(&paths);
    }
    run(cmd, None, &[]).map(|_| ())
}

/// Commits the staged changes; the message is passed on stdin, untouched.
#[tauri::command]
pub fn git_commit(root: String, message: String) -> Result<String, String> {
    if message.trim().is_empty() {
        return Err("Le message de commit est vide.".into());
    }
    let mut cmd = git(&root);
    cmd.args(["commit", "-F", "-"]);
    let output = run(cmd, Some(message.as_bytes()), &[])?;
    Ok(String::from_utf8_lossy(&output.stdout).lines().next().unwrap_or("").to_string())
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GitCommit {
    pub hash: String,
    pub short: String,
    pub author: String,
    /// ISO 8601 author date.
    pub date: String,
    pub subject: String,
    /// Path of the file in that commit (it may have been renamed since).
    pub path: String,
}

const FIELD: char = '\u{1f}';
const RECORD: char = '\u{1e}';

/// Parses `git log --name-status --format=<RS>%H<US>%h<US>%an<US>%aI<US>%s`.
pub fn parse_log(raw: &str, prefix: &str) -> Vec<GitCommit> {
    raw.split(RECORD)
        .filter(|r| !r.trim().is_empty())
        .filter_map(|record| {
            let mut lines = record.lines();
            let fields: Vec<&str> = lines.next()?.split(FIELD).collect();
            if fields.len() < 5 {
                return None;
            }
            // The last name-status line names the file in this commit ("R100\told\tnew" -> new).
            let path = lines.filter(|l| !l.trim().is_empty()).last()?.split('\t').last()?;
            Some(GitCommit {
                hash: fields[0].into(),
                short: fields[1].into(),
                author: fields[2].into(),
                date: fields[3].into(),
                subject: fields[4].into(),
                path: path.strip_prefix(prefix).unwrap_or(path).into(),
            })
        })
        .collect()
}

/// History of one note, following renames.
#[tauri::command]
pub fn git_log(root: String, path: String, limit: Option<u32>) -> Result<Vec<GitCommit>, String> {
    check_path(&path)?;
    let prefix = prefix(&root)?;
    let mut cmd = git(&root);
    cmd.args(["-c", "core.quotePath=false", "log", "--follow", "--name-status", "--no-color"])
        .arg(format!("-n{}", limit.unwrap_or(200)))
        .arg(format!("--format={RECORD}%H{FIELD}%h{FIELD}%an{FIELD}%aI{FIELD}%s"))
        .args(["--", &path]);
    let output = run(cmd, None, &[])?;
    Ok(parse_log(&String::from_utf8_lossy(&output.stdout), &prefix))
}

/// Content of a file at a given commit (`path` relative to the vault).
#[tauri::command]
pub fn git_show(root: String, hash: String, path: String) -> Result<String, String> {
    check_path(&path)?;
    if !hash.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("Identifiant de commit invalide.".into());
    }
    let mut cmd = git(&root);
    cmd.arg("show").arg(format!("{hash}:./{path}"));
    Ok(String::from_utf8_lossy(&run(cmd, None, &[])?.stdout).into_owned())
}

fn combined_output(output: &Output) -> String {
    let text = format!("{}\n{}", String::from_utf8_lossy(&output.stdout), String::from_utf8_lossy(&output.stderr));
    text.trim().to_string()
}

/// Updates the remote-tracking branches (for the behind counter).
#[tauri::command]
pub fn git_fetch(root: String) -> Result<(), String> {
    let mut cmd = git(&root);
    cmd.args(["fetch", "--quiet"]);
    run(cmd, None, &[]).map(|_| ())
}

/// Pulls with a merge (never a rebase). A conflict is reported as an error
/// starting with "CONFLICT:" and leaves the merge in progress.
#[tauri::command]
pub fn git_pull(root: String) -> Result<String, String> {
    let mut cmd = git(&root);
    cmd.args(["pull", "--no-rebase", "--no-edit"]);
    match run(cmd, None, &[]) {
        Ok(output) => Ok(combined_output(&output)),
        Err(message) => {
            let status = git_status(root)?;
            if status.files.iter().any(|f| f.index == "U" || f.worktree == "U" || (f.index == "A" && f.worktree == "A") || (f.index == "D" && f.worktree == "D")) {
                Err(format!("CONFLICT:{message}"))
            } else {
                Err(message)
            }
        }
    }
}

/// Pushes the current branch; sets the upstream on "origin" the first time.
#[tauri::command]
pub fn git_push(root: String) -> Result<String, String> {
    let status = git_status(root.clone())?;
    let mut cmd = git(&root);
    if status.upstream.is_some() {
        cmd.arg("push");
    } else {
        let branch = status.branch.ok_or("Aucune branche à envoyer (HEAD détachée).")?;
        cmd.args(["push", "--set-upstream", "origin", &branch]);
    }
    run(cmd, None, &[]).map(|output| combined_output(&output))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn repo(name: &str) -> (std::path::PathBuf, String) {
        let dir = std::env::temp_dir().join(format!("mon-notion-git-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let root = dir.to_string_lossy().into_owned();
        for args in [vec!["init", "-q", "-b", "main"], vec!["config", "user.email", "test@example.com"], vec!["config", "user.name", "Test"]] {
            let mut cmd = git(&root);
            cmd.args(args);
            run(cmd, None, &[]).unwrap();
        }
        (dir, root)
    }

    #[test]
    fn parses_porcelain_v2() {
        let raw = "# branch.oid abc\0# branch.head main\0# branch.upstream origin/main\0# branch.ab +2 -1\0\
1 .M N... 100644 100644 100644 a b Notes/Idées.md\0\
2 R. N... 100644 100644 100644 a b R100 Nouveau nom.md\0Ancien nom.md\0\
? Brouillon.md\0? ../hors.md\0";
        let status = parse_status(raw, "");
        assert_eq!(status.branch.as_deref(), Some("main"));
        assert_eq!(status.upstream.as_deref(), Some("origin/main"));
        assert_eq!((status.ahead, status.behind), (2, 1));
        assert_eq!(status.files[0], GitFile { path: "Notes/Idées.md".into(), orig_path: None, index: " ".into(), worktree: "M".into() });
        assert_eq!(status.files[1].orig_path.as_deref(), Some("Ancien nom.md"));
        assert_eq!(status.files[1].index, "R");
        assert_eq!(status.files[2].index, "?");
        // A vault inside a repository only sees its own files.
        let scoped = parse_status("? Vault/a.md\0? Autre/b.md\0", "Vault/");
        assert_eq!(scoped.files.len(), 1);
        assert_eq!(scoped.files[0].path, "a.md");
    }

    #[test]
    fn stage_commit_and_diff_in_a_real_repository() {
        let (dir, root) = repo("flow");
        fs::write(dir.join("Idées.md"), "un\n").unwrap();
        let status = git_status(root.clone()).unwrap();
        assert!(status.is_repo);
        assert_eq!(status.files[0].index, "?");
        assert!(git_diff(root.clone(), "Idées.md".into(), false, true).unwrap().contains("+un"));

        git_stage(root.clone(), vec!["Idées.md".into()]).unwrap();
        assert_eq!(git_status(root.clone()).unwrap().files[0].index, "A");
        git_unstage(root.clone(), vec!["Idées.md".into()]).unwrap();
        assert_eq!(git_status(root.clone()).unwrap().files[0].index, "?");

        git_stage(root.clone(), vec!["Idées.md".into()]).unwrap();
        assert!(git_commit(root.clone(), "Première note".into()).unwrap().contains("Première note"));
        assert!(git_status(root.clone()).unwrap().files.is_empty());

        fs::write(dir.join("Idées.md"), "un\ndeux\n").unwrap();
        let status = git_status(root.clone()).unwrap();
        assert_eq!(status.files[0].worktree, "M");
        assert!(git_diff(root.clone(), "Idées.md".into(), false, false).unwrap().contains("+deux"));
        git_stage(root.clone(), vec!["Idées.md".into()]).unwrap();
        assert!(git_diff(root.clone(), "Idées.md".into(), true, false).unwrap().contains("+deux"));
        git_unstage(root.clone(), vec!["Idées.md".into()]).unwrap();
        assert_eq!(git_status(root.clone()).unwrap().files[0].index, " ");

        assert!(git_commit(root.clone(), "  ".into()).is_err());
        assert!(git_stage(root.clone(), vec!["../hors".into()]).is_err());
        fs::remove_dir_all(&dir).unwrap();
    }

    fn commit_all(root: &str, message: &str) {
        let mut cmd = git(root);
        cmd.args(["add", "-A"]);
        run(cmd, None, &[]).unwrap();
        git_commit(root.into(), message.into()).unwrap();
    }

    #[test]
    fn history_follows_renames_and_shows_old_versions() {
        let (dir, root) = repo("history");
        fs::write(dir.join("Brouillon.md"), "v1\n").unwrap();
        commit_all(&root, "Création");
        fs::write(dir.join("Brouillon.md"), "v2\n").unwrap();
        commit_all(&root, "Deuxième version");
        let mut cmd = git(&root);
        cmd.args(["mv", "Brouillon.md", "Idées é.md"]);
        run(cmd, None, &[]).unwrap();
        git_commit(root.clone(), "Renommage".into()).unwrap();

        let log = git_log(root.clone(), "Idées é.md".into(), None).unwrap();
        assert_eq!(log.iter().map(|c| c.subject.as_str()).collect::<Vec<_>>(), ["Renommage", "Deuxième version", "Création"]);
        assert_eq!(log[0].path, "Idées é.md");
        assert_eq!(log[2].path, "Brouillon.md");
        assert_eq!(git_show(root.clone(), log[2].hash.clone(), log[2].path.clone()).unwrap(), "v1\n");
        assert!(git_show(root.clone(), "HEAD;rm".into(), "x.md".into()).is_err());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn pull_and_push_with_a_local_remote() {
        let (remote_dir, remote) = repo("remote");
        fs::write(remote_dir.join("a.md"), "base\n").unwrap();
        commit_all(&remote, "Base");
        let clone_dir = std::env::temp_dir().join(format!("mon-notion-git-clone-{}", std::process::id()));
        let _ = fs::remove_dir_all(&clone_dir);
        let mut cmd = Command::new(git_binary());
        cmd.args(["clone", "-q", &remote, clone_dir.to_str().unwrap()]);
        run(cmd, None, &[]).unwrap();
        let clone = clone_dir.to_string_lossy().into_owned();
        for args in [["config", "user.email", "test@example.com"], ["config", "user.name", "Test"]] {
            let mut cmd = git(&clone);
            cmd.args(args);
            run(cmd, None, &[]).unwrap();
        }
        // Accept pushes to the checked-out branch of the non-bare test remote.
        let mut cmd = git(&remote);
        cmd.args(["config", "receive.denyCurrentBranch", "updateInstead"]);
        run(cmd, None, &[]).unwrap();

        // Remote moves ahead; pull merges it.
        fs::write(remote_dir.join("b.md"), "distant\n").unwrap();
        commit_all(&remote, "Ajout distant");
        git_fetch(clone.clone()).unwrap();
        assert_eq!(git_status(clone.clone()).unwrap().behind, 1);
        git_pull(clone.clone()).unwrap();
        assert_eq!(fs::read_to_string(clone_dir.join("b.md")).unwrap(), "distant\n");

        // Local commit pushed.
        fs::write(clone_dir.join("c.md"), "local\n").unwrap();
        commit_all(&clone, "Ajout local");
        assert_eq!(git_status(clone.clone()).unwrap().ahead, 1);
        git_push(clone.clone()).unwrap();
        assert_eq!(git_status(clone.clone()).unwrap().ahead, 0);

        // Both sides change the same line: the pull reports a conflict.
        fs::write(remote_dir.join("a.md"), "distant\n").unwrap();
        commit_all(&remote, "Modif distante");
        fs::write(clone_dir.join("a.md"), "local\n").unwrap();
        commit_all(&clone, "Modif locale");
        let err = git_pull(clone.clone()).unwrap_err();
        assert!(err.starts_with("CONFLICT:"), "{err}");
        assert!(git_status(clone.clone()).unwrap().files.iter().any(|f| f.index == "U"));

        fs::remove_dir_all(&remote_dir).unwrap();
        fs::remove_dir_all(&clone_dir).unwrap();
    }

    #[test]
    fn not_a_repository() {
        let dir = std::env::temp_dir().join(format!("mon-notion-nogit-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        // GIT_CEILING_DIRECTORIES stops git from finding a parent repository of the temp dir.
        unsafe { std::env::set_var("GIT_CEILING_DIRECTORIES", std::env::temp_dir()) };
        assert!(!git_status(dir.to_string_lossy().into_owned()).unwrap().is_repo);
        fs::remove_dir_all(&dir).unwrap();
    }
}
