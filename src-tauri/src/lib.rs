mod git;
mod vault;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![
      vault::vault_tree,
      vault::vault_read,
      vault::vault_write,
      vault::vault_files,
      vault::vault_read_binary,
      vault::vault_create,
      vault::vault_config,
      git::git_status,
      git::git_diff,
      git::git_stage,
      git::git_unstage,
      git::git_commit
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
