import AppKit
import FlowNoteCore
import Observation
import WebKit

/// A request for a name, shown as a sheet (rename, new page, `askName` from the page).
struct NameRequest: Identifiable {
  let id = UUID()
  var title: String
  var initial: String
  /// New page: the kind is chosen too.
  var kinds = false
  let done: (_ name: String?, _ kind: String) -> Void
}

/// A button of the page's toolbar (`ToolButton` in the page, see nativeTools.ts).
struct PageTool: Identifiable, Equatable {
  let id: String
  let icon: String
  let label: String
  /// A toggle's state; nil for a plain button.
  let active: Bool?
  let disabled: Bool
  /// Tools of a group (drawing tools): one is chosen.
  let group: String?

  init?(_ item: [String: Any]) {
    guard let id = item["id"] as? String, let icon = item["icon"] as? String, let label = item["label"] as? String else { return nil }
    self.id = id
    self.icon = icon
    self.label = label
    active = item["active"] as? Bool
    disabled = item["disabled"] as? Bool ?? false
    group = item["group"] as? String
  }
}

/// One tab: the page it shows, its history, and its web view.
@MainActor @Observable
final class PageModel {
  private(set) var path: String?
  private(set) var back: [String] = []
  private(set) var forward: [String] = []
  var toast: String?
  /// The page's toolbar, drawn natively.
  var tools: [PageTool] = []
  /// Unsaved changes (the dot in the window's close button).
  var dirty = false
  var nameRequest: NameRequest?
  /// The ⌘P panel is open.
  var searching = false
  @ObservationIgnored private(set) var webView: WKWebView!
  @ObservationIgnored private var bridge: Bridge!
  @ObservationIgnored private var toastTask: Task<Void, Never>?
  /// Opens a page in a new tab (set by the window's view, which can open windows).
  @ObservationIgnored var openTab: (String?) -> Void = { _ in }

  init(path: String?) {
    self.path = path
    bridge = Bridge(page: self)
    webView = WebPage.make(bridge: bridge)
    AppModel.shared.register(self)
  }

  var app: AppModel { AppModel.shared }

  var title: String {
    guard let path else { return app.vault?.name ?? "FlowNote" }
    return app.entry(path).map(app.displayName) ?? (path as NSString).lastPathComponent
  }

  // MARK: Navigation

  /// Shows a page in this tab (nil: none), remembered in the history.
  func show(_ next: String?, record: Bool = true) {
    guard next != path else { return }
    if record, let path {
      back.append(path)
      forward.removeAll()
    }
    path = next
    js("window.flownoteShell?.open(\(Self.json(next)))")
  }

  func goBack() {
    guard let previous = back.popLast() else { return }
    if let path { forward.append(path) }
    show(previous, record: false)
  }

  func goForward() {
    guard let next = forward.popLast() else { return }
    if let path { back.append(path) }
    show(next, record: false)
  }

  /// Pages renamed or moved: this tab and its history follow.
  func follow(_ renames: [String: String]) {
    back = back.map { renames[$0] ?? $0 }
    forward = forward.map { renames[$0] ?? $0 }
    if let path, let renamed = renames[path] { show(renamed, record: false) }
  }

  // MARK: Messages to the page

  func refresh() { js("window.flownoteShell?.refresh()") }

  func runTool(_ id: String) { js("window.flownoteShell?.tool(\(Self.json(id)))") }

  func sendSettings() { js("window.flownoteShell?.settings(\(Self.json(app.shellSettings)))") }

  /// Another vault: the page starts again.
  func vaultChanged() {
    path = nil
    back = []
    forward = []
    webView.reload()
  }

  /// Runs an operation of the sidebar in the page (pageOps.ts), so links follow as in the web app.
  func run(_ operation: [String: Any]) async -> (path: String?, renamed: [[String]]) {
    do {
      let result = try await webView.callAsyncJavaScript("return await window.flownoteShell.run(operation)", arguments: ["operation": operation], contentWorld: .page) as? [String: Any]
      return (result?["path"] as? String, result?["renamed"] as? [[String]] ?? [])
    } catch {
      notify(Self.message(error))
      return (nil, [])
    }
  }

  func notify(_ message: String) {
    toast = message
    toastTask?.cancel()
    toastTask = Task {
      try? await Task.sleep(for: .seconds(4))
      if !Task.isCancelled { toast = nil }
    }
  }

  /// Asks for a name in a sheet of this tab's window.
  func askName(_ title: String, initial: String, kinds: Bool = false) async -> (name: String, kind: String)? {
    await withCheckedContinuation { continuation in
      nameRequest = NameRequest(title: title, initial: initial, kinds: kinds) { name, kind in
        continuation.resume(returning: name.map { ($0, kind) })
      }
    }
  }

  private func js(_ script: String) {
    webView.evaluateJavaScript(script, completionHandler: nil)
  }

  static func json(_ value: Any?) -> String {
    guard let value, let data = try? JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed]) else { return "null" }
    return String(decoding: data, as: UTF8.self)
  }

  /// The message of an error thrown in the page (WKWebView wraps it).
  static func message(_ error: Error) -> String {
    let info = (error as NSError).userInfo
    return info["WKJavaScriptExceptionMessage"] as? String ?? error.localizedDescription
  }
}
