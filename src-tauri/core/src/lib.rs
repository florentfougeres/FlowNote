//! FlowNote's backend: the vault's files, Git, the Grammalecte companion and
//! the few web requests. It knows nothing of the window around it, and serves
//! both apps through `backend::dispatch`: FlowNote (Tauri, src-tauri) and
//! FlowNote Swift (the native shell, native/).

pub mod backend;
pub mod git;
pub mod grammar;
pub mod vault;
pub mod web;
