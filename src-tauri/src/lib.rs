mod git;
mod vault;

/// Errors raised in the webview, printed in the terminal running the app.
#[tauri::command]
fn log_frontend(message: String) {
  eprintln!("[webview] {message}");
}

/// Note to open at launch (FLOWNOTE_OPEN, vault-relative path), for debugging.
#[tauri::command]
fn startup_note() -> Option<String> {
  std::env::var("FLOWNOTE_OPEN").ok()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![
      log_frontend,
      startup_note,
      vault::vault_tree,
      vault::vault_read,
      vault::vault_write,
      vault::vault_files,
      vault::vault_read_binary,
      vault::vault_create,
      vault::vault_config,
      vault::vault_rename,
      vault::vault_trash,
      vault::vault_search,
      git::git_status,
      git::git_diff,
      git::git_stage,
      git::git_unstage,
      git::git_commit,
      git::git_log,
      git::git_show,
      git::git_fetch,
      git::git_pull,
      git::git_push,
      git::git_conflict,
      git::git_resolve,
      git::git_merge_continue,
      git::git_merge_abort
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
