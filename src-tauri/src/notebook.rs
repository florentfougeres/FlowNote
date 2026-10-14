//! Notebook kernels and Python environments. Each open notebook gets its own
//! Python process (resources/kernel/flownote_kernel.py) run by the bundled uv
//! in the vault's environment (pyproject.toml + .venv at the vault root, plus
//! the notebook's own dependencies). Kernel events are forwarded to the
//! webview as `notebook-kernel` events: { notebook, event }.

use serde::Serialize;
use serde_json::{Value, json};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};

/// marimo version used by "Ouvrir dans marimo" (same as the notebook format).
const MARIMO_VERSION: &str = "0.25.1";

/// Python used for notebooks (uv downloads it if needed). Pinned: the newest
/// Python often lacks prebuilt packages for a while.
const PYTHON_VERSION: &str = "3.13";

struct Kernel {
    child: Child,
    stdin: ChildStdin,
    /// Pid of the Python process itself (uv's child), sent in the `ready` event.
    python_pid: Arc<Mutex<Option<i32>>>,
}

static KERNELS: Mutex<Option<HashMap<String, Kernel>>> = Mutex::new(None);

fn with_kernels<T>(f: impl FnOnce(&mut HashMap<String, Kernel>) -> T) -> T {
    let mut guard = KERNELS.lock().unwrap_or_else(|e| e.into_inner());
    f(guard.get_or_insert_with(HashMap::new))
}

/// Bundled uv (next to the executable), the development download, or uv on PATH.
fn uv_binary() -> PathBuf {
    if let Some(dir) = std::env::current_exe().ok().and_then(|e| e.parent().map(Path::to_path_buf)) {
        let beside = dir.join("uv");
        if beside.is_file() {
            return beside;
        }
    }
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("binaries");
    if let Ok(entries) = std::fs::read_dir(dev) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.file_name().is_some_and(|n| n.to_string_lossy().starts_with("uv-")) {
                return path;
            }
        }
    }
    PathBuf::from("uv")
}

fn kernel_script(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(dir) = app.path().resource_dir() {
        let bundled = dir.join("kernel").join("flownote_kernel.py");
        if bundled.is_file() {
            return Ok(bundled);
        }
    }
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/kernel/flownote_kernel.py");
    if dev.is_file() { Ok(dev) } else { Err("Kernel Python introuvable.".into()) }
}

/// PATH with uv's folder first (marimo's sandbox mode calls `uv` by name).
fn path_with_uv() -> String {
    let uv = uv_binary();
    let current = std::env::var("PATH").unwrap_or_default();
    match uv.parent().filter(|p| !p.as_os_str().is_empty()) {
        Some(dir) => format!("{}:{current}", dir.display()),
        None => current,
    }
}

fn uv(vault: &str) -> Command {
    let mut cmd = Command::new(uv_binary());
    cmd.current_dir(vault).env("PATH", path_with_uv()).env("UV_NO_PROGRESS", "1").env("UV_PYTHON", PYTHON_VERSION).stdin(Stdio::null());
    cmd
}

// --- Vault environment ------------------------------------------------------

#[derive(Serialize)]
pub struct EnvStatus {
    pyproject: bool,
    venv: bool,
}

#[tauri::command]
pub fn notebook_env_status(vault: String) -> EnvStatus {
    let root = Path::new(&vault);
    EnvStatus { pyproject: root.join("pyproject.toml").is_file(), venv: root.join(".venv").is_dir() }
}

fn project_name(vault: &str) -> String {
    let name: String = Path::new(vault)
        .file_name()
        .map(|n| n.to_string_lossy().to_lowercase())
        .unwrap_or_default()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    let name = name.trim_matches('-').to_string();
    if name.is_empty() { "vault-notebooks".into() } else { format!("{name}-notebooks") }
}

