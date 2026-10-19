import Foundation

/// A file or folder of the vault, as the web app expects it (`VaultEntry` in vault.ts).
public struct VaultEntry: Codable, Equatable, Identifiable, Sendable {
  public var path: String
  public var name: String
  public var kind: String
  public var children: [VaultEntry]?
  public var ticket: Bool?
  public var presentation: Bool?
  public var icon: String?
  public var title: String?
  /// Still in iCloud (not downloaded yet): its download has been asked for.
  public var cloud: Bool?

  public init(path: String, name: String, kind: String, children: [VaultEntry]? = nil, ticket: Bool? = nil, presentation: Bool? = nil, icon: String? = nil, title: String? = nil, cloud: Bool? = nil) {
    self.path = path
    self.name = name
    self.kind = kind
    self.children = children
    self.ticket = ticket
    self.presentation = presentation
    self.icon = icon
    self.title = title
    self.cloud = cloud
  }

  public var id: String { path }
  public var isFolder: Bool { kind == "dir" }
  /// Children for `OutlineGroup` (nil for a file, so that it shows no disclosure triangle).
  public var folderChildren: [VaultEntry]? { isFolder ? children ?? [] : nil }
}

public struct VaultError: LocalizedError, Sendable {
  public let message: String
  public init(_ message: String) { self.message = message }
  public var errorDescription: String? { message }
}

/// Lines of a note containing the searched text.
public struct SearchFile: Codable, Sendable {
  public var path: String
  /// (0-based line number, line text), encoded as two-element arrays.
  public var lines: [[SearchLine]]
}

public enum SearchLine: Codable, Sendable {
  case number(Int)
  case text(String)
  public func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .number(let n): try container.encode(n)
    case .text(let t): try container.encode(t)
    }
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    if let n = try? container.decode(Int.self) { self = .number(n) } else { self = .text(try container.decode(String.self)) }
  }
}

public struct FileStat: Codable, Sendable {
  public var path: String
  public var ctime: Double
  public var mtime: Double
}

/// The vault folder chosen in the shell. Paths received from the page are
/// relative to it; hidden entries (`.obsidian`, `.git`, `.trash`, ...) are never
/// listed, read or written, and `.obsidian` is only ever read. Reads and writes
/// are coordinated (NSFileCoordinator), as iCloud Drive and other sync clients expect.
public struct Vault: Sendable {
  public let root: URL

  public init(root: URL) {
    self.root = root.standardizedFileURL
  }

  public var name: String { root.lastPathComponent }

  /// The vault is in iCloud Drive.
  public var inICloud: Bool { root.path.contains("/Library/Mobile Documents/") }

  // MARK: Paths

  static func isHidden(_ name: String) -> Bool {
    name.hasPrefix(".") || name == "node_modules"
  }

  /// `.Note.md.icloud`, iCloud's stand-in for a file not downloaded yet: the name of that file.
  static func cloudPlaceholder(_ name: String) -> String? {
    guard name.hasPrefix("."), name.hasSuffix(".icloud"), name.count > 8 else { return nil }
    return String(name.dropFirst().dropLast(7))
  }

  /// Resolves a vault-relative path, refusing anything that escapes the root or
  /// goes through a hidden folder.
  public func resolve(_ relative: String) throws -> URL {
    let parts = relative.split(separator: "/", omittingEmptySubsequences: false)
    guard !relative.isEmpty, !relative.hasPrefix("/"), parts.allSatisfy({ !$0.isEmpty && $0 != "." && $0 != ".." && !Self.isHidden(String($0)) }) else {
      throw VaultError("Chemin refusé : \(relative)")
    }
    return parts.reduce(root) { $0.appendingPathComponent(String($1)) }
  }

  private var fm: FileManager { FileManager.default }

  private func exists(_ url: URL) -> Bool { fm.fileExists(atPath: url.path) }

  private func isDirectory(_ url: URL) -> Bool {
    var dir: ObjCBool = false
    return fm.fileExists(atPath: url.path, isDirectory: &dir) && dir.boolValue
  }

  // MARK: Coordinated access

  private func coordinatedRead<T>(_ url: URL, _ body: (URL) throws -> T) throws -> T {
    var coordinationError: NSError?
    var result: Result<T, Error>?
    NSFileCoordinator().coordinate(readingItemAt: url, options: [], error: &coordinationError) { url in
      result = Result { try body(url) }
    }
    if let coordinationError { throw coordinationError }
    return try result!.get()
  }

  private func coordinatedWrite<T>(_ url: URL, options: NSFileCoordinator.WritingOptions = [], _ body: (URL) throws -> T) throws -> T {
    var coordinationError: NSError?
    var result: Result<T, Error>?
    NSFileCoordinator().coordinate(writingItemAt: url, options: options, error: &coordinationError) { url in
      result = Result { try body(url) }
    }
    if let coordinationError { throw coordinationError }
    return try result!.get()
  }

