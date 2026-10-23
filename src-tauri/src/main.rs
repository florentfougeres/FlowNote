// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  // WebKitGTK's DMA-BUF renderer blurs text on many Linux setups (Wayland notably).
  // Still overridable: WEBKIT_DISABLE_DMABUF_RENDERER=0 restores it.
  #[cfg(target_os = "linux")]
  {
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
      // SAFETY: set before the app starts any other thread.
      unsafe { std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1") };
    }
  }
  app_lib::run();
}
