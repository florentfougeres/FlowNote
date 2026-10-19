import AppKit
import FlowNoteCore
import Observation
import WebKit

/// A tab of the web app, as the app reports it (`shell_update` in App.tsx).
struct ShellTab: Identifiable, Equatable {
  let id: String
  let title: String
  /// nil: the home page.
  let path: String?
  /// The page on the right of a split view.
  let split: String?
  let splitTitle: String?
  /// The pages' emoji (their `icon` property), and their kinds, for the tab's icons.
  let icon: String?
  let splitIcon: String?
  let ticket: Bool
  let presentation: Bool

  init?(_ item: [String: Any]) {
    guard let id = item["id"] as? String, let title = item["title"] as? String else { return nil }
    self.id = id
    self.title = title
    path = item["path"] as? String
    split = item["split"] as? String
    splitTitle = item["splitTitle"] as? String
    icon = item["icon"] as? String
    splitIcon = item["splitIcon"] as? String
    ticket = item["ticket"] as? Bool ?? false
    presentation = item["presentation"] as? Bool ?? false
  }
}

/// A window: one web view running the whole app (the same as the Tauri app's),
/// its tabs mirrored in the native toolbar and driven from it.
@MainActor @Observable
final class WindowModel {
  private(set) var tabs: [ShellTab] = []
  private(set) var active: String?
  private(set) var dirty = false
  private(set) var canBack = false
  private(set) var canForward = false
  private(set) var gitOpen = false
  /// Changed files, nil outside a git repository (the badge of "Git").
  private(set) var gitChanges: Int?
  /// Obsidian's bookmarks, and the pages' titles when the app shows titles rather than file names.
  private(set) var favorites: [String] = []
  private(set) var showTitles = true
  private(set) var titles: [String: String] = [:]
  /// The open page's icon and title as typed (before it is saved).
  private(set) var live: (path: String, icon: String?, title: String?)?
  /// Tickets stay in this folder, where the app numbers them.
  private(set) var ticketsFolder = "Tickets"
  /// Focus mode: no sidebar, as in the Tauri app.
  private(set) var focus = false
  /// The sidebar is shown (⌘\, the toolbar button); hidden in focus mode.
  var sidebarShown = true
  @ObservationIgnored private(set) var webView: WKWebView!
  @ObservationIgnored private var bridge: Bridge!

  init() {
    bridge = Bridge(window: self)
    webView = WebPage.make(bridge: bridge)
    AppModel.shared.register(self)
  }

  var activeTab: ShellTab? { tabs.first { $0.id == active } }

  var title: String { activeTab?.title ?? AppModel.shared.vault?.name ?? "FlowNote Swift" }

  /// The app's new state: tabs, history, unsaved changes, Git.
  func update(_ state: [String: Any]) {
    tabs = (state["tabs"] as? [[String: Any]] ?? []).compactMap(ShellTab.init)
    active = state["active"] as? String
    dirty = state["dirty"] as? Bool ?? false
    canBack = state["canBack"] as? Bool ?? false
    canForward = state["canForward"] as? Bool ?? false
    gitOpen = state["gitOpen"] as? Bool ?? false
    gitChanges = state["gitChanges"] as? Int
    favorites = state["favorites"] as? [String] ?? []
    showTitles = state["showTitles"] as? Bool ?? true
    titles = state["titles"] as? [String: String] ?? [:]
    if let live = state["live"] as? [String: Any], let path = live["path"] as? String {
      self.live = (path, live["icon"] as? String, live["title"] as? String)
    } else {
      live = nil
    }
    ticketsFolder = state["ticketsFolder"] as? String ?? "Tickets"
    let focus = state["focus"] as? Bool ?? false
    if focus != self.focus { self.focus = focus }
  }

  /// In the tickets folder: tickets are neither moved nor dropped there (Sidebar.tsx).
  func inTickets(_ path: String) -> Bool {
    !ticketsFolder.isEmpty && (path == ticketsFolder || path.hasPrefix("\(ticketsFolder)/"))
  }

  /// A page's name in the sidebar: its title (as the app shows it), else its file name without its kind.
  func title(of entry: VaultEntry) -> String {
    if let live, live.path == entry.path, showTitles, let title = live.title { return title }
    if showTitles, let title = titles[entry.path] ?? entry.title { return title }
    for suffix in [".excalidraw", ".mindmap"] where entry.name.lowercased().hasSuffix(suffix) { return String(entry.name.dropLast(suffix.count)) }
    return entry.name
  }

  /// Another vault (or none): the app starts again.
  func restart() {
    tabs = []
    active = nil
    gitChanges = nil
    webView.reload()
  }

  /// Calls the app (`window.flownoteShell.call` in App.tsx).
  func call(_ name: String, _ args: Any...) {
    let json = (try? JSONSerialization.data(withJSONObject: [name] + args, options: [.fragmentsAllowed])).map { String(decoding: $0, as: UTF8.self) } ?? "[]"
    webView.evaluateJavaScript("(function (a) { window.flownoteShell?.call(...a); })(\(json))", completionHandler: nil)
  }

  /// A sidebar action, done as the web sidebar does it (Sidebar.tsx's handlers).
  func sidebar(_ name: String, _ args: Any...) { call("sidebar", name, args) }

  /// The system's print panel on the page (its PDF menu saves a vector PDF).
  func print(title: String) {
    guard let window = webView.window else { return }
    let info = (NSPrintInfo.shared.copy() as? NSPrintInfo) ?? NSPrintInfo()
    // The page's @page rule sets the sheet and its margins.
    info.topMargin = 0
    info.bottomMargin = 0
    info.leftMargin = 0
    info.rightMargin = 0
    info.horizontalPagination = .fit
    let operation = webView.printOperation(with: info)
    operation.jobTitle = title
    operation.showsPrintPanel = true
    operation.showsProgressPanel = true
    // Without a frame, WebKit prints blank pages.
    operation.view?.frame = webView.bounds
    operation.runModal(for: window, delegate: nil, didRun: nil, contextInfo: nil)
  }
}