  /// Asks iCloud for a file that is only a placeholder; the coordinated read then waits for it.
  private func download(_ url: URL) {
    let placeholder = url.deletingLastPathComponent().appendingPathComponent(".\(url.lastPathComponent).icloud")
    if !exists(url), exists(placeholder) { try? fm.startDownloadingUbiquitousItem(at: url) }
  }

  /// Bytes of a file, downloaded from iCloud first if needed.
  func data(_ url: URL) throws -> Data {
    download(url)
    return try coordinatedRead(url) { try Data(contentsOf: $0) }
  }

  /// UTF-8 text, kept exactly (byte order mark included); invalid UTF-8 is an error, as in Rust.
  static func text(_ data: Data, _ path: String) throws -> String {
    guard let text = String(validating: data, as: UTF8.self) else { throw VaultError("\(path): le fichier n'est pas du texte UTF-8.") }
    return text
  }

  // MARK: Tree

  /// The beginning of a file, enough for its front matter and first line.
  static func head(_ url: URL) -> String {
    guard let handle = try? FileHandle(forReadingFrom: url) else { return "" }
    defer { try? handle.close() }
    let bytes = (try? handle.read(upToCount: 4096)) ?? Data()
    var text = String(decoding: bytes, as: UTF8.self)
    if text.hasPrefix("\u{FEFF}") { text.removeFirst() }
    return text
  }

  /// Front matter and body of a file's beginning.
  static func splitFrontMatter(_ text: String) -> (yaml: String?, body: Substring) {
    guard text.hasPrefix("---") else { return (nil, text[...]) }
    let rest = text.dropFirst(3)
    guard let end = rest.range(of: "\n---") else { return (nil, text[...]) }
    let after = rest[end.upperBound...]
    let body = after.firstIndex(of: "\n").map { after[after.index(after: $0)...] } ?? ""
    return (String(rest[..<end.lowerBound]), body)
  }

  /// Value of a top-level `key: value` line of the front matter, unquoted.
  static func property(_ yaml: String, _ key: String) -> String? {
    for raw in yaml.split(separator: "\n", omittingEmptySubsequences: false) {
      var line = Substring(raw)
      while line.hasSuffix("\r") { line = line.dropLast() }
      guard line.hasPrefix(key) else { continue }
      let afterKey = line.dropFirst(key.count).drop(while: { $0.isWhitespace })
      guard afterKey.hasPrefix(":") else { continue }
      let value = afterKey.dropFirst().trimmingCharacters(in: .whitespaces)
      return value.trimmingCharacters(in: CharacterSet(charactersIn: "\"'"))
    }
    return nil
  }

  /// The `icon` property when it is an emoji (not a plugin icon name like "LiHome").
  static func icon(_ yaml: String) -> String? {
    guard let value = property(yaml, "icon"), !value.isEmpty, value.count <= 16, !value.allSatisfy(\.isASCII) else { return nil }
    return value
  }

  /// A page's title (see `pageTitle` in icon.ts): a plain note's first line when it is
  /// a `# heading`, the `title` property for the other kinds.
  static func title(yaml: String?, body: Substring, plainNote: Bool) -> String? {
    guard plainNote else {
      return yaml.flatMap { property($0, "title") }.flatMap { $0.isEmpty ? nil : $0 }
    }
    let lines = body.split(separator: "\n", omittingEmptySubsequences: false).map { $0.hasSuffix("\r") ? $0.dropLast() : $0 }
    guard let first = lines.first(where: { !$0.trimmingCharacters(in: .whitespaces).isEmpty }) else { return nil }
    let start = first.drop(while: { $0 == " " })
    guard start.hasPrefix("# ") else { return nil }
    var text = start.dropFirst(2).trimmingCharacters(in: .whitespaces)
    while text.hasSuffix("#") { text.removeLast() }
    text = text.trimmingCharacters(in: .whitespaces)
    // [[target|label]] shows its label, [[target]] its target; emphasis marks go.
    var plain = ""
    var rest = Substring(text)
    while let open = rest.range(of: "[[") {
      plain += rest[..<open.lowerBound]
      guard let close = rest[open.upperBound...].range(of: "]]") else {
        rest = rest[open.lowerBound...]
        break
      }
      let link = rest[open.upperBound..<close.lowerBound]
      plain += link.firstIndex(of: "|").map { link[link.index(after: $0)...] } ?? link
      rest = rest[close.upperBound...]
    }
    plain += rest
    let cleaned = plain.filter { !"*_`~=".contains($0) }.trimmingCharacters(in: .whitespaces)
    return cleaned.isEmpty ? nil : cleaned
  }

