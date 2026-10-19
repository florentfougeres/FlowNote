import AppKit
import FlowNoteCore
import UniformTypeIdentifiers
import WebKit

enum WebPage {
  /// The web app: built into the bundle (`Resources/web`), or a folder given by
  /// FLOWNOTE_WEB_DIR, or Vite's dev server given by FLOWNOTE_DEV_URL.
  static var startURL: URL {
    if let dev = ProcessInfo.processInfo.environment["FLOWNOTE_DEV_URL"], let url = URL(string: dev)?.appendingPathComponent("index.html") { return url }
    return URL(string: "flownote://app/index.html")!
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
    let relative = url.path.isEmpty || url.path == "/" ? "index.html" : String(url.path.dropFirst())
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
  private weak var window: WindowModel?

  init(window: WindowModel) {
    self.window = window
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

  /// Codable values become JSON objects for WebKit; a command returning nothing (Void) answers null.
  private static func sendable(_ value: Any) -> Any {
    if value is Void { return NSNull() }
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

    // Git (same commands as src-tauri/src/git.rs), in the vault folder.
    case let git where git.hasPrefix("git_"):
      return try await handleGit(git, args)

    case "save_export":
      return await saveExport(args)
    case "fetch_page_title":
      return await WebTitle.fetch(try string(args, "url")) ?? NSNull()
    case "open_url":
      let address = try string(args, "url")
      guard WebTitle.isWebURL(address) || address.lowercased().hasPrefix("mailto:"), let url = URL(string: address) else { throw VaultError("Lien refusé : \(address)") }
      NSWorkspace.shared.open(url)
      return nil
    case "print":
      window?.print(title: args["title"] as? String ?? "FlowNote")
      return nil
    case "grammar_check":
      return try await Grammar.shared.check(args["paragraphs"] as? [String] ?? [])

    // Shell.
    case "shell_state":
      let git = await Task.detached { [root = app.vault?.root] in root.map { (try? Git(root: $0).status())?.isRepo == true } ?? false }.value
      return [
        "vaultName": app.vault?.name ?? "",
        "git": git,
        "recent": app.recentVaults.map(\.path),
        "open": ProcessInfo.processInfo.environment["FLOWNOTE_OPEN"] ?? NSNull(),
      ] as [String: Any]
    case "shell_update":
      window?.update(args)
      return nil
    case "appearance":
      app.applyTheme(args["theme"] as? String ?? "system")
      window?.webView.pageZoom = args["scale"] as? Double ?? 1
      return nil
    case "toggle_sidebar":
      window?.sidebarShown.toggle()
      return nil
    case "log_frontend":
      NSLog("FlowNote (page) : %@", args["message"] as? String ?? "")
      return nil
    case "choose_vault":
      app.chooseVault()
      return nil
    case "open_vault":
      app.open(URL(fileURLWithPath: try string(args, "path")))
      return nil
    case "forget_vault":
      app.forget(URL(fileURLWithPath: try string(args, "path")))
      return nil
    case "close_vault":
      app.close()
      return nil
    default:
      throw VaultError("Commande inconnue : \(command)")
    }
  }

  private func handleGit(_ command: String, _ args: [String: Any]) async throws -> Any? {
    let paths = args["paths"] as? [String] ?? []
    let path = args["path"] as? String ?? ""
    let changes: Set<String> = ["git_stage", "git_unstage", "git_discard", "git_commit", "git_pull", "git_resolve", "git_merge_continue", "git_merge_abort"]
    defer { if changes.contains(command) { app.scheduleReload() } }
    return try await off { vault in
      let git = Git(root: vault.root)
      switch command {
      case "git_status": return try git.status()
      case "git_diff": return try git.diff(path, staged: args["staged"] as? Bool ?? false, untracked: args["untracked"] as? Bool ?? false)
      case "git_stage": try git.stage(paths)
      case "git_unstage": try git.unstage(paths)
      case "git_discard": try git.discard(paths)
      case "git_commit": return try git.commit(args["message"] as? String ?? "")
      case "git_fetch": try git.fetch()
      case "git_pull": return try git.pull()
      case "git_push": return try git.push()
      case "git_activity": return try git.activity(days: args["days"] as? Int ?? 365)
      case "git_last_commit": return try git.lastCommit() ?? NSNull()
      case "git_log": return try git.log(path, limit: args["limit"] as? Int ?? 200)
      case "git_show": return try git.show(args["hash"] as? String ?? "", path)
      case "git_conflict": return try git.conflict(path)
      case "git_resolve": try git.resolve(path, args["content"] as? String)
      case "git_merge_continue": return try git.continueMerge()
      case "git_merge_abort": try git.abortMerge()
      default: throw VaultError("Commande inconnue : \(command)")
      }
      return nil
    }
  }

  /// An exported file (HTML presentation, PNG mind map): saved where the user
  /// chooses, then opened. The path, or null when cancelled.
  private func saveExport(_ args: [String: Any]) async -> Any {
    guard let data = Data(base64Encoded: args["base64"] as? String ?? ""), let host = window?.webView.window else { return NSNull() }
    let panel = NSSavePanel()
    panel.nameFieldStringValue = args["fileName"] as? String ?? "Export"
    if let ext = args["extension"] as? String, let type = UTType(filenameExtension: ext) { panel.allowedContentTypes = [type] }
    panel.canCreateDirectories = true
    guard await panel.beginSheetModal(for: host) == .OK, let url = panel.url else { return NSNull() }
    do {
      try data.write(to: url, options: .atomic)
      NSWorkspace.shared.open(url)
      return url.path
    } catch {
      return NSNull()
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
    if url.scheme == "flownote" || url.scheme == "blob" || url.scheme == "about" || url.scheme == "data" || url.host == WebPage.startURL.host && url.port == WebPage.startURL.port { return .allow }
    if action.navigationType == .linkActivated || action.targetFrame?.isMainFrame == true { NSWorkspace.shared.open(url) }
    return .cancel
  }
}
