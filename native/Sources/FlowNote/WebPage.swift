import AppKit
import FlowNoteCore
import UniformTypeIdentifiers
import WebKit

enum WebPage {
  /// The web app: built into the bundle (`Resources/web`), or a folder given by
  /// FLOWNOTE_WEB_DIR, or Vite's dev server given by FLOWNOTE_DEV_URL.
  static var startURL: URL {
    if let dev = ProcessInfo.processInfo.environment["FLOWNOTE_DEV_URL"], let url = URL(string: dev)?.appendingPathComponent("embed.html") { return url }
    return URL(string: "flownote://app/embed.html")!
  }

  static func make(bridge: Bridge) -> WKWebView {
    let configuration = WKWebViewConfiguration()
    configuration.setURLSchemeHandler(SchemeHandler(), forURLScheme: "flownote")
    configuration.userContentController.addScriptMessageHandler(bridge, contentWorld: .page, name: "flownote")
    configuration.preferences.isElementFullscreenEnabled = true
    let webView = WKWebView(frame: .zero, configuration: configuration)
    webView.isInspectable = true
    webView.uiDelegate = bridge
    webView.navigationDelegate = bridge
    // No white flash before the page draws its own background.
    webView.underPageBackgroundColor = .windowBackgroundColor
    webView.setValue(false, forKey: "drawsBackground")
    webView.load(URLRequest(url: startURL))
    return webView
  }
}

/// Serves the built web app from `flownote://app/…`, never outside its folder.
final class SchemeHandler: NSObject, WKURLSchemeHandler {
  private let base: URL = {
    if let dir = ProcessInfo.processInfo.environment["FLOWNOTE_WEB_DIR"] { return URL(fileURLWithPath: dir) }
    return Bundle.main.resourceURL!.appendingPathComponent("web")
  }().standardizedFileURL

  func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
    guard let url = task.request.url else { return }
    let relative = url.path.isEmpty || url.path == "/" ? "embed.html" : String(url.path.dropFirst())
    let file = base.appendingPathComponent(relative).standardizedFileURL
    guard file.path.hasPrefix(base.path + "/"), let data = try? Data(contentsOf: file) else {
      task.didReceive(HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: nil)!)
      task.didFinish()
      return
    }
    let ext = file.pathExtension.lowercased()
    let mime = ext == "js" || ext == "mjs" ? "text/javascript" : ext == "wasm" ? "application/wasm" : UTType(filenameExtension: ext)?.preferredMIMEType ?? "application/octet-stream"
    let headers = ["Content-Type": mime, "Content-Length": String(data.count), "Access-Control-Allow-Origin": "*"]
    task.didReceive(HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers)!)
    task.didReceive(data)
    task.didFinish()
  }

  func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

/// The page's calls to the shell (`callNative` in nativeVault.ts): the vault's
/// files, and what only the shell can do (tabs, dialogs, notices).
@MainActor
final class Bridge: NSObject, WKScriptMessageHandlerWithReply, WKUIDelegate, WKNavigationDelegate {
  private weak var page: PageModel?

  init(page: PageModel) {
    self.page = page
  }

  private var app: AppModel { AppModel.shared }