  /// A folder with nothing visible in it (hidden files such as `.DS_Store` aside).
  private func isEmptyDir(_ url: URL) -> Bool {
    ((try? fm.contentsOfDirectory(atPath: url.path)) ?? []).allSatisfy(Self.isHidden)
  }

  private func list(_ dir: URL, _ prefix: String) throws -> [VaultEntry] {
    var entries: [VaultEntry] = []
    for name in try fm.contentsOfDirectory(atPath: dir.path) {
      let url = dir.appendingPathComponent(name)
      if let real = Self.cloudPlaceholder(name) {
        // Not downloaded yet: shown under its name, downloaded in the background.
        guard real.hasSuffix(".md") || real.hasSuffix(".base"), !exists(dir.appendingPathComponent(real)) else { continue }
        try? fm.startDownloadingUbiquitousItem(at: dir.appendingPathComponent(real))
        let path = prefix.isEmpty ? real : "\(prefix)/\(real)"
        let stem = real.hasSuffix(".md") ? String(real.dropLast(3)) : String(real.dropLast(5))
        entries.append(VaultEntry(path: path, name: stem, kind: "file", cloud: true))
        continue
      }
      if Self.isHidden(name) { continue }
      let path = prefix.isEmpty ? name : "\(prefix)/\(name)"
      if isDirectory(url) {
        let children = try list(url, path)
        // An empty folder is shown (just created); one holding only attachments is not.
        if !children.isEmpty || isEmptyDir(url) { entries.append(VaultEntry(path: path, name: name, kind: "dir", children: children)) }
      } else if name.hasSuffix(".md") {
        let (yaml, body) = Self.splitFrontMatter(Self.head(url))
        let ticket = yaml.map { Self.property($0, "type") == "ticket" } ?? false
        let presentation = yaml.map { Self.property($0, "marp") == "true" } ?? false
        let lower = name.lowercased()
        let plainNote = !ticket && !presentation && !lower.hasSuffix(".excalidraw.md") && !lower.hasSuffix(".mindmap.md")
        entries.append(VaultEntry(
          path: path, name: String(name.dropLast(3)), kind: "file",
          ticket: ticket ? true : nil, presentation: presentation ? true : nil,
          icon: yaml.flatMap(Self.icon), title: Self.title(yaml: yaml, body: body, plainNote: plainNote)))
      } else if name.hasSuffix(".base") {
        // A base (Obsidian's format): shown as a page whose rows are its folder's notes.
        entries.append(VaultEntry(path: path, name: String(name.dropLast(5)), kind: "file"))
      }
    }
    return entries.sorted { a, b in
      if a.isFolder != b.isFolder { return a.isFolder }
      return a.name.lowercased() < b.name.lowercased()
    }
  }

  public func tree() throws -> [VaultEntry] {
    try list(root, "")
  }

  private func collectFiles(_ dir: URL, _ prefix: String, _ out: inout [String]) {
    for name in (try? fm.contentsOfDirectory(atPath: dir.path)) ?? [] {
      if let real = Self.cloudPlaceholder(name) {
        if !exists(dir.appendingPathComponent(real)) { out.append(prefix.isEmpty ? real : "\(prefix)/\(real)") }
        continue
      }
      if Self.isHidden(name) { continue }
      let path = prefix.isEmpty ? name : "\(prefix)/\(name)"
      let url = dir.appendingPathComponent(name)
      if isDirectory(url) { collectFiles(url, path, &out) } else { out.append(path) }
    }
  }

  /// Every non-hidden file of the vault (notes and attachments), for link resolution.
  public func files() -> [String] {
    var out: [String] = []
    collectFiles(root, "", &out)
    return out.sorted()
  }

  // MARK: Reading and writing

  public func read(_ path: String) throws -> String {
    let url = try resolve(path)
    do { return try Self.text(try data(url), path) } catch let error as VaultError { throw error } catch { throw VaultError("\(path): \(error.localizedDescription)") }
  }

  public func readBinary(_ path: String) throws -> Data {
    let url = try resolve(path)
    do { return try data(url) } catch { throw VaultError("\(path): \(error.localizedDescription)") }
  }

  /// Writes `content` only if the file still holds `expected` (byte for byte);
  /// the error message starts with `CONFLICT:` otherwise. Atomic: a temporary
  /// file then a rename, so that Obsidian or iCloud never see a partial file.
  public func write(_ path: String, _ content: String, expected: String?) throws {
    let url = try resolve(path)
    download(url)
    try coordinatedWrite(url, options: .forReplacing) { url in
      if let expected {
        let current = (try? Data(contentsOf: url)) ?? Data()
        if current != Data(expected.utf8) { throw VaultError("CONFLICT:\(path) a été modifié en dehors de l'application.") }
      }
      try fm.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
      try Data(content.utf8).write(to: url, options: .atomic)
    }
  }

