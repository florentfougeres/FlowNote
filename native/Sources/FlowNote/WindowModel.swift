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

  init?(_ item: [String: Any]) {
    guard let id = item["id"] as? String, let title = item["title"] as? String else { return nil }
    self.id = id
    self.title = title
    path = item["path"] as? String
    split = item["split"] as? String
    splitTitle = item["splitTitle"] as? String
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
  }

  /// A page's name in the sidebar: its title (as the app shows it), else its file name without its kind.
  func title(of entry: VaultEntry) -> String {
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
