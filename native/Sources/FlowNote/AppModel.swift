import AppKit
import FlowNoteCore
import Observation

/// What the whole app shares: the vault, its tree, the settings, the open tabs.
@MainActor @Observable
final class AppModel {
  static let shared = AppModel()

  private(set) var vault: Vault?
  private(set) var tree: [VaultEntry] = []
  private(set) var error: String?
  @ObservationIgnored private var watcher: VaultWatcher?
  @ObservationIgnored private var reloadTask: Task<Void, Never>?
  @ObservationIgnored private var pages: [WeakPage] = []

  // Settings, kept in the user defaults and sent to every page.
  var theme: String { didSet { defaults.set(theme, forKey: "theme"); applyTheme(); sendSettings() } }
  var autosave: Bool { didSet { defaults.set(autosave, forKey: "autosave"); sendSettings() } }
  var ticketsFolder: String { didSet { defaults.set(ticketsFolder, forKey: "ticketsFolder"); sendSettings() } }
  var showTitles: Bool { didSet { defaults.set(showTitles, forKey: "showTitles") } }
  /// "grammalecte", "system" (WebKit's checker) or "off".
  var spellChecker: String { didSet { defaults.set(spellChecker, forKey: "spellChecker"); sendSettings() } }
  /// Titles of added links read from the web.
  var fetchTitles: Bool { didSet { defaults.set(fetchTitles, forKey: "fetchTitles"); sendSettings() } }
  /// Size of the pages (the web view's zoom, as ⌘+ in a browser).
  var uiScale: Double { didSet { defaults.set(uiScale, forKey: "uiScale"); for page in livePages { page.applyZoom() } } }
  /// Columns of the tickets board (`TicketColumn` in board.ts), set from the tickets view.
  var ticketColumns: [[String: String]] { didSet { defaults.set(ticketColumns, forKey: "ticketColumns"); sendSettings() } }
  var readingList: String { didSet { defaults.set(readingList, forKey: "readingList"); sendSettings() } }

  /// The vault is in a git repository, and its number of changed files (the badge of "Git").
  private(set) var isGitRepo = false
  private(set) var gitChanges = 0

  @ObservationIgnored private let defaults = UserDefaults.standard

  private init() {
    theme = defaults.string(forKey: "theme") ?? "system"
    autosave = defaults.object(forKey: "autosave") as? Bool ?? true
    ticketsFolder = defaults.string(forKey: "ticketsFolder") ?? "Tickets"
    showTitles = defaults.object(forKey: "showTitles") as? Bool ?? true
    readingList = defaults.string(forKey: "readingList") ?? "Lectures.md"
    spellChecker = defaults.string(forKey: "spellChecker") ?? "grammalecte"
    fetchTitles = defaults.object(forKey: "fetchTitles") as? Bool ?? true
    uiScale = defaults.object(forKey: "uiScale") as? Double ?? 1
    ticketColumns = defaults.array(forKey: "ticketColumns") as? [[String: String]] ?? []
    applyTheme()
    if let bookmark = defaults.data(forKey: "vaultBookmark") {
      var stale = false
      if let url = try? URL(resolvingBookmarkData: bookmark, bookmarkDataIsStale: &stale) { open(url) }
    }
  }

  /// Settings as the page reads them (`ShellSettings` in EmbedPage.tsx).
  var shellSettings: [String: Any] { ["theme": theme, "autosave": autosave, "ticketsFolder": ticketsFolder, "readingList": readingList, "spellChecker": spellChecker, "fetchTitles": fetchTitles, "ticketColumns": ticketColumns] }

  // MARK: Vault

  func open(_ url: URL) {
    let vault = Vault(root: url)
    self.vault = vault
    error = nil
    // A bookmark finds the folder again after it is moved or renamed.
    if let bookmark = try? url.bookmarkData() { defaults.set(bookmark, forKey: "vaultBookmark") }
    watcher = VaultWatcher(url: vault.root) { [weak self] in self?.scheduleReload() }
    tree = []
    reload()
    for page in livePages { page.vaultChanged() }
  }

  /// Asks for a vault folder (in iCloud Drive when asked).
  func chooseVault(inICloud: Bool = false) {
    let panel = NSOpenPanel()
    panel.canChooseDirectories = true
    panel.canChooseFiles = false
    panel.canCreateDirectories = true
    panel.prompt = "Ouvrir"
    panel.message = "Choisissez le dossier d'un vault Obsidian."
    if inICloud { panel.directoryURL = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Mobile Documents/com~apple~CloudDocs") }
    if panel.runModal() == .OK, let url = panel.url { open(url) }
  }

  /// Reads the tree again; the pages are told when it changed.
  func reload() {
    guard let vault else { return }
    Task {
      let result = await Task.detached { Result { try vault.tree() } }.value
      let git = await Task.detached { try? Git(root: vault.root).status() }.value
      guard vault.root == self.vault?.root else { return }
      isGitRepo = git?.isRepo == true
      gitChanges = git?.files.count ?? 0
      switch result {
      case .success(let tree):
        if tree != self.tree {
          self.tree = tree
          for page in livePages { page.refresh() }
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
      if !Task.isCancelled { reload() }
    }
  }

  // MARK: Tabs

  func register(_ page: PageModel) {
    pages.removeAll { $0.page == nil }
    pages.append(WeakPage(page: page))
  }

  var livePages: [PageModel] { pages.compactMap(\.page) }

  /// Pages renamed or moved: every tab follows (its page and its history).
  func follow(_ renames: [[String]]) {
    let map = Dictionary(renames.compactMap { $0.count == 2 ? ($0[0], $0[1]) : nil }, uniquingKeysWith: { a, _ in a })
    for page in livePages { page.follow(map) }
    reload()
  }

  /// A page or folder was deleted: the tabs showing it become empty.
  func closePages(under path: String) {
    for page in livePages where page.path == path || page.path?.hasPrefix("\(path)/") == true || page.path?.hasPrefix("\(Self.subpageFolder(path))/") == true {
      page.show(nil)
    }
    reload()
  }

  private func sendSettings() {
    for page in livePages { page.sendSettings() }
  }

  private func applyTheme() {
    NSApp?.appearance = theme == "light" ? NSAppearance(named: .aqua) : theme == "dark" ? NSAppearance(named: .darkAqua) : nil
  }

  /// Folder of a page's sub-pages (`subpageFolder` in links.ts): its path without the extension.
  static func subpageFolder(_ path: String) -> String {
    for suffix in [".excalidraw.md", ".mindmap.md", ".md", ".base"] where path.hasSuffix(suffix) { return String(path.dropLast(suffix.count)) }
    return path
  }

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

  /// The app's views, shown in a tab like a page (ShellView.tsx).
  static let views: [(path: String, title: String, icon: String)] = [
    ("flownote:home", "Accueil", "house"),
    ("flownote:tickets", "Tickets", "ticket"),
    ("flownote:graph", "Graphe", "point.3.filled.connected.trianglepath.dotted"),
    ("flownote:reading", "Lectures", "bookmark"),
    ("flownote:git", "Git", "arrow.triangle.branch"),
    ("flownote:docs", "Documentation", "book"),
  ]

  func displayName(_ entry: VaultEntry) -> String {
    if showTitles, let title = entry.title { return title }
    // A drawing or a mind map is named without its kind (`noteTitle` in links.ts).
    for suffix in [".excalidraw", ".mindmap"] where entry.name.lowercased().hasSuffix(suffix) { return String(entry.name.dropLast(suffix.count)) }
    return entry.name
  }
}

struct WeakPage {
  weak var page: PageModel?
}
