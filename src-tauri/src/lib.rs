use flownote_core::{backend, grammar, vault};

/// Every backend command (files, Git, Grammalecte, web), through the one
/// dispatch of src-tauri/core. Run away from the UI thread.
#[tauri::command]
async fn backend(command: String, args: serde_json::Value) -> Result<serde_json::Value, String> {
  tauri::async_runtime::spawn_blocking(move || backend::dispatch(&command, &args)).await.map_err(|e| e.to_string())?
}

/// Raw bytes of a file (images and other attachments), sent without JSON encoding.
#[tauri::command]
fn vault_read_binary(root: String, path: String) -> Result<tauri::ipc::Response, String> {
  vault::vault_read_binary(root, path).map(tauri::ipc::Response::new)
}

/// The folder picker for a vault. The chosen folder is trusted: it opens even
/// when it is not an Obsidian vault yet. Picked natively here, so the page
/// cannot add a folder of its choice.
#[tauri::command]
async fn vault_pick(app: tauri::AppHandle) -> Option<String> {
  use tauri_plugin_dialog::DialogExt;
  let picked = app.dialog().file().set_title("Choisir un vault Obsidian").blocking_pick_folder()?;
  let root = picked.into_path().ok()?.to_string_lossy().into_owned();
  vault::trust(&root);
  Some(root)
}

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
    .plugin(tauri_plugin_clipboard_manager::init())
    .invoke_handler(tauri::generate_handler![log_frontend, startup_note, backend, vault_read_binary, vault_pick])
    .setup(|app| {
      use tauri::Manager;
      if let Ok(dir) = app.path().app_data_dir() {
        vault::load_trusted(dir.join("trusted-vaults.json"));
      }
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
