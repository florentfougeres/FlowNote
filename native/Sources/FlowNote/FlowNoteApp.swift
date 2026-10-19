import AppKit
import SwiftUI

@main
struct FlowNoteApp: App {
  @State private var app = AppModel.shared

  init() {
    // Launched with `swift run` (no bundle): still a regular app with a Dock icon.
    NSApplication.shared.setActivationPolicy(.regular)
    // New windows open as tabs of the current one, like Safari's or the Finder's.
    // The tabs are the app's own, in the toolbar (TabStrip): no system tabs.
    NSWindow.allowsAutomaticWindowTabbing = false
    // The Grammalecte companion stops with the app.
    NotificationCenter.default.addObserver(forName: NSApplication.willTerminateNotification, object: nil, queue: nil) { _ in Grammar.shared.stop() }
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
  @FocusedValue(\.tabs) private var tabs
  @Environment(\.openWindow) private var openWindow

  var body: some Commands {
    CommandGroup(replacing: .newItem) {
      Button("Nouvelle page…") { if let page { Task { await SidebarActions(page: page).newPage(in: nil) } } }
        .keyboardShortcut("n")
        .disabled(page == nil || app.vault == nil)
      Button("Aller à une page…") { page?.searching = true }
        .keyboardShortcut("p")
        .disabled(page == nil || app.vault == nil)
      Button("Nouvel onglet") { if let tabs { tabs.open(nil) } else { openWindow(id: "page") } }
        .keyboardShortcut("t")
      Button("Nouvelle fenêtre") { openWindow(id: "page") }
        .keyboardShortcut("n", modifiers: [.command, .shift])
      Button("Fermer l'onglet") { if let tabs { Task { await tabs.close(tabs.active) } } else { NSApp.keyWindow?.performClose(nil) } }
        .keyboardShortcut("w")
      Divider()
      Button("Ouvrir un vault…") { app.chooseVault() }
        .keyboardShortcut("o")
      Button("Ouvrir un vault dans iCloud Drive…") { app.chooseVault(inICloud: true) }
    }
    CommandGroup(after: .textEditing) {
      Button("Rechercher dans la page…") { page?.find(replace: false) }
        .keyboardShortcut("f")
        .disabled(page == nil)
      Button("Rechercher et remplacer…") { page?.find(replace: true) }
        .keyboardShortcut("f", modifiers: [.command, .option])
        .disabled(page == nil)
      Divider()
      Button("Ajouter un lien à lire…") { page?.addLink() }
        .keyboardShortcut("l", modifiers: [.command, .shift])
        .disabled(page == nil || app.vault == nil)
    }
    CommandGroup(after: .windowArrangement) {
      Button("Onglet suivant") { tabs?.cycle(1) }
        .keyboardShortcut("]", modifiers: [.command, .shift])
        .disabled((tabs?.pages.count ?? 0) < 2)
      Button("Onglet précédent") { tabs?.cycle(-1) }
        .keyboardShortcut("[", modifiers: [.command, .shift])
        .disabled((tabs?.pages.count ?? 0) < 2)
      ForEach(1..<10) { n in
        Button("Onglet \(n)") { tabs?.select(at: n == 9 ? (tabs?.pages.count ?? 1) - 1 : n - 1) }
          .keyboardShortcut(KeyEquivalent(Character("\(n)")))
      }
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

struct TabsKey: FocusedValueKey {
  typealias Value = TabsModel
}

extension FocusedValues {
  var page: PageModel? {
    get { self[PageKey.self] }
    set { self[PageKey.self] = newValue }
  }

  var tabs: TabsModel? {
    get { self[TabsKey.self] }
    set { self[TabsKey.self] = newValue }
  }
}