/// Creates pyproject.toml (with the packages the kernel uses) and ignores .venv/
/// in Git. Existing files are left as they are.
#[tauri::command]
pub fn notebook_env_init(vault: String) -> Result<(), String> {
    let root = Path::new(&vault);
    let pyproject = root.join("pyproject.toml");
    if !pyproject.exists() {
        let content = format!(
            "# Environnement Python des notebooks FlowNote (géré avec uv).\n\
             [project]\n\
             name = \"{}\"\n\
             version = \"0.1.0\"\n\
             requires-python = \">=3.12\"\n\
             dependencies = [\n    \"duckdb\",\n    \"polars\",\n    \"pyarrow\",\n]\n\n\
             [tool.uv]\n\
             package = false\n",
            project_name(&vault)
        );
        std::fs::write(&pyproject, content).map_err(|e| e.to_string())?;
    }
    let gitignore = root.join(".gitignore");
    let existing = std::fs::read_to_string(&gitignore).unwrap_or_default();
    if !existing.lines().any(|l| matches!(l.trim(), ".venv" | ".venv/" | "/.venv" | "/.venv/")) {
        let separator = if existing.is_empty() || existing.ends_with('\n') { "" } else { "\n" };
        std::fs::write(&gitignore, format!("{existing}{separator}.venv/\n")).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// `uv add <package>` in the vault's project (installs it in .venv).
#[tauri::command]
pub async fn notebook_env_add(vault: String, package: String) -> Result<String, String> {
    if package.trim().is_empty() || package.starts_with('-') {
        return Err("Nom de paquet invalide.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let output = uv(&vault).args(["add", "--project", &vault, package.trim()]).output().map_err(|e| e.to_string())?;
        let text = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if output.status.success() { Ok(text) } else { Err(text) }
    })
    .await
    .map_err(|e| e.to_string())?
}

// --- Kernels ------------------------------------------------------------------

/// Starts the kernel of a notebook (no-op if it runs already). `deps`: the
/// notebook's own dependencies (front matter), added with `uv run --with`.
#[tauri::command]
pub fn kernel_start(app: AppHandle, vault: String, notebook: String, deps: Vec<String>) -> Result<(), String> {
    if with_kernels(|k| k.contains_key(&notebook)) {
        return Ok(());
    }
    let script = kernel_script(&app)?;
    let folder = Path::new(&vault).join(&notebook).parent().map(Path::to_path_buf).unwrap_or_else(|| PathBuf::from(&vault));
    let mut cmd = uv(&vault);
    cmd.args(["run", "--project", &vault]);
    for dep in deps.iter().filter(|d| !d.trim().is_empty() && !d.starts_with('-')) {
        cmd.args(["--with", dep.trim()]);
    }
    cmd.arg("python").arg(&script).arg("--cwd").arg(&folder);
    cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = cmd.spawn().map_err(|e| format!("uv : {e}"))?;
    let stdin = child.stdin.take().ok_or("stdin")?;
    let stdout = child.stdout.take().ok_or("stdout")?;
    let mut stderr = child.stderr.take().ok_or("stderr")?;
    let python_pid = Arc::new(Mutex::new(None));

    // stderr: uv's messages (environment setup, errors), kept to explain a failed start.
    let log = Arc::new(Mutex::new(String::new()));
    {
        let log = log.clone();
        let app = app.clone();
        let notebook = notebook.clone();
        std::thread::spawn(move || {
            let mut buffer = [0u8; 4096];
            while let Ok(n) = stderr.read(&mut buffer) {
                if n == 0 {
                    break;
                }
                let text = String::from_utf8_lossy(&buffer[..n]).to_string();
                let _ = app.emit("notebook-kernel", json!({ "notebook": notebook, "event": { "type": "log", "text": text } }));
                let mut log = log.lock().unwrap_or_else(|e| e.into_inner());
                log.push_str(&text);
                if log.len() > 8000 {
                    let cut = log.len() - 8000;
                    let at = log.char_indices().find(|(i, _)| *i >= cut).map(|(i, _)| i).unwrap_or(0);
                    log.drain(..at);
                }
            }
        });
    }
    {
        let app = app.clone();
        let notebook = notebook.clone();
        let python_pid = python_pid.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines() {
                let Ok(line) = line else { break };
                let Ok(event) = serde_json::from_str::<Value>(&line) else { continue };
                if event["type"] == "ready" {
                    *python_pid.lock().unwrap_or_else(|e| e.into_inner()) = event["pid"].as_i64().map(|p| p as i32);
                }
                let _ = app.emit("notebook-kernel", json!({ "notebook": notebook, "event": event }));
            }
            // The process ended (shutdown, crash, failed environment).
            let removed = with_kernels(|k| k.remove(&notebook));
            let code = removed.and_then(|mut k| k.child.wait().ok()).and_then(|s| s.code());
            let tail = log.lock().map(|l| l.clone()).unwrap_or_default();
            let _ = app.emit("notebook-kernel", json!({ "notebook": notebook, "event": { "type": "exit", "code": code, "log": tail } }));
        });
    }
    with_kernels(|k| k.insert(notebook, Kernel { child, stdin, python_pid }));
    Ok(())
}