  /// Creates a new file; never overwrites an existing one.
  public func create(_ path: String, _ content: Data) throws {
    let url = try resolve(path)
    try coordinatedWrite(url) { url in
      try fm.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
      do { try content.write(to: url, options: .withoutOverwriting) } catch { throw VaultError("\(path) existe déjà.") }
    }
  }

  /// Creates an empty folder; never takes the place of an existing file or folder.
  public func createFolder(_ path: String) throws {
    let url = try resolve(path)
    if exists(url) { throw VaultError("\(path) existe déjà.") }
    try fm.createDirectory(at: url, withIntermediateDirectories: true)
  }

  /// Renames a note or a folder; never overwrites an existing path (case-only renames are allowed).
  public func rename(_ from: String, _ to: String) throws {
    let source = try resolve(from)
    let target = try resolve(to)
    guard exists(source) else { throw VaultError("\(from) n'existe pas.") }
    if exists(target), from.lowercased() != to.lowercased() { throw VaultError("\(to) existe déjà.") }
    try fm.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
    var coordinationError: NSError?
    var failure: Error?
    NSFileCoordinator().coordinate(writingItemAt: source, options: .forMoving, writingItemAt: target, options: .forReplacing, error: &coordinationError) { source, target in
      // rename(2): a case-only rename works on case-insensitive volumes.
      if Darwin.rename(source.path, target.path) != 0 { failure = VaultError("\(from) : \(String(cString: strerror(errno)))") }
    }
    if let error = coordinationError ?? failure { throw error }
  }

  /// Moves a note or folder to the trash (recoverable). Already gone: nothing to do.
  public func trash(_ path: String) throws {
    let url = try resolve(path)
    guard exists(url) else { return }
    try coordinatedWrite(url, options: .forDeleting) { url in
      try fm.trashItem(at: url, resultingItemURL: nil)
    }
  }

  // MARK: Obsidian settings (read only)

  private func obsidianFile(_ name: String) -> String {
    let url = root.appendingPathComponent(".obsidian").appendingPathComponent(name)
    return (try? coordinatedRead(url) { try String(contentsOf: $0, encoding: .utf8) }) ?? "{}"
  }

  /// `.obsidian/app.json`, "{}" when absent.
  public func obsidianConfig() -> String { obsidianFile("app.json") }

  /// `.obsidian/bookmarks.json`, "{}" when absent.
  public func bookmarks() -> String { obsidianFile("bookmarks.json") }

  // MARK: Whole-vault reads

  private func notes() -> [String] { files().filter { $0.hasSuffix(".md") } }

  /// Every note with its content (dashboard statistics); notes over 1 MB are skipped.
  public func readNotes() -> [[String]] {
    notes().compactMap { path in
      let url = root.appendingPathComponent(path)
      let size = (try? fm.attributesOfItem(atPath: url.path)[.size] as? Int) ?? Int.max
      guard size <= 1_000_000, let text = try? Self.text(Data(contentsOf: url), path) else { return nil }
      return [path, text]
    }
  }

  /// Creation and modification times of the notes (ms since 1970).
  public func stats() -> [FileStat] {
    notes().compactMap { path in
      guard let attributes = try? fm.attributesOfItem(atPath: root.appendingPathComponent(path).path) else { return nil }
      let mtime = ((attributes[.modificationDate] as? Date)?.timeIntervalSince1970 ?? 0) * 1000
      let ctime = ((attributes[.creationDate] as? Date)?.timeIntervalSince1970 ?? 0) * 1000
      return FileStat(path: path, ctime: ctime > 0 ? ctime : mtime, mtime: mtime)
    }
  }

  /// Lines of every note containing `query` (case-insensitive unless asked), at most `limit` in total.
  public func search(_ query: String, caseSensitive: Bool, limit: Int) -> [SearchFile] {
    let needle = caseSensitive ? query : query.lowercased()
    guard !needle.isEmpty else { return [] }
    var results: [SearchFile] = []
    var total = 0
    for path in notes() {
      guard let data = try? Data(contentsOf: root.appendingPathComponent(path)), let text = String(validating: data, as: UTF8.self) else { continue }
      var lines: [[SearchLine]] = []
      for (n, raw) in text.split(separator: "\n", omittingEmptySubsequences: false).enumerated() where total + lines.count < limit {
        let line = raw.hasSuffix("\r") ? String(raw.dropLast()) : String(raw)
        if (caseSensitive ? line : line.lowercased()).contains(needle) { lines.append([.number(n), .text(line)]) }
      }
      total += lines.count
      if !lines.isEmpty { results.append(SearchFile(path: path, lines: lines)) }
      if total >= limit { break }
    }
    return results
  }
}
