//! The backend of FlowNote (src-tauri/core) for the native shell: the same
//! `dispatch` as the Tauri app's, behind a few C functions (header:
//! native/Sources/CFlowNoteCore/flownote.h). Strings are UTF-8 and
//! NUL-terminated; every string returned is freed with `flownote_free`.

use flownote_core::{backend, grammar, vault};
use serde_json::{Value, json};
use std::ffi::{CStr, CString, c_char};
use std::path::Path;

fn text(pointer: *const c_char) -> String {
    if pointer.is_null() {
        return String::new();
    }
    // SAFETY: the shell passes valid NUL-terminated strings it owns for the call.
    unsafe { CStr::from_ptr(pointer) }.to_string_lossy().into_owned()
}

/// Reads the folders trusted in an earlier session, from the app's data folder.
#[unsafe(no_mangle)]
pub extern "C" fn flownote_init(data_dir: *const c_char) {
    vault::load_trusted(Path::new(&text(data_dir)).join("trusted-vaults.json"));
}

/// A folder picked by the user in the shell's open panel: it opens even without `.obsidian`.
#[unsafe(no_mangle)]
pub extern "C" fn flownote_trust(root: *const c_char) {
    vault::trust(&text(root));
}

/// Runs a backend command; `args` is a JSON object. Returns `{"ok": value}`
/// or `{"error": message}`, as JSON. Blocking: call it away from the main thread.
#[unsafe(no_mangle)]
pub extern "C" fn flownote_call(command: *const c_char, args: *const c_char) -> *mut c_char {
    let args: Value = serde_json::from_str(&text(args)).unwrap_or(Value::Null);
    let answer = match backend::dispatch(&text(command), &args) {
        Ok(value) => json!({ "ok": value }),
        Err(message) => json!({ "error": message }),
    };
    CString::new(answer.to_string()).map_or(std::ptr::null_mut(), CString::into_raw)
}

/// Frees a string returned by `flownote_call`.
#[unsafe(no_mangle)]
pub extern "C" fn flownote_free(pointer: *mut c_char) {
    if !pointer.is_null() {
        // SAFETY: the pointer comes from CString::into_raw in flownote_call.
        drop(unsafe { CString::from_raw(pointer) });
    }
}

/// Stops the Grammalecte companion (the shell quits).
#[unsafe(no_mangle)]
pub extern "C" fn flownote_shutdown() {
    grammar::shutdown();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn calls_go_through_the_shared_dispatch() {
        let command = CString::new("vault_tree").unwrap();
        let args = CString::new(r#"{"root":"/etc"}"#).unwrap();
        let answer = flownote_call(command.as_ptr(), args.as_ptr());
        let value: Value = serde_json::from_str(&text(answer)).unwrap();
        flownote_free(answer);
        assert!(value["error"].as_str().unwrap().starts_with("Dossier non autorisé"));
    }
}