#[tauri::command]
pub fn kernel_send(notebook: String, message: Value) -> Result<(), String> {
    with_kernels(|k| {
        let kernel = k.get_mut(&notebook).ok_or("Kernel arrêté.")?;
        writeln!(kernel.stdin, "{message}").and_then(|_| kernel.stdin.flush()).map_err(|e| e.to_string())
    })
}

/// Interrupts the running cell (SIGINT to the Python process).
#[tauri::command]
pub fn kernel_interrupt(notebook: String) -> Result<(), String> {
    let pid = with_kernels(|k| k.get(&notebook).and_then(|kernel| *kernel.python_pid.lock().unwrap_or_else(|e| e.into_inner())));
    match pid {
        Some(pid) => {
            unsafe { libc::kill(pid, libc::SIGINT) };
            Ok(())
        }
        None => Err("Le kernel n'est pas prêt.".into()),
    }
}

fn stop(mut kernel: Kernel) {
    let _ = writeln!(kernel.stdin, "{}", json!({ "type": "shutdown" }));
    let _ = kernel.stdin.flush();
    let pid = *kernel.python_pid.lock().unwrap_or_else(|e| e.into_inner());
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(400));
        if let Some(pid) = pid {
            unsafe { libc::kill(pid, libc::SIGTERM) };
        }
        let _ = kernel.child.kill();
        let _ = kernel.child.wait();
    });
}

#[tauri::command]
pub fn kernel_stop(notebook: String) {
    if let Some(kernel) = with_kernels(|k| k.remove(&notebook)) {
        stop(kernel);
    }
}

/// Stops every kernel when the app quits.
pub fn shutdown_all() {
    let kernels: Vec<Kernel> = with_kernels(|k| k.drain().map(|(_, v)| v).collect());
    for mut kernel in kernels {
        if let Some(pid) = *kernel.python_pid.lock().unwrap_or_else(|e| e.into_inner()) {
            unsafe { libc::kill(pid, libc::SIGTERM) };
        }
        let _ = kernel.child.kill();
    }
}

/// "Ouvrir dans marimo": `marimo edit --sandbox <notebook>` (marimo opens the browser).
#[tauri::command]
pub fn notebook_open_marimo(vault: String, notebook: String) -> Result<(), String> {
    let path = Path::new(&vault).join(&notebook);
    uv(&vault)
        .args(["tool", "run", "--from", &format!("marimo=={MARIMO_VERSION}"), "marimo", "edit", "--sandbox"])
        .arg(&path)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("marimo : {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn environment_init_creates_pyproject_and_ignores_venv_once() {
        let dir = std::env::temp_dir().join(format!("Mon Vault {}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(".gitignore"), "node_modules").unwrap();
        let vault = dir.to_string_lossy().to_string();
        assert!(!notebook_env_status(vault.clone()).pyproject);
        notebook_env_init(vault.clone()).unwrap();
        notebook_env_init(vault.clone()).unwrap();
        let pyproject = fs::read_to_string(dir.join("pyproject.toml")).unwrap();
        assert!(pyproject.contains("name = \"mon-vault-"));
        assert!(pyproject.contains("\"duckdb\"") && pyproject.contains("\"polars\"") && pyproject.contains("package = false"));
        assert_eq!(fs::read_to_string(dir.join(".gitignore")).unwrap(), "node_modules\n.venv/\n");
        // An existing pyproject.toml is never replaced.
        fs::write(dir.join("pyproject.toml"), "[project]\nname = \"a moi\"\n").unwrap();
        notebook_env_init(vault.clone()).unwrap();
        assert_eq!(fs::read_to_string(dir.join("pyproject.toml")).unwrap(), "[project]\nname = \"a moi\"\n");
        let _ = fs::remove_dir_all(dir);
    }
}
