import CFlowNoteCore
import Foundation

/// The backend shared with the Tauri app (src-tauri/core, built by native/ffi):
/// files, Git, Grammalecte and the web requests, through the same
/// `dispatch` as Tauri's. Calls block: run them away from the main thread.
enum Backend {
  struct Failure: LocalizedError {
    let message: String
    var errorDescription: String? { message }
  }

  /// Reads the folders trusted in earlier sessions (the app's data folder).
  static func setUp() {
    let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("FlowNote Swift")
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    flownote_init(dir.path)
  }

  /// A folder the user picked: it opens even when it is not an Obsidian vault yet.
  static func trust(_ root: URL) {
    flownote_trust(root.path)
  }

  /// Runs a command; `args` as the page sends them (plus the vault's root). Returns what JSON decodes to.
  static func call(_ command: String, _ args: [String: Any]) throws -> Any {
    let data = try JSONSerialization.data(withJSONObject: args)
    guard let answer = flownote_call(command, String(decoding: data, as: UTF8.self)) else { throw Failure(message: "Réponse illisible du backend") }
    defer { flownote_free(answer) }
    let object = try JSONSerialization.jsonObject(with: Data(String(cString: answer).utf8), options: [.fragmentsAllowed]) as? [String: Any] ?? [:]
    if let error = object["error"] as? String { throw Failure(message: error) }
    return object["ok"] ?? NSNull()
  }

  /// Same, decoded to a Swift type.
  static func call<T: Decodable>(_ command: String, _ args: [String: Any], as type: T.Type) throws -> T {
    let value = try call(command, args)
    return try JSONDecoder().decode(T.self, from: JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed]))
  }

  /// Stops the Grammalecte companion.
  static func shutDown() {
    flownote_shutdown()
  }
}

/// A file or folder of the vault, as the backend lists it (`VaultEntry` in vault.rs and vault.ts).
struct VaultEntry: Decodable, Equatable, Identifiable {
  var path: String
  var name: String
  var kind: String
  var children: [VaultEntry]?
  var ticket: Bool?
  var presentation: Bool?
  var icon: String?
  var title: String?

  var id: String { path }
  var isFolder: Bool { kind == "dir" }
  /// Children for `OutlineGroup` (nil for a file, so that it shows no disclosure triangle).
  var folderChildren: [VaultEntry]? { isFolder ? children ?? [] : nil }
}

/// The vault's folder, chosen in the shell.
struct VaultFolder: Equatable {
  let root: URL
  var name: String { root.lastPathComponent }
  /// In iCloud Drive.
  var inICloud: Bool { root.path.contains("/Library/Mobile Documents/") }
}

/// iCloud Drive keeps some notes in the cloud (`.Note.md.icloud` stand-ins):
/// the shell asks for them, so that the backend finds real files.
enum ICloud {
  static func downloadMissing(in root: URL) {
    guard let walker = FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil, options: []) else { return }
    for case let url as URL in walker {
      let name = url.lastPathComponent
      if name == ".obsidian" || name == ".git" { walker.skipDescendants(); continue }
      guard name.hasPrefix("."), name.hasSuffix(".icloud") else { continue }
      let real = url.deletingLastPathComponent().appendingPathComponent(String(name.dropFirst().dropLast(7)))
      try? FileManager.default.startDownloadingUbiquitousItem(at: real)
    }
  }
}
