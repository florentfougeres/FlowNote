//! The one entry point of the backend, shared by both apps: Tauri calls it
//! through its `backend` command, the native shell (FlowNote Swift) through
//! the C function of `native/ffi`. Commands and arguments are those the web
//! app sends (`backend()` in src/platform.ts); arguments keep their camelCase.

use crate::{git, grammar, vault, web};
use serde::Serialize;
use serde_json::Value;

/// Every command `dispatch` knows: src/platform.test.ts checks that the web
/// app only calls these.
pub const COMMANDS: &[&str] = &[
    "vault_tree", "vault_read", "vault_write", "vault_files", "vault_read_binary", "vault_create", "vault_create_dir",
    "vault_reveal", "vault_config", "vault_rename", "vault_trash", "vault_search", "vault_read_notes", "vault_stats",
    "vault_bookmarks", "git_status", "git_diff", "git_stage", "git_unstage", "git_discard", "git_commit", "git_log",
    "git_show", "git_fetch", "git_pull", "git_push", "git_conflict", "git_resolve", "git_merge_continue",
    "git_merge_abort", "git_activity", "git_last_commit", "grammar_check", "fetch_page_title", "open_url", "save_export",
    "open_export",
];

fn string(args: &Value, key: &str) -> Result<String, String> {
    args.get(key).and_then(Value::as_str).map(str::to_string).ok_or_else(|| format!("Paramètre manquant : {key}"))
}

fn optional_string(args: &Value, key: &str) -> Option<String> {
    args.get(key).and_then(Value::as_str).map(str::to_string)
}

fn boolean(args: &Value, key: &str) -> bool {
    args.get(key).and_then(Value::as_bool).unwrap_or(false)
}

fn number(args: &Value, key: &str) -> Option<u64> {
    args.get(key).and_then(Value::as_u64)
}

fn strings(args: &Value, key: &str) -> Vec<String> {
    args.get(key).and_then(Value::as_array).map(|a| a.iter().filter_map(|v| v.as_str().map(str::to_string)).collect()).unwrap_or_default()
}

fn bytes(args: &Value, key: &str) -> Vec<u8> {
    args.get(key).and_then(Value::as_array).map(|a| a.iter().filter_map(|v| v.as_u64().map(|n| n as u8)).collect()).unwrap_or_default()
}

fn json<T: Serialize>(value: T) -> Result<Value, String> {
    serde_json::to_value(value).map_err(|e| e.to_string())
}

/// Runs a command. Blocking (files, git, Grammalecte, the network): callers
/// run it away from their UI thread.
pub fn dispatch(command: &str, args: &Value) -> Result<Value, String> {
    let root = || string(args, "root");
    let path = || string(args, "path");
    match command {
        "vault_tree" => json(vault::vault_tree(root()?)?),
        "vault_read" => json(vault::vault_read(root()?, path()?)?),
        "vault_write" => json(vault::vault_write(root()?, path()?, string(args, "content")?, optional_string(args, "expected"))?),
        "vault_files" => json(vault::vault_files(root()?)),
        // Through a C function, bytes travel as base64 (Tauri has a raw command for them).
        "vault_read_binary" => json(base64(&vault::vault_read_binary(root()?, path()?)?)),
        "vault_create" => json(vault::vault_create(root()?, path()?, bytes(args, "content"))?),
        "vault_create_dir" => json(vault::vault_create_dir(root()?, path()?)?),
        "vault_reveal" => json(vault::vault_reveal(root()?, path()?)?),
        "vault_config" => json(vault::vault_config(root()?)),
        "vault_rename" => json(vault::vault_rename(root()?, string(args, "from")?, string(args, "to")?)?),
        "vault_trash" => json(vault::vault_trash(root()?, path()?)?),
        "vault_search" => json(vault::vault_search(root()?, string(args, "query")?, boolean(args, "caseSensitive"), number(args, "limit").unwrap_or(200) as usize)),
        "vault_read_notes" => json(vault::vault_read_notes(root()?)),
        "vault_stats" => json(vault::vault_stats(root()?)),
        "vault_bookmarks" => json(vault::vault_bookmarks(root()?)),
        "git_status" => json(git::git_status(root()?)?),
        "git_diff" => json(git::git_diff(root()?, path()?, boolean(args, "staged"), boolean(args, "untracked"))?),
        "git_stage" => json(git::git_stage(root()?, strings(args, "paths"))?),
        "git_unstage" => json(git::git_unstage(root()?, strings(args, "paths"))?),
        "git_discard" => json(git::git_discard(root()?, strings(args, "paths"))?),
        "git_commit" => json(git::git_commit(root()?, string(args, "message")?)?),
        "git_log" => json(git::git_log(root()?, path()?, number(args, "limit").map(|n| n as u32))?),
        "git_show" => json(git::git_show(root()?, string(args, "hash")?, path()?)?),
        "git_fetch" => json(git::git_fetch(root()?)?),
        "git_pull" => json(git::git_pull(root()?)?),
        "git_push" => json(git::git_push(root()?)?),
        "git_conflict" => json(git::git_conflict(root()?, path()?)?),
        "git_resolve" => json(git::git_resolve(root()?, path()?, optional_string(args, "content"))?),
        "git_merge_continue" => json(git::git_merge_continue(root()?)?),
        "git_merge_abort" => json(git::git_merge_abort(root()?)?),
        "git_activity" => json(git::git_activity(root()?, number(args, "days").unwrap_or(365) as u32)?),
        "git_last_commit" => json(git::git_last_commit(root()?)?),
        "grammar_check" => grammar::grammar_check(strings(args, "paragraphs")),
        "fetch_page_title" => json(web::fetch_page_title(string(args, "url")?)),
        "open_url" => json(web::open_url(string(args, "url")?)?),
        "save_export" => json(web::save_export(path()?, bytes(args, "content"))?),
        "open_export" => json(web::open_export(path()?)?),
        _ => Err(format!("Commande inconnue : {command}")),
    }
}

fn base64(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let n = (chunk[0] as u32) << 16 | (*chunk.get(1).unwrap_or(&0) as u32) << 8 | *chunk.get(2).unwrap_or(&0) as u32;
        for i in 0..4 {
            out.push(if i <= chunk.len() { TABLE[(n >> (18 - 6 * i) & 63) as usize] as char } else { '=' });
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json as value;

    #[test]
    fn every_listed_command_is_dispatched() {
        for command in COMMANDS {
            let error = dispatch(command, &value!({})).err().unwrap_or_default();
            assert!(!error.starts_with("Commande inconnue"), "{command} is listed but not dispatched");
        }
        assert!(dispatch("rm_rf", &value!({})).unwrap_err().starts_with("Commande inconnue"));
    }

    #[test]
    fn arguments_are_checked() {
        assert_eq!(dispatch("vault_read", &value!({ "root": "/" })).unwrap_err(), "Paramètre manquant : path");
        // The root is checked as in every command: an Obsidian vault or a folder the user picked.
        assert!(dispatch("vault_tree", &value!({ "root": "/etc" })).unwrap_err().starts_with("Dossier non autorisé"));
    }

    #[test]
    fn bytes_go_as_base64() {
        assert_eq!(base64(b""), "");
        assert_eq!(base64(b"f"), "Zg==");
        assert_eq!(base64(b"fo"), "Zm8=");
        assert_eq!(base64(b"foobar"), "Zm9vYmFy");
    }
}
