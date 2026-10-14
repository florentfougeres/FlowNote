mod git;
mod grammar;
mod vault;
mod web;

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

/// macOS menu: the usual items, without "Close Window" on ⌘W (⌘W closes the
/// current tab in the app). The Edit menu keeps copy and paste working.
fn app_menu(app: &tauri::AppHandle) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
  use tauri::menu::{Menu, PredefinedMenuItem as Item, Submenu};
  let flownote = Submenu::with_items(
    app,
    "FlowNote",
    true,
    &[
      &Item::about(app, Some("À propos de FlowNote"), None)?,
      &Item::separator(app)?,
      &Item::services(app, None)?,
      &Item::separator(app)?,
      &Item::hide(app, Some("Masquer FlowNote"))?,
      &Item::hide_others(app, Some("Masquer les autres"))?,
      &Item::show_all(app, Some("Tout afficher"))?,
      &Item::separator(app)?,
      &Item::quit(app, Some("Quitter FlowNote"))?,
    ],
  )?;
  let edit = Submenu::with_items(
    app,
    "Édition",
    true,
    &[
      &Item::undo(app, Some("Annuler"))?,
      &Item::redo(app, Some("Rétablir"))?,
      &Item::separator(app)?,
      &Item::cut(app, Some("Couper"))?,
      &Item::copy(app, Some("Copier"))?,
      &Item::paste(app, Some("Coller"))?,
      &Item::select_all(app, Some("Tout sélectionner"))?,
    ],
  )?;
  let window = Submenu::with_items(
    app,
    "Fenêtre",
    true,
    &[&Item::minimize(app, Some("Réduire"))?, &Item::maximize(app, Some("Agrandir"))?, &Item::separator(app)?, &Item::fullscreen(app, Some("Plein écran"))?],
  )?;
  Menu::with_items(app, &[&flownote, &edit, &window])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .menu(app_menu)
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![
      log_frontend,
      web::open_url,
      web::fetch_page_title,
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
      vault::vault_read_notes,
      vault::vault_bookmarks,
      grammar::grammar_check,
      git::git_status,
      git::git_diff,
      git::git_stage,
      git::git_unstage,
      git::git_discard,
      git::git_commit,
      git::git_log,
      git::git_show,
      git::git_fetch,
      git::git_pull,
      git::git_push,
      git::git_conflict,
      git::git_resolve,
      git::git_merge_continue,
      git::git_merge_abort,
      git::git_activity,
      git::git_last_commit
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
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|_app, event| {
      if let tauri::RunEvent::Exit = event {
        grammar::shutdown();
      }
    });
}
