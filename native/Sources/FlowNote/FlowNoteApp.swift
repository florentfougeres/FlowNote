import AppKit
import SwiftUI

@main
struct FlowNoteApp: App {
  @State private var app = AppModel.shared

  init() {
    // Launched with `swift run` (no bundle): still a regular app with a Dock icon.
    NSApplication.shared.setActivationPolicy(.regular)
    // The tabs are the app's own, in the toolbar: no system tabs.
    NSWindow.allowsAutomaticWindowTabbing = false
    // The Grammalecte companion stops with the app.
    NotificationCenter.default.addObserver(forName: NSApplication.willTerminateNotification, object: nil, queue: nil) { _ in Grammar.shared.stop() }
  }

  var body: some Scene {
    WindowGroup(id: "window") {
      WindowRoot()
        .environment(app)
    }
    .windowToolbarStyle(.unified)
    .commands { AppCommands(app: app) }
  }
}

/// The menus: each item calls the app, as its own shortcut would (App.tsx).
struct AppCommands: Commands {
  let app: AppModel
  @FocusedValue(\.window) private var window
  @Environment(\.openWindow) private var openWindow

  private var open: Bool { window != nil && app.vault != nil }

  var body: some Commands {
    CommandGroup(replacing: .appSettings) {
      Button("Réglages…") { window?.call("settings") }
        .keyboardShortcut(",")
        .disabled(!open)
    }
    CommandGroup(replacing: .newItem) {
      Button("Nouvelle page…") { window?.call("newPage") }
        .keyboardShortcut("n")
        .disabled(!open)
      Button("Nouvel onglet") { window?.call("newTab") }
        .keyboardShortcut("t")
        .disabled(!open)
      Button("Nouvelle fenêtre") { openWindow(id: "window") }
        .keyboardShortcut("n", modifiers: [.command, .shift])
      Button("Fermer l'onglet") {
        if let window, window.tabs.count > 1, let active = window.active { window.call("closeTab", active) } else { NSApp.keyWindow?.performClose(nil) }
      }
      .keyboardShortcut("w")
      Divider()
      Button("Ouvrir un vault…") { app.chooseVault() }
        .keyboardShortcut("o")
      Button("Ouvrir un vault dans iCloud Drive…") { app.chooseVault(inICloud: true) }
    }
    CommandGroup(after: .textEditing) {
      Button("Aller à une page…") { window?.call("search") }
        .keyboardShortcut("p")
        .disabled(!open)
      Button("Rechercher dans les notes…") { window?.call("vaultSearch") }
        .keyboardShortcut("f", modifiers: [.command, .shift])
        .disabled(!open)
      Button("Rechercher dans la page…") { window?.call("find", false) }
        .keyboardShortcut("f")
        .disabled(!open)
      Button("Rechercher et remplacer…") { window?.call("find", true) }
        .keyboardShortcut("f", modifiers: [.command, .option])
        .disabled(!open)
      Divider()
      Button("Ajouter un lien à lire…") { window?.call("addLink") }
        .keyboardShortcut("l", modifiers: [.command, .shift])
        .disabled(!open)
    }
    CommandGroup(after: .sidebar) {
      Button("Page précédente") { window?.call("back") }
        .keyboardShortcut("[")
        .disabled(!(window?.canBack ?? false))
      Button("Page suivante") { window?.call("forward") }
        .keyboardShortcut("]")
        .disabled(!(window?.canForward ?? false))
      Divider()
      Button("Git") { window?.call("git") }
        .keyboardShortcut("g", modifiers: [.command, .shift])
        .disabled(window?.gitChanges == nil)
      Button("Mode focus") { window?.call("focus") }
        .keyboardShortcut("m", modifiers: [.command, .shift])
        .disabled(!open)
    }
    CommandGroup(after: .windowArrangement) {
      Button("Onglet suivant") { cycle(1) }
        .keyboardShortcut("]", modifiers: [.command, .shift])
      Button("Onglet précédent") { cycle(-1) }
        .keyboardShortcut("[", modifiers: [.command, .shift])
      ForEach(1..<10) { n in
        Button("Onglet \(n)") {
          guard let tabs = window?.tabs, !tabs.isEmpty else { return }
          window?.call("switchTab", tabs[n == 9 ? tabs.count - 1 : min(n - 1, tabs.count - 1)].id)
        }
        .keyboardShortcut(KeyEquivalent(Character("\(n)")))
      }
    }
    CommandGroup(replacing: .help) {
      Button("Aide et raccourcis") { window?.call("help") }
        .keyboardShortcut("/")
        .disabled(!open)
    }
  }

  private func cycle(_ step: Int) {
    guard let window, let index = window.tabs.firstIndex(where: { $0.id == window.active }), window.tabs.count > 1 else { return }
    window.call("switchTab", window.tabs[(index + step + window.tabs.count) % window.tabs.count].id)
  }
}

struct WindowKey: FocusedValueKey {
  typealias Value = WindowModel
}

extension FocusedValues {
  var window: WindowModel? {
    get { self[WindowKey.self] }
    set { self[WindowKey.self] = newValue }
  }
}