  func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) async -> (Any?, String?) {
    guard let body = message.body as? [String: Any], let command = body["command"] as? String else { return (nil, "Message invalide") }
    let args = body["args"] as? [String: Any] ?? [:]
    do {
      return (try await handle(command, args), nil)
    } catch {
      return (nil, error.localizedDescription)
    }
  }

  private func string(_ args: [String: Any], _ key: String) throws -> String {
    guard let value = args[key] as? String else { throw VaultError("Paramètre manquant : \(key)") }
    return value
  }

  /// Runs file work away from the main thread; returns what JavaScript receives.
  private func off(_ work: @escaping @Sendable (Vault) throws -> Any?) async throws -> Any? {
    guard let vault = app.vault else { throw VaultError("Aucun vault ouvert.") }
    let result = await Task.detached { Result { try work(vault) } }.value
    return try result.get().map(Self.sendable) ?? NSNull()
  }

  /// Codable values become JSON objects for WebKit.
  private static func sendable(_ value: Any) -> Any {
    if let value = value as? Encodable, !(value is String), let data = try? JSONEncoder().encode(value) {
      return (try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])) ?? NSNull()
    }
    return value
  }

  private func handle(_ command: String, _ args: [String: Any]) async throws -> Any? {
    switch command {
    // Vault (same commands as src-tauri/src/vault.rs).
    case "vault_tree": return try await off { try $0.tree() }
    case "vault_files": return try await off { $0.files() }
    case "vault_read":
      let path = try string(args, "path")
      return try await off { try $0.read(path) }
    case "vault_read_binary":
      let path = try string(args, "path")
      return try await off { try $0.readBinary(path).base64EncodedString() }
    case "vault_write":
      let path = try string(args, "path"), content = try string(args, "content")
      let expected = args["expected"] as? String
      defer { app.scheduleReload() }
      return try await off { try $0.write(path, content, expected: expected) }
    case "vault_create":
      let path = try string(args, "path")
      guard let data = Data(base64Encoded: try string(args, "base64")) else { throw VaultError("Contenu invalide.") }
      defer { app.scheduleReload() }
      return try await off { try $0.create(path, data) }
    case "vault_create_dir":
      let path = try string(args, "path")
      defer { app.scheduleReload() }
      return try await off { try $0.createFolder(path) }
    case "vault_rename":
      let from = try string(args, "from"), to = try string(args, "to")
      defer { app.scheduleReload() }
      return try await off { try $0.rename(from, to) }
    case "vault_trash":
      let path = try string(args, "path")
      defer { app.scheduleReload() }
      return try await off { try $0.trash(path) }
    case "vault_reveal":
      guard let url = try app.vault?.resolve(try string(args, "path")) else { return nil }
      NSWorkspace.shared.activateFileViewerSelecting([url])
      return nil
    case "vault_config": return try await off { $0.obsidianConfig() }
    case "vault_bookmarks": return try await off { $0.bookmarks() }
    case "vault_read_notes": return try await off { $0.readNotes() }
    case "vault_stats": return try await off { $0.stats() }
    case "vault_search":
      let query = try string(args, "query")
      let caseSensitive = args["caseSensitive"] as? Bool ?? false
      let limit = args["limit"] as? Int ?? 200
      return try await off { $0.search(query, caseSensitive: caseSensitive, limit: limit) }

    // Shell.
    case "shell_state":
      return ["vaultName": app.vault?.name ?? "", "path": page?.path ?? NSNull(), "settings": app.shellSettings] as [String: Any]
    case "open_path":
      let path = try string(args, "path")
      if args["newTab"] as? Bool == true { page?.openTab(path) } else { page?.show(path) }
      return nil
    case "ask_name":
      let answer = await page?.askName(try string(args, "title"), initial: args["initial"] as? String ?? "")
      return answer?.name ?? NSNull()
    case "notify":
      page?.notify(try string(args, "message"))
      return nil
    case "toggle_sidebar":
      NSApp.sendAction(#selector(NSSplitViewController.toggleSidebar(_:)), to: nil, from: nil)
      return nil
    case "toolbar":
      page?.tools = (args["items"] as? [[String: Any]] ?? []).compactMap(PageTool.init)
      return nil
    case "page_status":
      page?.dirty = args["dirty"] as? Bool ?? false
      if let status = args["status"] as? String, !status.isEmpty { page?.notify(status) }
      return nil
    case "pages_moved":
      app.follow(args["renames"] as? [[String]] ?? [])
      return nil
    default:
      throw VaultError("Commande inconnue : \(command)")
    }
  }

  // MARK: Web links go to the browser

  func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
    if let url = action.request.url, ["http", "https", "mailto"].contains(url.scheme?.lowercased()) { NSWorkspace.shared.open(url) }
    return nil
  }

  func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
    guard let url = action.request.url else { return .cancel }
    // The app itself (built or dev server) loads; links leave for the browser.
    if url.scheme == "flownote" || url.scheme == "blob" || url.scheme == "about" || url.host == WebPage.startURL.host && url.port == WebPage.startURL.port { return .allow }
    if action.navigationType == .linkActivated || action.targetFrame?.isMainFrame == true { NSWorkspace.shared.open(url) }
    return .cancel
  }
}
