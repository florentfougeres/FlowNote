//! FlowNote's backend: the vault's files, Git, the Grammalecte companion and
//! the few web requests. It knows nothing of the window around it: the Tauri
//! app (src-tauri) serves it through `backend::dispatch`.

pub mod backend;
pub mod git;
pub mod grammar;
pub mod vault;
pub mod web;
