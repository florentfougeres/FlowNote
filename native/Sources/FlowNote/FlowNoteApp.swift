import AppKit
import SwiftUI

@main
struct FlowNoteApp: App {
  @State private var app = AppModel.shared

  init() {
    // Launched with `swift run` (no bundle): still a regular app with a Dock icon.
    NSApplication.shared.setActivationPolicy(.regular)
    // New windows open as tabs of the current one, like Safari's or the Finder's.
    NSWindow.allowsAutomaticWindowTabbing = true
  }

  var body: some Scene {
    WindowGroup(id: "page", for: String.self) { $path in
      WindowRoot(initialPath: path)
        .environment(app)
    }
    .windowToolbarStyle(.unified)
    .commands { AppCommands(app: app) }

    Settings {
      SettingsView()
        .environment(app)
    }
  }
}

struct AppCommands: Commands {
  let app: AppModel
  @FocusedValue(\.page) private var page
  @Environment(\.openWindow) private var openWindow

  var body: some Commands {
    CommandGroup(replacing: .newItem) {
      Button("Nouvelle page…") { if let page { Task { await SidebarActions(page: page).newPage(in: nil) } } }
        .keyboardShortcut("n")
        .disabled(page == nil || app.vault == nil)
      Button("Aller à une page…") { page?.searching = true }
        .keyboardShortcut("p")
        .disabled(page == nil || app.vault == nil)
      Button("Nouvel onglet") { openWindow(id: "page") }
        .keyboardShortcut("t")
      Divider()
      Button("Ouvrir un vault…") { app.chooseVault() }
        .keyboardShortcut("o")
      Button("Ouvrir un vault dans iCloud Drive…") { app.chooseVault(inICloud: true) }
    }
    CommandGroup(after: .sidebar) {
      Button("Page précédente") { page?.goBack() }
        .keyboardShortcut("[")
        .disabled(page?.back.isEmpty ?? true)
      Button("Page suivante") { page?.goForward() }
        .keyboardShortcut("]")
        .disabled(page?.forward.isEmpty ?? true)
    }
  }
}

struct PageKey: FocusedValueKey {
  typealias Value = PageModel
}

extension FocusedValues {
  var page: PageModel? {
    get { self[PageKey.self] }
    set { self[PageKey.self] = newValue }
  }
}
