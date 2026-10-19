import AppKit
import Observation

/// What the whole app shares: the vault, its tree, the recent vaults, the windows.
/// The settings belong to the web app (its Réglages page), as in the Tauri app.
@MainActor @Observable
final class AppModel {
  static let shared = AppModel()

  private(set) var vault: VaultFolder?
  private(set) var tree: [VaultEntry] = []
  private(set) var error: String?
  /// Vaults opened lately, most recent first.
  private(set) var recentVaults: [URL] = []
  @ObservationIgnored private var watcher: VaultWatcher?
  @ObservationIgnored private var reloadTask: Task<Void, Never>?
  @ObservationIgnored private var windows: [WeakWindow] = []
  @ObservationIgnored private let defaults = UserDefaults.standard

  private init() {
    recentVaults = (defaults.array(forKey: "recentVaults") as? [Data] ?? []).compactMap(Self.resolve)
    if let bookmark = defaults.data(forKey: "vaultBookmark"), let url = Self.resolve(bookmark) { open(url, reloadWindows: false) }
  }

  private static func resolve(_ bookmark: Data) -> URL? {
    var stale = false
    return try? URL(resolvingBookmarkData: bookmark, bookmarkDataIsStale: &stale)
  }

  // MARK: Vault

  /// Opens a vault; the windows start again on it.
  func open(_ url: URL, reloadWindows: Bool = true) {
    let vault = VaultFolder(root: url.standardizedFileURL)
    self.vault = vault
    // Picked by the user: the backend opens it even without .obsidian.
    Backend.trust(vault.root)
    error = nil
    // Bookmarks find the folders again after they are moved or renamed.
    if let bookmark = try? url.bookmarkData() { defaults.set(bookmark, forKey: "vaultBookmark") }
    recentVaults = Array(([vault.root] + recentVaults.filter { $0.standardizedFileURL != vault.root }).prefix(8))
    saveRecent()
    watcher = VaultWatcher(url: vault.root) { [weak self] in self?.scheduleReload() }
    Task.detached { ICloud.downloadMissing(in: vault.root) }
    tree = []
    reload()
    if reloadWindows { for window in liveWindows { window.restart() } }
  }

  /// Back to the welcome screen (Réglages ▸ Changer de vault).
  func close() {
    vault = nil
    tree = []
    watcher = nil
    defaults.removeObject(forKey: "vaultBookmark")
    for window in liveWindows { window.restart() }
  }

  func forget(_ url: URL) {
    recentVaults.removeAll { $0.standardizedFileURL == url.standardizedFileURL }
    saveRecent()
  }

  private func saveRecent() {
    defaults.set(recentVaults.compactMap { try? $0.bookmarkData() }, forKey: "recentVaults")
  }

  /// Asks for a vault folder (in iCloud Drive when asked), without blocking the app.
  func chooseVault(inICloud: Bool = false) {
    let panel = NSOpenPanel()
    panel.canChooseDirectories = true
    panel.canChooseFiles = false
    panel.canCreateDirectories = true
    panel.prompt = "Ouvrir"
    panel.message = "Choisissez le dossier d'un vault Obsidian."
    if inICloud { panel.directoryURL = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Mobile Documents/com~apple~CloudDocs") }
    // Opened once the menu that asked for it has closed.
    DispatchQueue.main.async {
      panel.begin { [weak self] response in
        if response == .OK, let url = panel.url { self?.open(url) }
      }
    }
  }

  /// Reads the tree again; when it changed, the pages read the vault again too.
  func reload() {
    guard let vault else { return }
    Task {
      let result = await Task.detached { Result { try Backend.call("vault_tree", ["root": vault.root.path], as: [VaultEntry].self) } }.value
      guard vault.root == self.vault?.root else { return }
      switch result {
      case .success(let tree):
        if tree != self.tree {
          self.tree = tree
          for window in liveWindows { window.call("refresh") }
        }
      case .failure(let error):
        self.error = error.localizedDescription
      }
    }
  }

  /// Several changes in a row (autosave, Obsidian, iCloud) make one reload.
  func scheduleReload() {
    reloadTask?.cancel()
    reloadTask = Task {
      try? await Task.sleep(for: .milliseconds(300))
      guard !Task.isCancelled else { return }
      reload()
      if let root = vault?.root { Task.detached { ICloud.downloadMissing(in: root) } }
    }
  }

  // MARK: Windows

  func register(_ window: WindowModel) {
    windows.removeAll { $0.window == nil }
    windows.append(WeakWindow(window: window))
  }

  var liveWindows: [WindowModel] { windows.compactMap(\.window) }

  /// The window's appearance follows the theme chosen in the app's settings.
  func applyTheme(_ theme: String) {
    NSApp.appearance = theme == "light" ? NSAppearance(named: .aqua) : theme == "dark" ? NSAppearance(named: .darkAqua) : nil
  }

  // MARK: Tree

  /// The app's views, at the top of the sidebar (pseudo-paths of App.tsx; nil is the home page).
  static let views: [(path: String?, title: String, icon: String)] = [
    (nil, "Accueil", "house"),
    ("flownote:tickets", "Tickets", "ticket"),
    ("flownote:reading", "Lectures", "bookmark"),
    ("flownote:graph", "Graphe", "point.3.filled.connected.trianglepath.dotted"),
    ("flownote:docs", "Documentation", "book"),
  ]

  /// Every folder of the tree, for "Déplacer vers".
  var folders: [String] {
    var out: [String] = []
    func walk(_ entries: [VaultEntry]) {
      for entry in entries where entry.isFolder {
        out.append(entry.path)
        walk(entry.children ?? [])
      }
    }
    walk(tree)
    return out
  }

  func entry(_ path: String) -> VaultEntry? {
    func find(_ entries: [VaultEntry]) -> VaultEntry? {
      for entry in entries {
        if entry.path == path { return entry }
        if let found = find(entry.children ?? []) { return found }
      }
      return nil
    }
    return find(tree)
  }
}

struct WeakWindow {
  weak var window: WindowModel?
}
