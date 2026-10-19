//! French grammar and spelling checking through the Grammalecte companion
//! (a separate GPL program bundled next to the app, see grammar/). It is started
//! on the first check and kept running; requests go through its stdin/stdout.

use serde_json::{Value, json};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::Mutex;

struct Companion {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
    next_id: u64,
}

static COMPANION: Mutex<Option<Companion>> = Mutex::new(None);

const NAME: &str = "flownote-grammar";

/// Bundled app: next to the main executable. Development: the build in src-tauri/binaries.
fn companion_path() -> Option<PathBuf> {
    let beside = std::env::current_exe().ok()?.parent()?.join(NAME);
    if beside.is_file() {
        return Some(beside);
    }
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../binaries");
    std::fs::read_dir(dev).ok()?.flatten().map(|e| e.path()).find(|p| {
        p.file_name().is_some_and(|n| n.to_string_lossy().starts_with(NAME))
    })
}

fn start() -> Result<Companion, String> {
    let path = companion_path().ok_or("Correcteur Grammalecte introuvable (lancez scripts/build-grammar.sh).")?;
    let mut child = Command::new(&path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("{}: {e}", path.display()))?;
    let stdin = child.stdin.take().ok_or("stdin")?;
    let mut stdout = BufReader::new(child.stdout.take().ok_or("stdout")?);
    let mut line = String::new();
    stdout.read_line(&mut line).map_err(|e| e.to_string())?;
    if !line.contains("ready") {
        let _ = child.kill();
        return Err("Le correcteur n'a pas démarré.".into());
    }
    Ok(Companion { child, stdin, stdout, next_id: 1 })
}

fn exchange(companion: &mut Companion, paragraphs: &[String]) -> Result<Value, String> {
    let id = companion.next_id;
    companion.next_id += 1;
    let request = json!({ "id": id, "paragraphs": paragraphs });
    writeln!(companion.stdin, "{request}").map_err(|e| e.to_string())?;
    companion.stdin.flush().map_err(|e| e.to_string())?;
    let mut line = String::new();
    if companion.stdout.read_line(&mut line).map_err(|e| e.to_string())? == 0 {
        return Err("Le correcteur s'est arrêté.".into());
    }
    let answer: Value = serde_json::from_str(&line).map_err(|e| e.to_string())?;
    if let Some(error) = answer.get("error") {
        return Err(error.to_string());
    }
    Ok(answer.get("results").cloned().unwrap_or(Value::Array(vec![])))
}

/// Errors of each paragraph: `[{ grammar: [...], spelling: [...] }, ...]`.
/// Blocking: the caller runs it away from the UI thread.
pub fn grammar_check(paragraphs: Vec<String>) -> Result<Value, String> {
    {
        let mut slot = COMPANION.lock().map_err(|e| e.to_string())?;
        if slot.is_none() {
            *slot = Some(start()?);
        }
        let result = exchange(slot.as_mut().unwrap(), &paragraphs);
        if result.is_err() {
            // Restarted on the next request.
            if let Some(mut dead) = slot.take() {
                let _ = dead.child.kill();
            }
        }
        result
    }
}

/// Stops the companion when the app quits.
pub fn shutdown() {
    if let Ok(mut slot) = COMPANION.lock() {
        if let Some(mut companion) = slot.take() {
            let _ = companion.child.kill();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Needs the companion built by scripts/build-grammar.sh; skipped otherwise.
    #[test]
    fn checks_french_paragraphs_through_the_companion() {
        if companion_path().is_none() {
            eprintln!("companion not built: skipped");
            return;
        }
        let paragraphs = vec!["Les enfant sont tres sages.".to_string(), "Tout va bien.".to_string()];
        let results = grammar_check(paragraphs).expect("check");
        let first = &results[0];
        assert!(first["spelling"].as_array().unwrap().iter().any(|e| e["word"] == "tres"));
        assert!(first["grammar"].as_array().unwrap().iter().any(|e| e["suggestions"][0] == "enfants"));
        assert_eq!(results[1]["grammar"].as_array().unwrap().len(), 0);
        shutdown();
    }
}
