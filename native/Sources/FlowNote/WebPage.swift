import AppKit
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

/// The page's calls to the shell (`callNative` in platform.ts): the shared
/// backend, and what only the shell can do (save panel, print panel, window).

/// Arguments handed to a background task (JSON values only).
struct Arguments: @unchecked Sendable {
  let value: [String: Any]
}
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
    guard let value = args[key] as? String else { throw Backend.Failure(message: "Paramètre manquant : \(key)") }
    return value
  }

  private func handle(_ command: String, _ args: [String: Any]) async throws -> Any? {
    switch command {
    // The backend shared with Tauri (src-tauri/core): the shell adds its vault's
    // folder, so that the page never names one.
    case "backend":
      let name = try string(args, "command")
      var arguments = args["args"] as? [String: Any] ?? [:]
      arguments["root"] = app.vault?.root.path ?? NSNull()
      // Changes on disk come back through FSEvents (AppModel reloads the tree).
      let sendable = Arguments(value: arguments)
      return try await Task.detached { try Backend.call(name, sendable.value) }.value
    case "save_export":
      return await saveExport(args)
    // WKWebView ignores window.print(): the system's print panel, on the page.
    case "print":
      window?.print(title: args["title"] as? String ?? "FlowNote")
      return nil

    // Shell.
    case "shell_state":
      // A git repository: the app shows Git (through the backend, as in Tauri).
      let root = app.vault?.root.path
      let git = await Task.detached { () -> Bool in
        guard let root, let status = try? Backend.call("git_status", ["root": root]) as? [String: Any] else { return false }
        return status["isRepo"] as? Bool ?? false
      }.value
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
      throw Backend.Failure(message: "Commande inconnue : \(command)")
    }
  }

  /// An exported file (HTML presentation, PNG mind map): saved where the user
  /// chooses, then opened. The path, or null when cancelled.
  private func saveExport(_ args: [String: Any]) async -> Any {
    guard let host = window?.webView.window else { return NSNull() }
    let panel = NSSavePanel()
    panel.nameFieldStringValue = args["fileName"] as? String ?? "Export"
    if let ext = args["extension"] as? String, let type = UTType(filenameExtension: ext) { panel.allowedContentTypes = [type] }
    panel.canCreateDirectories = true
    guard await panel.beginSheetModal(for: host) == .OK, let url = panel.url else { return NSNull() }
    // Written and opened by the backend, as in the Tauri app.
    let arguments = Arguments(value: ["path": url.path, "content": args["content"] ?? []])
    do {
      let path = url.path
      try await Task.detached { () throws -> Void in
        _ = try Backend.call("save_export", arguments.value)
        _ = try? Backend.call("open_export", ["path": path])
      }.value
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
